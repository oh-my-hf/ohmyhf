import { existsSync } from 'node:fs'
import { lstat, readFile, readdir, readlink, rm, stat, unlink } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { CacheReport } from '@oh-my-huggingface/shared'
import { defaultCacheDir } from '@oh-my-huggingface/hub-api'
import type { SettingsStore } from './settings'

export class CacheManager {
  /**
   * @param protectedTaskIds returns the download task ids whose in-progress
   *   partials are still resumable; their `.incomplete.<id>-*` files are spared
   *   by cleanPartials even when the mtime looks stale (a paused download's
   *   partial has a frozen mtime but is not an orphan).
   */
  constructor(
    private readonly settings: SettingsStore,
    private readonly protectedTaskIds: () => Set<string> = () => new Set()
  ) {}

  cacheDir(): string {
    return this.settings.get().hfCacheDir ?? defaultCacheDir()
  }

  /** Scan runs in a worker thread; the traversal can touch hundreds of GB. */
  scan(): Promise<CacheReport> {
    const cacheDir = this.cacheDir()
    if (!existsSync(cacheDir)) {
      return Promise.resolve({
        root: cacheDir,
        totalSize: 0,
        repos: [],
        scannedAt: new Date().toISOString()
      })
    }
    return new Promise((resolvePromise, reject) => {
      const worker = new Worker(join(__dirname, 'cache-worker.mjs'), {
        workerData: { cacheDir }
      })
      worker.once('message', (report: CacheReport) => {
        resolvePromise(report)
        void worker.terminate()
      })
      worker.once('error', reject)
      worker.once('exit', (code) => {
        if (code !== 0) reject(new Error(`cache scan exited with code ${code}`))
      })
    })
  }

  /**
   * Delete snapshot revisions, their refs, and any blobs no longer referenced by a
   * remaining snapshot. Refuses paths outside the active cache dir.
   */
  async deleteRevisions(repoPath: string, commitHashes: string[]): Promise<CacheReport> {
    await deleteRevisionFiles(this.resolveRepoPath(repoPath), commitHashes)
    return this.scan()
  }

  /**
   * Delete leftover `*.incomplete*` download partials in a repo's blobs dir.
   * DownloadManager cleans its own partials on cancel/remove — this handles
   * orphans left by crashes and older app versions. Partials belonging to a
   * still-resumable task are skipped so a paused download is never wiped.
   */
  async cleanPartials(repoPath: string): Promise<CacheReport> {
    await deleteRepoPartials(this.resolveRepoPath(repoPath), this.protectedTaskIds())
    return this.scan()
  }

  private resolveRepoPath(repoPath: string): string {
    const root = resolve(this.cacheDir())
    const repo = resolve(repoPath)
    if (repo !== root && !repo.startsWith(root + sep)) {
      throw new Error('Repository path is outside the configured cache directory')
    }
    return repo
  }
}

/**
 * Filesystem half of deleteRevisions, exported for tests. Blob GC only runs when
 * references are provable: the copy-fallback layout (Windows without the symlink
 * privilege) yields zero symlinks, and treating its blobs as "unreferenced" would
 * wipe the whole store on any single-revision delete — with revisions remaining
 * and nothing referenced, blob GC is skipped entirely.
 */
export async function deleteRevisionFiles(repo: string, commitHashes: string[]): Promise<void> {
  const snapshotsDir = join(repo, 'snapshots')
  for (const hash of commitHashes) {
    await rm(join(snapshotsDir, hash), { recursive: true, force: true })
  }

  // Remove refs (possibly nested, e.g. refs/pr/1) that pointed at the deleted revisions.
  for (const refPath of await listFilesRecursive(join(repo, 'refs'))) {
    try {
      const target = (await readFile(refPath, 'utf8')).trim()
      if (commitHashes.includes(target)) await unlink(refPath)
    } catch {
      /* ignore unreadable refs */
    }
  }

  // Garbage-collect blobs unreferenced by the remaining snapshots.
  const referenced = new Set<string>()
  const remaining = await safeReaddir(snapshotsDir)
  for (const commit of remaining) {
    await collectSymlinkTargets(join(snapshotsDir, commit), referenced)
  }
  if (remaining.length === 0 || referenced.size > 0) {
    const blobsDir = join(repo, 'blobs')
    for (const blob of await safeReaddir(blobsDir)) {
      const full = join(blobsDir, blob)
      if (!referenced.has(resolve(full)) && !blob.includes('.incomplete')) {
        await rm(full, { force: true })
      }
    }
  }

  // Remove the whole repo folder when nothing is left.
  if ((await safeReaddir(snapshotsDir)).length === 0) {
    await rm(repo, { recursive: true, force: true })
  }
}

/**
 * Delete leftover `*.incomplete*` partials in a repo's blobs dir; exported for
 * tests. Two guards keep a live or resumable download safe: a partial written
 * in the last 10 minutes is kept (an active writer touches it every chunk), and
 * a partial whose name carries a still-tracked task id (`.incomplete.<id>-*`)
 * is kept regardless of mtime — a paused download's mtime is frozen but the
 * file is not an orphan.
 */
export async function deleteRepoPartials(
  repo: string,
  protectedTaskIds: Set<string> = new Set()
): Promise<void> {
  const blobsDir = join(repo, 'blobs')
  for (const name of await safeReaddir(blobsDir)) {
    if (!name.includes('.incomplete')) continue
    if ([...protectedTaskIds].some((id) => name.includes(`.incomplete.${id}`))) continue
    try {
      const full = join(blobsDir, name)
      if (Date.now() - (await stat(full)).mtimeMs < 10 * 60_000) continue
      await rm(full, { force: true })
    } catch {
      /* vanished mid-clean */
    }
  }
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir)
  } catch {
    return []
  }
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await safeReaddir(dir)) {
    const full = join(dir, entry)
    try {
      const st = await lstat(full)
      if (st.isDirectory()) out.push(...(await listFilesRecursive(full)))
      else out.push(full)
    } catch {
      /* ignore */
    }
  }
  return out
}

async function collectSymlinkTargets(dir: string, out: Set<string>): Promise<void> {
  for (const entry of await safeReaddir(dir)) {
    const full = join(dir, entry)
    try {
      const st = await lstat(full)
      if (st.isDirectory()) {
        await collectSymlinkTargets(full, out)
      } else if (st.isSymbolicLink()) {
        out.add(resolve(dir, await readlink(full)))
      }
    } catch {
      /* ignore */
    }
  }
}
