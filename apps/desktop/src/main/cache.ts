import { existsSync } from 'node:fs'
import { readFile, readdir, readlink, rm, unlink } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { CacheReport } from '@oh-my-huggingface/shared'
import { defaultCacheDir } from '@oh-my-huggingface/hub-api'
import type { SettingsStore } from './settings'

export class CacheManager {
  constructor(private readonly settings: SettingsStore) {}

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
    const root = resolve(this.cacheDir())
    const repo = resolve(repoPath)
    if (repo !== root && !repo.startsWith(root + sep)) {
      throw new Error('Repository path is outside the configured cache directory')
    }

    const snapshotsDir = join(repo, 'snapshots')
    for (const hash of commitHashes) {
      await rm(join(snapshotsDir, hash), { recursive: true, force: true })
    }

    // Remove refs that pointed at the deleted revisions.
    const refsDir = join(repo, 'refs')
    for (const ref of await safeReaddir(refsDir)) {
      try {
        const target = (await readFile(join(refsDir, ref), 'utf8')).trim()
        if (commitHashes.includes(target)) await unlink(join(refsDir, ref))
      } catch {
        /* ignore unreadable refs */
      }
    }

    // Garbage-collect blobs unreferenced by the remaining snapshots.
    const referenced = new Set<string>()
    for (const commit of await safeReaddir(snapshotsDir)) {
      await collectSymlinkTargets(join(snapshotsDir, commit), referenced)
    }
    const blobsDir = join(repo, 'blobs')
    for (const blob of await safeReaddir(blobsDir)) {
      const full = join(blobsDir, blob)
      if (!referenced.has(resolve(full)) && !blob.endsWith('.incomplete')) {
        await rm(full, { force: true })
      }
    }

    // Remove the whole repo folder when nothing is left.
    if ((await safeReaddir(snapshotsDir)).length === 0) {
      await rm(repo, { recursive: true, force: true })
    }

    return this.scan()
  }
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir)
  } catch {
    return []
  }
}

async function collectSymlinkTargets(dir: string, out: Set<string>): Promise<void> {
  for (const entry of await safeReaddir(dir)) {
    const full = join(dir, entry)
    try {
      const { lstat } = await import('node:fs/promises')
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
