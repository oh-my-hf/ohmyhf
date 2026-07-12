import { describe, expect, it } from 'vitest'
import { computeSpeedShare } from '@oh-my-huggingface/shared'

/**
 * DownloadManager itself needs electron + better-sqlite3 (Electron ABI), so only
 * the pure share math it applies per worker is unit-tested here.
 */
describe('computeSpeedShare', () => {
  it('returns null (unlimited) when no limit is configured', () => {
    expect(computeSpeedShare(null, 3)).toBeNull()
    expect(computeSpeedShare(undefined, 3)).toBeNull()
    expect(computeSpeedShare(0, 3)).toBeNull()
  })

  it('splits the aggregate limit evenly across workers', () => {
    expect(computeSpeedShare(3_000_000, 3)).toBe(1_000_000)
    expect(computeSpeedShare(3_000_000, 1)).toBe(3_000_000)
    expect(computeSpeedShare(1_000_000, 3)).toBe(333_333)
  })

  it('treats zero workers as one and floors at 1 B/s', () => {
    expect(computeSpeedShare(500, 0)).toBe(500)
    expect(computeSpeedShare(2, 4)).toBe(1)
  })
})
