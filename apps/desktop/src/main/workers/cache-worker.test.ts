import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanCache } from './cache-worker'

const COMMIT_A = 'a'.repeat(40)
const COMMIT_B = 'b'.repeat(40)

function makeCacheDir(): string {
  return mkdtempSync(join(tmpdir(), 'omh-scan-'))
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

describe('scanCache', () => {
  it('reports symlink-layout sizes from the blob store and reads nested refs', () => {
    const cacheDir = makeCacheDir()
    const repo = join(cacheDir, 'models--org--name')
    const blob1 = writeBlob(repo, '1'.repeat(40), 10)
    const blob2 = writeBlob(repo, '2'.repeat(40), 20)
    linkSnapshotFile(repo, COMMIT_A, 'config.json', blob1)
    linkSnapshotFile(repo, COMMIT_A, 'model.bin', blob2)
    linkSnapshotFile(repo, COMMIT_B, 'config.json', blob1)
    mkdirSync(join(repo, 'refs', 'pr'), { recursive: true })
    writeFileSync(join(repo, 'refs', 'main'), COMMIT_A)
    writeFileSync(join(repo, 'refs', 'pr', '1'), COMMIT_B)

    const report = scanCache(cacheDir)
    expect(report.repos).toHaveLength(1)
    const scanned = report.repos[0]!
    expect(scanned.id).toBe('org/name')
    expect(scanned.sizeOnDisk).toBe(30)
    const byCommit = new Map(scanned.revisions.map((r) => [r.commitHash, r]))
    expect(byCommit.get(COMMIT_A)?.sizeOnDisk).toBe(30)
    expect(byCommit.get(COMMIT_A)?.refs).toEqual(['main'])
    // Nested ref files (refs/pr/1) must resolve, not read as ref-less.
    expect(byCommit.get(COMMIT_B)?.refs).toEqual(['pr/1'])
    expect(report.totalSize).toBe(30)
  })

  it('counts the blob store in the copy-fallback layout (no symlinks)', () => {
    const cacheDir = makeCacheDir()
    const repo = join(cacheDir, 'models--org--name')
    writeBlob(repo, '1'.repeat(40), 10)
    writeBlob(repo, '2'.repeat(40), 20)
    copySnapshotFile(repo, COMMIT_A, 'config.json', 10)
    copySnapshotFile(repo, COMMIT_A, 'model.bin', 20)
    mkdirSync(join(repo, 'refs'), { recursive: true })
    writeFileSync(join(repo, 'refs', 'main'), COMMIT_A)

    const report = scanCache(cacheDir)
    const scanned = report.repos[0]!
    // Copies AND the blob store both occupy disk — the total must say so.
    expect(scanned.sizeOnDisk).toBe(60)
    expect(scanned.revisions[0]!.sizeOnDisk).toBe(30)
  })

  it('reports leftover .incomplete partials separately', () => {
    const cacheDir = makeCacheDir()
    const repo = join(cacheDir, 'models--org--name')
    const blob = writeBlob(repo, '1'.repeat(40), 10)
    linkSnapshotFile(repo, COMMIT_A, 'config.json', blob)
    writeBlob(repo, `${'2'.repeat(64)}.incomplete.task1-abcd1234`, 5)
    writeBlob(repo, `${'3'.repeat(64)}.incomplete`, 7)

    const report = scanCache(cacheDir)
    const scanned = report.repos[0]!
    expect(scanned.partialSize).toBe(12)
    expect(scanned.partialCount).toBe(2)
    expect(scanned.sizeOnDisk).toBe(22)
    expect(report.partialSize).toBe(12)
  })
})
