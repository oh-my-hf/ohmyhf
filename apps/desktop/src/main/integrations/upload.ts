/** Upload execution over a main-process-owned, immutable file manifest. */
import { lstat, open, realpath, stat, type FileHandle } from 'node:fs/promises'
import { isAbsolute, relative, sep } from 'node:path'
import { DEFAULT_ENDPOINT } from '@oh-my-huggingface/hub-api'
import type { RepoKind } from '@oh-my-huggingface/shared'
import { createProxiedFetch, getHubNetworkOptions } from '../hub'

const EMIT_INTERVAL_MS = 100
const MAX_OPEN_UPLOAD_FILES = 32

const REPO_URL_PREFIX: Record<RepoKind, string> = {
  model: '',
  dataset: 'datasets/',
  space: 'spaces/'
}

export interface UploadManifestFile {
  relativePath: string
  absolutePath: string
  size: number
  mtimeMs: number
  dev: number
  ino: number
}

export interface UploadManifest {
  rootPath: string
  rootRealPath: string
  rootDev: number
  rootIno: number
  files: UploadManifestFile[]
}

export interface UploadPipelineRequest {
  kind: RepoKind
  name: string
  private: boolean
  manifest: UploadManifest
}

export interface UploadPipelineProgress {
  phase: 'preparing' | 'hashing' | 'uploading' | 'committing'
  progress: number
  path?: string
}

export type UploadPipelineResult =
  | {
      ok: true
      repoId: string
      repoUrl: string
      messageKey: string
      params: Record<string, string>
    }
  | { ok: false; messageKey: string; params?: Record<string, string>; progress: number }

export interface UploadPipelineDeps {
  accessToken: string | undefined
  username: string | undefined
  signal: AbortSignal
  onProgress: (progress: UploadPipelineProgress) => void
}

function trimError(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).trim().slice(0, 200)
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return (
    rel !== '' &&
    !isAbsolute(rel) &&
    rel !== '..' &&
    !rel.startsWith(`..${sep}`) &&
    !rel.includes(`..${sep}`)
  )
}

/** Revalidate every selected file immediately before any network request. */
export async function validateUploadManifest(manifest: UploadManifest): Promise<void> {
  try {
    const rootEntry = await lstat(manifest.rootPath)
    const rootResolved = await realpath(manifest.rootPath)
    const rootStats = await stat(rootResolved)
    if (
      rootEntry.isSymbolicLink() ||
      !rootStats.isDirectory() ||
      rootResolved !== manifest.rootRealPath ||
      rootStats.dev !== manifest.rootDev ||
      rootStats.ino !== manifest.rootIno
    ) {
      throw new Error('selection-stale')
    }

    for (const file of manifest.files) {
      const entry = await lstat(file.absolutePath)
      const resolved = await realpath(file.absolutePath)
      const current = await stat(resolved)
      if (
        entry.isSymbolicLink() ||
        !current.isFile() ||
        !isInside(rootResolved, resolved) ||
        current.dev !== file.dev ||
        current.ino !== file.ino ||
        current.size !== file.size ||
        current.mtimeMs !== file.mtimeMs
      ) {
        throw new Error('selection-stale')
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'selection-stale') throw error
    throw new Error('selection-stale', { cause: error })
  }
}

/** SDK-facing Hub URL: configured endpoint without trailing slashes, or default. */
export function resolveHubUrl(endpoint: string | null): string {
  return (endpoint ?? DEFAULT_ENDPOINT).replace(/\/+$/, '')
}

/** Repo page URL on the active Hub endpoint. */
export function buildRepoUrl(hubUrl: string, kind: RepoKind, repoName: string): string {
  return `${hubUrl}/${REPO_URL_PREFIX[kind]}${repoName}`
}

function combineSignal(
  fetchSignal: AbortSignal | null | undefined,
  taskSignal: AbortSignal
): AbortSignal {
  return fetchSignal ? AbortSignal.any([fetchSignal, taskSignal]) : taskSignal
}

class FileHandleSemaphore {
  private active = 0
  private readonly queue: Array<{
    signal: AbortSignal
    resolve: (release: () => void) => void
    reject: (error: unknown) => void
    onAbort: () => void
  }> = []

  constructor(private readonly limit: number) {}

  acquire(signal: AbortSignal): Promise<() => void> {
    signal.throwIfAborted()
    if (this.active < this.limit) {
      this.active++
      return Promise.resolve(this.createRelease())
    }
    return new Promise((resolve, reject) => {
      const pending = {
        signal,
        resolve,
        reject,
        onAbort: () => {
          const index = this.queue.indexOf(pending)
          if (index >= 0) this.queue.splice(index, 1)
          reject(signal.reason)
        }
      }
      signal.addEventListener('abort', pending.onAbort, { once: true })
      this.queue.push(pending)
    })
  }

  private createRelease(): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      this.active--
      while (this.queue.length > 0) {
        const pending = this.queue.shift()!
        pending.signal.removeEventListener('abort', pending.onAbort)
        if (pending.signal.aborted) {
          pending.reject(pending.signal.reason)
          continue
        }
        this.active++
        pending.resolve(this.createRelease())
        break
      }
    }
  }
}

class UploadFileHandleRegistry {
  private readonly entries = new Map<FileHandle, () => void>()
  private closed = false

  async register(handle: FileHandle, release: () => void): Promise<boolean> {
    if (this.closed) {
      await handle.close().catch(() => undefined)
      release()
      return false
    }
    this.entries.set(handle, release)
    return true
  }

  async close(handle: FileHandle): Promise<void> {
    const release = this.entries.get(handle)
    if (!release) return
    this.entries.delete(handle)
    try {
      await handle.close().catch(() => undefined)
    } finally {
      release()
    }
  }

  async closeAll(): Promise<void> {
    if (this.closed && this.entries.size === 0) return
    this.closed = true
    const entries = [...this.entries.entries()]
    this.entries.clear()
    await Promise.all(
      entries.map(async ([handle, release]) => {
        try {
          await handle.close().catch(() => undefined)
        } finally {
          release()
        }
      })
    )
  }
}

/** Lazily opens and revalidates one manifest file. A semaphore keeps large
 * selections independent from the process file-descriptor limit. */
class ValidatedFileBlob extends Blob {
  constructor(
    private readonly manifest: UploadManifest,
    private readonly file: UploadManifestFile,
    private readonly startOffset: number,
    private readonly endOffset: number,
    private readonly signal: AbortSignal,
    private readonly semaphore: FileHandleSemaphore,
    private readonly registry: UploadFileHandleRegistry
  ) {
    super([])
  }

  override get size(): number {
    return this.endOffset - this.startOffset
  }

  override get type(): string {
    return ''
  }

  override slice(start = 0, end = this.size): Blob {
    const normalizedStart = start < 0 ? Math.max(this.size + start, 0) : Math.min(start, this.size)
    const normalizedEnd = end < 0 ? Math.max(this.size + end, 0) : Math.min(end, this.size)
    return new ValidatedFileBlob(
      this.manifest,
      this.file,
      this.startOffset + normalizedStart,
      this.startOffset + Math.max(normalizedStart, normalizedEnd),
      this.signal,
      this.semaphore,
      this.registry
    )
  }

  override stream(): ReadableStream<Uint8Array<ArrayBuffer>> {
    let position = this.startOffset
    const end = this.endOffset
    const signal = this.signal
    const manifest = this.manifest
    const file = this.file
    const semaphore = this.semaphore
    const registry = this.registry
    let handle: FileHandle | undefined
    let release: (() => void) | undefined
    let registered = false
    const close = async (): Promise<void> => {
      const activeHandle = handle
      handle = undefined
      if (activeHandle) {
        if (registered) await registry.close(activeHandle)
        else await activeHandle.close().catch(() => undefined)
      }
      if (!registered) release?.()
      registered = false
      release = undefined
    }
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      async pull(controller) {
        try {
          signal.throwIfAborted()
          if (!handle) {
            release = await semaphore.acquire(signal)
            try {
              signal.throwIfAborted()
              handle = await open(file.absolutePath, 'r')
              registered = await registry.register(handle, release)
              release = undefined
              if (!registered) throw signal.reason ?? new Error('Upload task is closed')
              await validateOpenManifestFile(manifest, file, handle)
            } catch (error) {
              await close()
              throw error
            }
          }
          const remaining = end - position
          if (remaining <= 0) {
            await validateOpenManifestFile(manifest, file, handle)
            await close()
            controller.close()
            return
          }
          const buffer = Buffer.allocUnsafe(Math.min(256 * 1024, remaining))
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, position)
          if (bytesRead === 0) throw new Error('selection-stale')
          position += bytesRead
          const chunk = new Uint8Array(new ArrayBuffer(bytesRead))
          chunk.set(buffer.subarray(0, bytesRead))
          controller.enqueue(chunk)
        } catch (error) {
          await close()
          controller.error(error)
        }
      },
      async cancel() {
        await close()
      }
    })
  }

  override async arrayBuffer(): Promise<ArrayBuffer> {
    const bytes = await this.bytes()
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  }

  override async bytes(): Promise<Uint8Array<ArrayBuffer>> {
    const output = new Uint8Array(new ArrayBuffer(this.size))
    const reader = this.stream().getReader()
    let offset = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      output.set(value, offset)
      offset += value.byteLength
    }
    return output
  }

  override async text(): Promise<string> {
    return new TextDecoder().decode(await this.bytes())
  }
}

async function validateOpenManifestFile(
  manifest: UploadManifest,
  file: UploadManifestFile,
  handle: FileHandle
): Promise<void> {
  try {
    const [entry, resolved, pathStats, handleStats] = await Promise.all([
      lstat(file.absolutePath),
      realpath(file.absolutePath),
      stat(file.absolutePath),
      handle.stat()
    ])
    const matches = (current: typeof handleStats): boolean =>
      current.isFile() &&
      current.dev === file.dev &&
      current.ino === file.ino &&
      current.size === file.size &&
      current.mtimeMs === file.mtimeMs
    if (
      entry.isSymbolicLink() ||
      resolved !== file.absolutePath ||
      !isInside(manifest.rootRealPath, resolved) ||
      !matches(pathStats) ||
      !matches(handleStats) ||
      pathStats.dev !== handleStats.dev ||
      pathStats.ino !== handleStats.ino
    ) {
      throw new Error('selection-stale')
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'selection-stale') throw error
    throw new Error('selection-stale', { cause: error })
  }
}

export async function createRepoAndUpload(
  request: UploadPipelineRequest,
  deps: UploadPipelineDeps
): Promise<UploadPipelineResult> {
  const { accessToken, username, signal, onProgress } = deps
  if (!accessToken || !username) {
    return { ok: false, messageKey: 'upload.signInFirst', progress: 0 }
  }
  if (request.manifest.files.length === 0) {
    return { ok: false, messageKey: 'upload.emptyFolder', progress: 0 }
  }

  signal.throwIfAborted()
  onProgress({ phase: 'preparing', progress: 0 })
  try {
    await validateUploadManifest(request.manifest)
  } catch (err) {
    if (signal.aborted) throw err
    const stale = err instanceof Error && err.message === 'selection-stale'
    return {
      ok: false,
      messageKey: stale ? 'upload.selectionStale' : 'upload.failed',
      params: stale ? undefined : { error: trimError(err) },
      progress: 0
    }
  }

  const { createRepo, commitIter, HubApiError } = await import('@huggingface/hub')
  const repoName = `${username}/${request.name}`
  const repo = { type: request.kind, name: repoName }
  const { endpoint, proxyUrl } = getHubNetworkOptions()
  const hubUrl = resolveHubUrl(endpoint)
  const proxiedFetch = createProxiedFetch(proxyUrl)
  const abortableFetch: typeof fetch = (input, init) =>
    proxiedFetch(input, { ...init, signal: combineSignal(init?.signal, signal) })

  try {
    await createRepo({
      repo,
      private: request.private,
      accessToken,
      hubUrl,
      fetch: abortableFetch
    })
  } catch (err) {
    if (signal.aborted) throw err
    if (err instanceof HubApiError && err.statusCode === 409) {
      // Uploading into an existing repository is intentional.
    } else if (err instanceof HubApiError && err.statusCode === 403) {
      return { ok: false, messageKey: 'upload.needWriteScope', progress: 0 }
    } else {
      return {
        ok: false,
        messageKey: 'upload.failed',
        params: { error: trimError(err) },
        progress: 0
      }
    }
  }

  const files = request.manifest.files
  const totalBytes = Math.max(
    1,
    files.reduce((sum, file) => sum + file.size, 0)
  )
  const sizeByPath = new Map(files.map((file) => [file.relativePath, file.size]))
  const fraction = { hashing: new Map<string, number>(), uploading: new Map<string, number>() }
  const semaphore = new FileHandleSemaphore(MAX_OPEN_UPLOAD_FILES)
  const registry = new UploadFileHandleRegistry()
  const closeOnAbort = (): void => void registry.closeAll()
  signal.addEventListener('abort', closeOnAbort, { once: true })
  let doneBytes = 0
  let progress = 0.01
  let lastEmit = 0

  try {
    const generator = commitIter({
      repo,
      operations: files.map((file) => ({
        operation: 'addOrUpdate' as const,
        path: file.relativePath,
        content: new ValidatedFileBlob(
          request.manifest,
          file,
          0,
          file.size,
          signal,
          semaphore,
          registry
        )
      })),
      accessToken,
      title: 'Upload from Oh My HuggingFace',
      hubUrl,
      fetch: abortableFetch,
      abortSignal: signal
    })
    for await (const event of generator) {
      signal.throwIfAborted()
      if (event.event === 'phase') {
        const phase =
          event.phase === 'preuploading'
            ? 'hashing'
            : event.phase === 'committing'
              ? 'committing'
              : 'uploading'
        if (phase === 'committing') {
          await validateUploadManifest(request.manifest)
          progress = Math.max(progress, 0.97)
        }
        onProgress({ phase, progress })
        lastEmit = Date.now()
      } else if (event.event === 'fileProgress' && event.state !== 'error') {
        const seen = fraction[event.state]
        const previous = seen.get(event.path) ?? 0
        doneBytes += (event.progress - previous) * (sizeByPath.get(event.path) ?? 0)
        seen.set(event.path, event.progress)
        progress = Math.max(progress, Math.min(0.97, 0.02 + 0.95 * (doneBytes / (2 * totalBytes))))
        const now = Date.now()
        if (now - lastEmit >= EMIT_INTERVAL_MS) {
          onProgress({ phase: event.state, progress, path: event.path })
          lastEmit = now
        }
      }
    }
  } catch (err) {
    if (signal.aborted) throw err
    if (err instanceof Error && err.message === 'selection-stale') {
      return { ok: false, messageKey: 'upload.selectionStale', progress }
    }
    return {
      ok: false,
      messageKey: 'upload.failed',
      params: { error: trimError(err) },
      progress
    }
  } finally {
    signal.removeEventListener('abort', closeOnAbort)
    await registry.closeAll()
  }
  return {
    ok: true,
    messageKey: 'upload.done',
    repoId: repoName,
    repoUrl: buildRepoUrl(hubUrl, request.kind, repoName),
    params: { repo: repoName }
  }
}
