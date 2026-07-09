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

const { cacheDir } = workerData as { cacheDir: string }

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

function scanRepo(repoFolder: string): CachedRepo | null {
  const parsed = parseRepoFolderName(repoFolder)
  if (!parsed) return null
  const repoPath = join(cacheDir, repoFolder)

  const refs = new Map<string, string>()
  const refsDir = join(repoPath, 'refs')
  for (const ref of safeReaddir(refsDir)) {
    try {
      refs.set(readFileSync(join(refsDir, ref), 'utf8').trim(), ref)
    } catch {
      /* unreadable ref */
    }
  }

  const revisions: CachedRevision[] = []
  const repoBlobs = new Set<string>()
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
        if (!repoBlobs.has(f.blobPath)) repoBlobs.add(f.blobPath)
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

  let blobSize = 0
  for (const blob of repoBlobs) {
    try {
      blobSize += statSync(blob).size
    } catch {
      /* blob vanished mid-scan */
    }
  }

  revisions.sort((a, b) => b.sizeOnDisk - a.sizeOnDisk)
  return {
    id: parsed.repoId,
    kind: parsed.kind,
    path: repoPath,
    sizeOnDisk: blobSize + nonBlobSize,
    revisions,
    lastModified: revisions
      .map((r) => r.lastModified)
      .filter(Boolean)
      .sort()
      .at(-1)
  }
}

function scan(): CacheReport {
  const repos: CachedRepo[] = []
  for (const folder of safeReaddir(cacheDir)) {
    if (!/^(models|datasets|spaces)--/.test(folder)) continue
    const repo = scanRepo(folder)
    if (repo) repos.push(repo)
  }
  repos.sort((a, b) => b.sizeOnDisk - a.sizeOnDisk)
  return {
    root: cacheDir,
    totalSize: repos.reduce((acc, r) => acc + r.sizeOnDisk, 0),
    repos,
    scannedAt: new Date().toISOString()
  }
}

parentPort!.postMessage(scan())
