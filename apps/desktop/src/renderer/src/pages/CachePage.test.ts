import { describe, expect, it } from 'vitest'
import { staleRevisionsOf } from '@oh-my-huggingface/shared'
import type { CachedRepo, CachedRevision } from '@oh-my-huggingface/shared'

const COMMIT_A = 'a'.repeat(40)
const COMMIT_B = 'b'.repeat(40)
const COMMIT_C = 'c'.repeat(40)

function rev(commitHash: string, refs: string[]): CachedRevision {
  return { commitHash, sizeOnDisk: 100, fileCount: 1, refs }
}

function repo(revisions: CachedRevision[]): CachedRepo {
  return {
    id: 'org/name',
    kind: 'model',
    sizeOnDisk: 0,
    revisions
  }
}

describe('staleRevisionsOf', () => {
  it('flags ref-less revisions when the repo still has a ref’d one', () => {
    const stale = staleRevisionsOf(
      repo([rev(COMMIT_A, ['main']), rev(COMMIT_B, []), rev(COMMIT_C, [])])
    )
    expect(stale.map((r) => r.commitHash)).toEqual([COMMIT_B, COMMIT_C])
  })

  it('never flags anything in a repo whose revisions are all detached (SHA-pinned downloads)', () => {
    expect(staleRevisionsOf(repo([rev(COMMIT_A, []), rev(COMMIT_B, [])]))).toEqual([])
  })

  it('excludes commits the app downloaded deliberately by SHA', () => {
    const stale = staleRevisionsOf(
      repo([rev(COMMIT_A, ['main']), rev(COMMIT_B, []), rev(COMMIT_C, [])]),
      new Set([COMMIT_B])
    )
    expect(stale.map((r) => r.commitHash)).toEqual([COMMIT_C])
  })

  it('returns nothing for a repo with a single ref’d revision', () => {
    expect(staleRevisionsOf(repo([rev(COMMIT_A, ['main'])]))).toEqual([])
  })
})
