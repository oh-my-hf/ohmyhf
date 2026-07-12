import { existsSync, mkdirSync, mkdtempSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deleteRepoPartials, deleteRevisionFiles } from './cache'

const COMMIT_A = 'a'.repeat(40)
const COMMIT_B = 'b'.repeat(40)

function makeRepo(): string {
  return join(mkdtempSync(join(tmpdir(), 'omh-cache-')), 'models--org--name')
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

    await deleteRevisionFiles(repo, [COMMIT_B])

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

    await deleteRevisionFiles(repo, [COMMIT_B])

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

    await deleteRevisionFiles(repo, [COMMIT_A])

    expect(existsSync(repo)).toBe(false)
  })

  it('keeps .incomplete partials out of blob GC', async () => {
    const repo = makeRepo()
    const blob = writeBlob(repo, '1'.repeat(40), 10)
    const partial = writeBlob(repo, `${'2'.repeat(64)}.incomplete.task1-abcd1234`, 5)
    linkSnapshotFile(repo, COMMIT_A, 'config.json', blob)
    linkSnapshotFile(repo, COMMIT_B, 'config.json', blob)

    await deleteRevisionFiles(repo, [COMMIT_B])

    expect(existsSync(partial)).toBe(true)
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

    await deleteRepoPartials(repo)

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

    await deleteRepoPartials(repo, new Set(['taskPaused']))

    expect(existsSync(paused)).toBe(true)
    expect(existsSync(orphan)).toBe(false)
  })
})
