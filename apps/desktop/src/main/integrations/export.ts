/**
 * Real export pipeline: locate a downloaded file inside the standard HF cache layout
 * (`models--org--name/{blobs,snapshots,refs}`) and hand it to a local tool —
 * `ollama create` for GGUF files, link-or-copy for LM Studio and ComfyUI.
 */
import { existsSync, promises as fs } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { repoCachePaths } from '@oh-my-huggingface/hub-api'
import type { ExportResult, ExportTarget, ExportTool, RepoKind } from '@oh-my-huggingface/shared'
import type { ExportDeps } from './types'
import { notifyDone } from './notify'

const OLLAMA_TIMEOUT_MS = 15 * 60 * 1000

function comfyuiCandidates(): string[] {
  return [
    process.env.COMFYUI_PATH ?? '',
    join(homedir(), 'ComfyUI'),
    join(homedir(), 'comfyui')
  ].filter(Boolean)
}

export function detectExportTargets(): ExportTarget[] {
  const home = homedir()
  const candidates: Record<ExportTool, string[]> = {
    ollama: [join(home, '.ollama')],
    lmstudio: [join(home, '.lmstudio'), join(home, '.cache', 'lm-studio')],
    comfyui: comfyuiCandidates()
  }
  return (Object.keys(candidates) as ExportTool[]).map((tool) => {
    const path = candidates[tool].find((p) => existsSync(p))
    return { tool, detected: Boolean(path), path }
  })
}

function fail(messageKey: string, params?: Record<string, string>): ExportResult {
  return { ok: false, messageKey, params }
}

/**
 * Resolve `<cacheDir>/models--org--name/snapshots/<commit>/<filePath>`, preferring the
 * commit pinned by `refs/main`, then any other ref, then the newest snapshot dir.
 */
async function findSnapshotFile(
  cacheDir: string,
  kind: RepoKind,
  repoId: string,
  filePath: string
): Promise<string | null> {
  const { refsDir, snapshotsDir } = repoCachePaths(cacheDir, kind, repoId)

  let commit: string | undefined
  try {
    commit = (await fs.readFile(join(refsDir, 'main'), 'utf8')).trim()
  } catch {
    try {
      const refs = await fs.readdir(refsDir)
      const first = refs[0]
      if (first) commit = (await fs.readFile(join(refsDir, first), 'utf8')).trim()
    } catch {
      // no refs dir — fall through to snapshot scan
    }
  }

  if (!commit || !existsSync(join(snapshotsDir, commit))) {
    try {
      const entries = await fs.readdir(snapshotsDir, { withFileTypes: true })
      let newest: { name: string; mtimeMs: number } | undefined
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const stat = await fs.stat(join(snapshotsDir, entry.name))
        if (!newest || stat.mtimeMs > newest.mtimeMs) {
          newest = { name: entry.name, mtimeMs: stat.mtimeMs }
        }
      }
      commit = newest?.name
    } catch {
      return null
    }
  }
  if (!commit) return null

  const snapshotDir = resolve(snapshotsDir, commit)
  const file = resolve(snapshotDir, filePath)
  // Defense in depth on top of the `..` rejection: never escape the snapshot dir.
  if (!file.startsWith(snapshotDir + sep)) return null
  return existsSync(file) ? file : null
}

async function findOllamaBinary(): Promise<string | null> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const run = promisify(execFile)
  try {
    const locator = process.platform === 'win32' ? 'where' : 'which'
    const { stdout } = await run(locator, ['ollama'])
    const found = stdout.trim().split(/\r?\n/)[0]?.trim()
    if (found && existsSync(found)) return found
  } catch {
    // not on PATH
  }
  const candidates =
    process.platform === 'win32'
      ? [join(homedir(), 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe')]
      : ['/usr/local/bin/ollama', '/opt/homebrew/bin/ollama']
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** Hard-link the underlying blob when possible (same volume), else copy the bytes. */
async function linkOrCopy(source: string, dest: string): Promise<void> {
  await fs.rm(dest, { force: true })
  try {
    // Snapshot entries are symlinks into blobs/ — link the real file for correct semantics.
    const real = await fs.realpath(source)
    await fs.link(real, dest)
  } catch {
    await fs.copyFile(source, dest)
  }
}

async function exportToOllama(
  repoId: string,
  filePath: string,
  snapshotFile: string
): Promise<ExportResult> {
  const binary = await findOllamaBinary()
  if (!binary) return fail('export.ollamaMissing')

  const [org = '', name = ''] = repoId.split('/')
  const fileBase = basename(filePath).replace(/\.gguf$/i, '')
  const modelName =
    `${org}-${name}-${fileBase}`
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^[-._]+|[-._]+$/g, '') || 'model'

  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const run = promisify(execFile)

  const tempDir = await fs.mkdtemp(join(tmpdir(), 'omhf-ollama-'))
  const modelfile = join(tempDir, 'Modelfile')
  try {
    await fs.writeFile(modelfile, `FROM ${snapshotFile}\n`, 'utf8')
    await run(binary, ['create', modelName, '-f', modelfile], {
      timeout: OLLAMA_TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024
    })
    notifyDone('notifications.exportComplete', 'notifications.exportCompleteBody', {
      name: modelName
    })
    return { ok: true, messageKey: 'export.ollamaDone', params: { name: modelName } }
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr
    const detail = (stderr?.trim() || (err instanceof Error ? err.message : String(err))).slice(
      0,
      200
    )
    return fail('export.ollamaFailed', { error: detail })
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function exportToLmStudio(
  repoId: string,
  filePath: string,
  snapshotFile: string
): Promise<ExportResult> {
  const [org = '', name = ''] = repoId.split('/')
  // The shared schema rejects dot-only segments, but never join a path we didn't verify.
  if (!name || /^\.+$/.test(org) || /^\.+$/.test(name)) {
    return fail('export.invalidPath', { file: repoId })
  }
  const dest = join(homedir(), '.lmstudio', 'models', org, name, basename(filePath))
  await fs.mkdir(dirname(dest), { recursive: true })
  await linkOrCopy(snapshotFile, dest)
  return { ok: true, messageKey: 'export.copied', params: { path: dest } }
}

async function exportToComfyui(filePath: string, snapshotFile: string): Promise<ExportResult> {
  const baseDir = comfyuiCandidates().find((p) => existsSync(p))
  if (!baseDir) return fail('export.comfyuiMissing')

  const lower = basename(filePath).toLowerCase()
  const subfolder = lower.includes('lora')
    ? 'loras'
    : lower.includes('vae')
      ? 'vae'
      : lower.includes('controlnet')
        ? 'controlnet'
        : 'checkpoints'
  const dest = join(baseDir, 'models', subfolder, basename(filePath))
  await fs.mkdir(dirname(dest), { recursive: true })
  await linkOrCopy(snapshotFile, dest)
  return { ok: true, messageKey: 'export.copied', params: { path: dest } }
}

export async function runExport(
  tool: ExportTool,
  kind: RepoKind,
  repoId: string,
  filePath: string,
  deps: ExportDeps
): Promise<ExportResult> {
  if (!filePath || filePath.includes('..') || isAbsolute(filePath)) {
    return fail('export.invalidPath', { file: filePath })
  }

  const snapshotFile = await findSnapshotFile(deps.cacheDir, kind, repoId, filePath)
  if (!snapshotFile) return fail('export.notInCache', { file: filePath })

  try {
    switch (tool) {
      case 'ollama':
        return await exportToOllama(repoId, filePath, snapshotFile)
      case 'lmstudio':
        return await exportToLmStudio(repoId, filePath, snapshotFile)
      case 'comfyui':
        return await exportToComfyui(filePath, snapshotFile)
    }
  } catch (err) {
    const detail = (err instanceof Error ? err.message : String(err)).slice(0, 200)
    return fail('export.failed', { error: detail })
  }
}
