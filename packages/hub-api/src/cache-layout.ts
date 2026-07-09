/**
 * Helpers for the standard Hugging Face cache layout
 * (`<cache>/models--org--name/{blobs,snapshots,refs}`), so downloads made by this app
 * are fully interoperable with `transformers`, `huggingface_hub`, and the CLI.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { RepoKind } from '@oh-my-huggingface/shared'

const KIND_FOLDER_PREFIX: Record<RepoKind, string> = {
  model: 'models',
  dataset: 'datasets',
  space: 'spaces'
}

/** `meta-llama/Llama-3-8B` (model) → `models--meta-llama--Llama-3-8B` */
export function repoFolderName(kind: RepoKind, repoId: string): string {
  return `${KIND_FOLDER_PREFIX[kind]}--${repoId.split('/').join('--')}`
}

export function parseRepoFolderName(folder: string): { kind: RepoKind; repoId: string } | null {
  const parts = folder.split('--')
  if (parts.length < 2) return null
  const prefix = parts[0]
  const kind = (Object.keys(KIND_FOLDER_PREFIX) as RepoKind[]).find(
    (k) => KIND_FOLDER_PREFIX[k] === prefix
  )
  if (!kind) return null
  return { kind, repoId: parts.slice(1).join('/') }
}

/** Default HF hub cache dir, honoring HF_HUB_CACHE / HF_HOME like huggingface_hub does. */
export function defaultCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.HF_HUB_CACHE) return env.HF_HUB_CACHE
  if (env.HF_HOME) return join(env.HF_HOME, 'hub')
  if (env.XDG_CACHE_HOME) return join(env.XDG_CACHE_HOME, 'huggingface', 'hub')
  return join(homedir(), '.cache', 'huggingface', 'hub')
}

export interface RepoCachePaths {
  repoDir: string
  blobsDir: string
  snapshotsDir: string
  refsDir: string
}

export function repoCachePaths(cacheDir: string, kind: RepoKind, repoId: string): RepoCachePaths {
  const repoDir = join(cacheDir, repoFolderName(kind, repoId))
  return {
    repoDir,
    blobsDir: join(repoDir, 'blobs'),
    snapshotsDir: join(repoDir, 'snapshots'),
    refsDir: join(repoDir, 'refs')
  }
}
