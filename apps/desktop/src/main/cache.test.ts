import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CacheManager, deleteRepoPartials, deleteRevisionFiles } from './cache'
import type { SettingsStore } from './settings'

const COMMIT_A = 'a'.repeat(40)
const COMMIT_B = 'b'.repeat(40)

function makeRepo(): string {
  return join(mkdtempSync(join(tmpdir(), 'omh-cache-')), 'models--org--name')
}

function cacheDirFor(repo: string): string {
  return dirname(repo)
}

function managerFor(cacheDir: string): CacheManager {
  return new CacheManager({
    get: () => ({ hfCacheDir: cacheDir })
  } as unknown as SettingsStore)
}

function writeBlob(repo: string, name: string, bytes: number): string {
  const blob = join(repo, 'blobs', name)
  mkdirSync(dirname(blob), { recursive: true })
  writeFileSync(blob, 'x'.repeat(bytes))
  return blob
}

function linkSnapshotFile(repo: string, commit: string, path: string, blob: string): void {
  const file = join(repo, 'snapshots', commit, path)
  mkdirSync(dirname(file), { recursive: true })
  symlinkSync(relative(dirname(file), blob), file)
}

function copySnapshotFile(repo: string, commit: string, path: string, bytes: number): void {
  const file = join(repo, 'snapshots', commit, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, 'x'.repeat(bytes))
}

describe('deleteRevisionFiles', () => {
  it('symlink layout: GCs the deleted revision’s blobs, keeps shared ones, drops nested refs', async () => {
    const repo = makeRepo()
    const shared = writeBlob(repo, '1'.repeat(40), 10)
    const only = writeBlob(repo, '2'.repeat(40), 20)
    linkSnapshotFile(repo, COMMIT_A, 'config.json', shared)
    linkSnapshotFile(repo, COMMIT_B, 'config.json', shared)
    linkSnapshotFile(repo, COMMIT_B, 'model.bin', only)
    mkdirSync(join(repo, 'refs', 'pr'), { recursive: true })
    writeFileSync(join(repo, 'refs', 'main'), COMMIT_A)
    writeFileSync(join(repo, 'refs', 'pr', '1'), COMMIT_B)

    await deleteRevisionFiles(cacheDirFor(repo), 'model', 'org/name', [COMMIT_B])

    expect(existsSync(join(repo, 'snapshots', COMMIT_B))).toBe(false)
    expect(existsSync(only)).toBe(false)
    expect(existsSync(shared)).toBe(true)
    expect(existsSync(join(repo, 'refs', 'pr', '1'))).toBe(false)
    expect(existsSync(join(repo, 'refs', 'main'))).toBe(true)
  })

  it('copy layout: never GCs blobs while other revisions remain', async () => {
    const repo = makeRepo()
    const blob1 = writeBlob(repo, '1'.repeat(40), 10)
    const blob2 = writeBlob(repo, '2'.repeat(40), 20)
    copySnapshotFile(repo, COMMIT_A, 'config.json', 10)
    copySnapshotFile(repo, COMMIT_B, 'config.json', 10)
    copySnapshotFile(repo, COMMIT_B, 'model.bin', 20)
    mkdirSync(join(repo, 'refs'), { recursive: true })
    writeFileSync(join(repo, 'refs', 'main'), COMMIT_A)

    await deleteRevisionFiles(cacheDirFor(repo), 'model', 'org/name', [COMMIT_B])

    expect(existsSync(join(repo, 'snapshots', COMMIT_B))).toBe(false)
    expect(existsSync(join(repo, 'snapshots', COMMIT_A))).toBe(true)
    // Zero detectable references — every blob may back a remaining revision.
    expect(existsSync(blob1)).toBe(true)
    expect(existsSync(blob2)).toBe(true)
  })

  it('removes the whole repo folder when the last revision goes (either layout)', async () => {
    const repo = makeRepo()
    copySnapshotFile(repo, COMMIT_A, 'config.json', 10)
    writeBlob(repo, '1'.repeat(40), 10)

    await deleteRevisionFiles(cacheDirFor(repo), 'model', 'org/name', [COMMIT_A])

    expect(existsSync(repo)).toBe(false)
  })

  it('keeps .incomplete partials out of blob GC', async () => {
    const repo = makeRepo()
    const blob = writeBlob(repo, '1'.repeat(40), 10)
    const partial = writeBlob(repo, `${'2'.repeat(64)}.incomplete.task1-abcd1234`, 5)
    linkSnapshotFile(repo, COMMIT_A, 'config.json', blob)
    linkSnapshotFile(repo, COMMIT_B, 'config.json', blob)

    await deleteRevisionFiles(cacheDirFor(repo), 'model', 'org/name', [COMMIT_B])

    expect(existsSync(partial)).toBe(true)
  })

  it('rejects an active commit before changing any cache files', async () => {
    const repo = makeRepo()
    copySnapshotFile(repo, COMMIT_A, 'config.json', 10)
    copySnapshotFile(repo, COMMIT_B, 'config.json', 10)

    await expect(
      deleteRevisionFiles(cacheDirFor(repo), 'model', 'org/name', [COMMIT_A], new Set([COMMIT_A]))
    ).rejects.toThrow('active download')

    expect(existsSync(join(repo, 'snapshots', COMMIT_A))).toBe(true)
    expect(existsSync(join(repo, 'snapshots', COMMIT_B))).toBe(true)
  })

  it('validates every requested hash before deleting an otherwise valid revision', async () => {
    const repo = makeRepo()
    copySnapshotFile(repo, COMMIT_A, 'config.json', 10)

    await expect(
      deleteRevisionFiles(cacheDirFor(repo), 'model', 'org/name', [COMMIT_A, '../outside'])
    ).rejects.toThrow('Invalid commit hash')

    expect(existsSync(join(repo, 'snapshots', COMMIT_A))).toBe(true)
  })

  it('rejects a repository symlink and leaves the external target untouched', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'omh-cache-root-'))
    const outside = mkdtempSync(join(tmpdir(), 'omh-cache-outside-'))
    const repo = join(cacheDir, 'models--org--name')
    copySnapshotFile(outside, COMMIT_A, 'config.json', 10)
    symlinkSync(outside, repo, 'dir')

    await expect(deleteRevisionFiles(cacheDir, 'model', 'org/name', [COMMIT_A])).rejects.toThrow(
      'symbolic link or junction'
    )

    expect(existsSync(join(outside, 'snapshots', COMMIT_A))).toBe(true)
  })

  it('rejects a symlinked cache root', async () => {
    const outsideRoot = mkdtempSync(join(tmpdir(), 'omh-cache-real-root-'))
    const linkedRoot = join(mkdtempSync(join(tmpdir(), 'omh-cache-link-parent-')), 'hub')
    const repo = join(outsideRoot, 'models--org--name')
    copySnapshotFile(repo, COMMIT_A, 'config.json', 10)
    symlinkSync(outsideRoot, linkedRoot, 'dir')

    await expect(deleteRevisionFiles(linkedRoot, 'model', 'org/name', [COMMIT_A])).rejects.toThrow(
      'cache root is a symbolic link or junction'
    )

    expect(existsSync(join(repo, 'snapshots', COMMIT_A))).toBe(true)
  })

  it('rejects a symlinked snapshots directory before deleting anything', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'omh-cache-snapshots-'))
    mkdirSync(join(outside, COMMIT_B), { recursive: true })
    const repo = makeRepo()
    mkdirSync(repo, { recursive: true })
    symlinkSync(outside, join(repo, 'snapshots'), 'dir')

    await expect(
      deleteRevisionFiles(cacheDirFor(repo), 'model', 'org/name', [COMMIT_B])
    ).rejects.toThrow('snapshots is a symbolic link or junction')

    expect(existsSync(join(outside, COMMIT_B))).toBe(true)
  })

  it('preflights refs before removing a selected snapshot', async () => {
    const repo = makeRepo()
    const outside = join(mkdtempSync(join(tmpdir(), 'omh-cache-ref-')), 'main')
    copySnapshotFile(repo, COMMIT_A, 'config.json', 10)
    copySnapshotFile(repo, COMMIT_B, 'config.json', 10)
    mkdirSync(join(repo, 'refs'), { recursive: true })
    writeFileSync(outside, COMMIT_B)
    symlinkSync(outside, join(repo, 'refs', 'main'))

    await expect(
      deleteRevisionFiles(cacheDirFor(repo), 'model', 'org/name', [COMMIT_B])
    ).rejects.toThrow('symbolic link or junction')

    expect(existsSync(join(repo, 'snapshots', COMMIT_B))).toBe(true)
    expect(existsSync(outside)).toBe(true)
  })

  it('rejects traversal-shaped repository ids without touching a sibling', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'omh-cache-root-'))
    const sibling = join(cacheDir, 'models--sibling')
    copySnapshotFile(sibling, COMMIT_A, 'config.json', 10)

    await expect(deleteRevisionFiles(cacheDir, 'model', '../sibling', [COMMIT_A])).rejects.toThrow(
      'Invalid repository id'
    )

    expect(existsSync(join(sibling, 'snapshots', COMMIT_A))).toBe(true)
  })
})

describe('deleteRepoPartials', () => {
  it('deletes stale partials but keeps ones with an active writer (fresh mtime)', async () => {
    const repo = makeRepo()
    const stale = writeBlob(repo, `${'1'.repeat(64)}.incomplete`, 5)
    const active = writeBlob(repo, `${'2'.repeat(64)}.incomplete.task1-abcd1234`, 5)
    const blob = writeBlob(repo, '3'.repeat(40), 10)
    const old = (Date.now() - 60 * 60_000) / 1000
    utimesSync(stale, old, old)

    await deleteRepoPartials(cacheDirFor(repo), 'model', 'org/name')

    expect(existsSync(stale)).toBe(false)
    expect(existsSync(active)).toBe(true)
    expect(existsSync(blob)).toBe(true)
  })

  it('keeps a stale-mtime partial when its task id is still resumable', async () => {
    const repo = makeRepo()
    // A paused download: its partial carries a frozen (stale) mtime but is not
    // an orphan, so it must survive cleanup.
    const paused = writeBlob(repo, `${'4'.repeat(64)}.incomplete.taskPaused-abcd1234`, 5)
    const orphan = writeBlob(repo, `${'5'.repeat(64)}.incomplete.taskGone-ef567890`, 5)
    const old = (Date.now() - 60 * 60_000) / 1000
    utimesSync(paused, old, old)
    utimesSync(orphan, old, old)

    await deleteRepoPartials(cacheDirFor(repo), 'model', 'org/name', new Set(['taskPaused']))

    expect(existsSync(paused)).toBe(true)
    expect(existsSync(orphan)).toBe(false)
  })

  it('rejects a blobs symlink without deleting an external partial', async () => {
    const repo = makeRepo()
    const outside = mkdtempSync(join(tmpdir(), 'omh-cache-blobs-'))
    mkdirSync(repo, { recursive: true })
    const partial = join(outside, `${'6'.repeat(64)}.incomplete`)
    writeFileSync(partial, 'partial')
    const old = (Date.now() - 60 * 60_000) / 1000
    utimesSync(partial, old, old)
    symlinkSync(outside, join(repo, 'blobs'), 'dir')

    await expect(deleteRepoPartials(cacheDirFor(repo), 'model', 'org/name')).rejects.toThrow(
      'blobs is a symbolic link or junction'
    )

    expect(existsSync(partial)).toBe(true)
  })

  it('preflights all blob entries before deleting a stale partial', async () => {
    const repo = makeRepo()
    const stale = writeBlob(repo, `${'7'.repeat(64)}.incomplete`, 5)
    const outside = join(mkdtempSync(join(tmpdir(), 'omh-cache-blob-link-')), 'blob')
    writeFileSync(outside, 'outside')
    symlinkSync(outside, join(repo, 'blobs', 'unsafe-link'))
    const old = (Date.now() - 60 * 60_000) / 1000
    utimesSync(stale, old, old)

    await expect(deleteRepoPartials(cacheDirFor(repo), 'model', 'org/name')).rejects.toThrow(
      'symbolic link or junction'
    )

    expect(existsSync(stale)).toBe(true)
    expect(existsSync(outside)).toBe(true)
  })
})

describe('CacheManager.resolveRepo', () => {
  it('returns only the canonical path derived from kind and repo id', async () => {
    const repo = makeRepo()
    mkdirSync(repo, { recursive: true })

    await expect(managerFor(cacheDirFor(repo)).resolveRepo('model', 'org/name')).resolves.toBe(
      realpathSync(repo)
    )
  })

  it('does not resolve an absent repository to the cache root', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'omh-cache-root-'))

    await expect(managerFor(cacheDir).resolveRepo('model', 'org/missing')).rejects.toThrow(
      'does not exist'
    )
  })
})
