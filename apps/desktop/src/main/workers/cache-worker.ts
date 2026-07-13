/**
 * Scans the HF cache directory and reports per-repo/per-revision disk usage.
 * Runs in a worker_thread: cache dirs can hold terabytes across thousands of files,
 * and the main process must never block on the traversal.
 *
 * workerData: { cacheDir: string }
 * result (postMessage): CacheReport
 */
import { lstatSync, readFileSync, readdirSync, readlinkSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import type { CacheReport, CachedRepo, CachedRevision } from '@oh-my-huggingface/shared'
import { parseRepoFolderName } from '@oh-my-huggingface/hub-api'

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

interface WalkedFile {
  /** Size on disk; for symlinks, the size of the blob it points to. */
  size: number
  /** Absolute blob path when the file is a symlink into blobs/. */
  blobPath?: string
}

function walkSnapshot(dir: string, files: WalkedFile[]): void {
  for (const name of safeReaddir(dir)) {
    const full = join(dir, name)
    let st
    try {
      st = lstatSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      walkSnapshot(full, files)
    } else if (st.isSymbolicLink()) {
      try {
        const target = resolve(dir, readlinkSync(full))
        files.push({ size: statSync(target).size, blobPath: target })
      } catch {
        files.push({ size: 0 })
      }
    } else if (st.isFile()) {
      files.push({ size: st.size })
    }
  }
}

/** Refs may nest (refs/pr/1 is a file under refs/pr/); collect recursively, keyed by commit. */
function collectRefs(dir: string, prefix: string, refs: Map<string, string>): void {
  for (const name of safeReaddir(dir)) {
    const full = join(dir, name)
    let st
    try {
      st = lstatSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      collectRefs(full, `${prefix}${name}/`, refs)
    } else {
      try {
        refs.set(readFileSync(full, 'utf8').trim(), `${prefix}${name}`)
      } catch {
        /* unreadable ref */
      }
    }
  }
}

function scanRepo(cacheDir: string, repoFolder: string): CachedRepo | null {
  const parsed = parseRepoFolderName(repoFolder)
  if (!parsed) return null
  const repoPath = join(cacheDir, repoFolder)

  const refs = new Map<string, string>()
  collectRefs(join(repoPath, 'refs'), '', refs)

  const revisions: CachedRevision[] = []
  let nonBlobSize = 0
  const snapshotsDir = join(repoPath, 'snapshots')
  for (const commitHash of safeReaddir(snapshotsDir)) {
    const snapshotPath = join(snapshotsDir, commitHash)
    try {
      if (!lstatSync(snapshotPath).isDirectory()) continue
    } catch {
      continue
    }
    const files: WalkedFile[] = []
    walkSnapshot(snapshotPath, files)
    const revBlobs = new Set<string>()
    let revSize = 0
    for (const f of files) {
      if (f.blobPath) {
        if (!revBlobs.has(f.blobPath)) {
          revBlobs.add(f.blobPath)
          revSize += f.size
        }
      } else {
        revSize += f.size
        nonBlobSize += f.size
      }
    }
    let lastModified: string | undefined
    try {
      lastModified = statSync(snapshotPath).mtime.toISOString()
    } catch {
      /* ignore */
    }
    revisions.push({
      commitHash,
      sizeOnDisk: revSize,
      fileCount: files.length,
      refs: refs.get(commitHash) ? [refs.get(commitHash)!] : [],
      lastModified
    })
  }

  // Count the blob store directly: the copy-fallback layout (Windows without the
  // symlink privilege) has no symlinks to walk, and orphaned blobs or leftover
  // '.incomplete' partials occupy disk either way.
  let blobSize = 0
  let partialSize = 0
  let partialCount = 0
  const blobsDir = join(repoPath, 'blobs')
  for (const name of safeReaddir(blobsDir)) {
    let st
    try {
      st = statSync(join(blobsDir, name))
    } catch {
      continue
    }
    if (!st.isFile()) continue
    if (name.includes('.incomplete')) {
      partialSize += st.size
      partialCount += 1
    } else {
      blobSize += st.size
    }
  }

  revisions.sort((a, b) => b.sizeOnDisk - a.sizeOnDisk)
  return {
    id: parsed.repoId,
    kind: parsed.kind,
    sizeOnDisk: blobSize + nonBlobSize + partialSize,
    revisions,
    partialSize,
    partialCount,
    lastModified: revisions
      .map((r) => r.lastModified)
      .filter(Boolean)
      .sort()
      .at(-1)
  }
}

/** Exported for tests; the worker entry below feeds it workerData. */
export function scanCache(cacheDir: string): CacheReport {
  const repos: CachedRepo[] = []
  for (const folder of safeReaddir(cacheDir)) {
    if (!/^(models|datasets|spaces)--/.test(folder)) continue
    const repo = scanRepo(cacheDir, folder)
    if (repo) repos.push(repo)
  }
  repos.sort((a, b) => b.sizeOnDisk - a.sizeOnDisk)
  return {
    root: cacheDir,
    totalSize: repos.reduce((acc, r) => acc + r.sizeOnDisk, 0),
    partialSize: repos.reduce((acc, r) => acc + (r.partialSize ?? 0), 0),
    repos,
    scannedAt: new Date().toISOString()
  }
}

// Only act as a worker when actually spawned as one (tests import scanCache directly).
if (parentPort) {
  const { cacheDir } = workerData as { cacheDir: string }
  parentPort.postMessage(scanCache(cacheDir))
}
