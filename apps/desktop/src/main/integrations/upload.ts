/**
 * Real upload pipeline against @huggingface/hub: walk the folder, create the repo,
 * then stream `commitIter` generator events out through `evt:upload`. Every SDK
 * call gets the configured hub endpoint and proxied fetch so uploads ride the
 * same network path as the rest of the app.
 */
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DEFAULT_ENDPOINT } from '@oh-my-huggingface/hub-api'
import type {
  RepoKind,
  UploadProgress,
  UploadRequest,
  UploadResult
} from '@oh-my-huggingface/shared'
import { createProxiedFetch, getHubNetworkOptions } from '../hub'
import type { UploadDeps } from './types'
import { notifyDone } from './notify'

const SKIP_NAMES = new Set(['.git', 'node_modules', '.DS_Store'])
const MAX_FILES = 10_000
/** Progress events are throttled so a large upload does not flood the IPC channel. */
const EMIT_INTERVAL_MS = 100

const REPO_URL_PREFIX: Record<RepoKind, string> = {
  model: '',
  dataset: 'datasets/',
  space: 'spaces/'
}

class TooManyFilesError extends Error {}

interface WalkedFile {
  /** posix-style path relative to the upload root — becomes the path in the repo */
  rel: string
  abs: string
  size: number
}

async function walkFolder(root: string): Promise<WalkedFile[]> {
  const out: WalkedFile[] = []
  const visit = async (dir: string, relPrefix: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (SKIP_NAMES.has(entry.name) || entry.isSymbolicLink()) continue
      const abs = join(dir, entry.name)
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await visit(abs, rel)
      } else if (entry.isFile()) {
        const stat = await fs.stat(abs)
        out.push({ rel, abs, size: stat.size })
        if (out.length > MAX_FILES) throw new TooManyFilesError()
      }
    }
  }
  await visit(root, '')
  return out
}

function trimError(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).trim().slice(0, 200)
}

/** SDK-facing hub URL: the configured endpoint (sans trailing slash) or the default. */
export function resolveHubUrl(endpoint: string | null): string {
  return (endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, '')
}

/** Repo page URL on the active hub endpoint. */
export function buildRepoUrl(hubUrl: string, kind: RepoKind, repoName: string): string {
  return `${hubUrl}/${REPO_URL_PREFIX[kind]}${repoName}`
}

export async function createRepoAndUpload(
  request: UploadRequest,
  deps: UploadDeps
): Promise<UploadResult> {
  const { accessToken, username, broadcast } = deps
  if (!accessToken || !username) {
    return { ok: false, messageKey: 'upload.signInFirst' }
  }

  const emit = (progress: UploadProgress): void => broadcast('evt:upload', progress)
  const failWith = (
    messageKey: string,
    params?: Record<string, string>,
    progress = 0
  ): UploadResult => {
    emit({ phase: 'error', progress, messageKey, params })
    return { ok: false, messageKey, params }
  }

  const repoName = `${username}/${request.name}`
  emit({ phase: 'preparing', progress: 0 })

  let files: WalkedFile[]
  try {
    files = await walkFolder(request.folderPath)
  } catch (err) {
    if (err instanceof TooManyFilesError) {
      return failWith('upload.tooManyFiles', { max: String(MAX_FILES) })
    }
    return failWith('upload.failed', { error: trimError(err) })
  }
  if (files.length === 0) return failWith('upload.emptyFolder')

  const { createRepo, commitIter, HubApiError } = await import('@huggingface/hub')
  const repo = { type: request.kind, name: repoName }
  // Same endpoint + proxy as HubClient — the SDK's default fetch is global,
  // unproxied, and hard-wired to huggingface.co.
  const { endpoint, proxyUrl } = getHubNetworkOptions()
  const hubUrl = resolveHubUrl(endpoint)
  const fetchImpl = createProxiedFetch(proxyUrl)

  try {
    await createRepo({ repo, private: request.private, accessToken, hubUrl, fetch: fetchImpl })
  } catch (err) {
    if (err instanceof HubApiError && err.statusCode === 409) {
      // Repo already exists — uploading into it is fine.
    } else if (err instanceof HubApiError && err.statusCode === 403) {
      return failWith('upload.needWriteScope')
    } else {
      return failWith('upload.failed', { error: trimError(err) })
    }
  }

  // Overall progress = size-weighted hashing + uploading halves, kept strictly below 1
  // until the commit lands so the renderer's "done" comes only from the done event.
  const totalBytes = Math.max(
    1,
    files.reduce((sum, f) => sum + f.size, 0)
  )
  const sizeByPath = new Map(files.map((f) => [f.rel, f.size]))
  const fraction = { hashing: new Map<string, number>(), uploading: new Map<string, number>() }
  let doneBytes = 0
  let phase: UploadProgress['phase']
  let progress = 0.01
  let lastEmit = 0

  try {
    // `commitIter` is what `uploadFilesWithProgress` wraps: same progress events,
    // but it accepts hubUrl + fetch (the XHR upload-progress wrapper the latter
    // adds needs XMLHttpRequest, which the main process doesn't have anyway).
    const generator = commitIter({
      repo,
      operations: files.map((f) => ({
        operation: 'addOrUpdate' as const,
        path: f.rel,
        content: pathToFileURL(f.abs)
      })),
      accessToken,
      title: 'Upload from Oh My HuggingFace',
      hubUrl,
      fetch: fetchImpl
    })
    for await (const event of generator) {
      if (event.event === 'phase') {
        phase = event.phase === 'preuploading' ? 'hashing' : 'uploading'
        if (event.phase === 'committing') progress = Math.max(progress, 0.97)
        emit({ phase, progress })
        lastEmit = Date.now()
      } else if (event.event === 'fileProgress' && event.state !== 'error') {
        const seen = fraction[event.state]
        const previous = seen.get(event.path) ?? 0
        doneBytes += (event.progress - previous) * (sizeByPath.get(event.path) ?? 0)
        seen.set(event.path, event.progress)
        phase = event.state
        progress = Math.max(progress, Math.min(0.97, 0.02 + 0.95 * (doneBytes / (2 * totalBytes))))
        const now = Date.now()
        if (now - lastEmit >= EMIT_INTERVAL_MS) {
          emit({ phase, progress, path: event.path })
          lastEmit = now
        }
      }
    }
  } catch (err) {
    return failWith('upload.failed', { error: trimError(err) }, progress)
  }

  emit({ phase: 'done', progress: 1 })
  notifyDone('notifications.uploadComplete', 'notifications.uploadCompleteBody', {
    repo: repoName
  })
  return {
    ok: true,
    messageKey: 'upload.done',
    repoUrl: buildRepoUrl(hubUrl, request.kind, repoName),
    params: { repo: repoName }
  }
}
