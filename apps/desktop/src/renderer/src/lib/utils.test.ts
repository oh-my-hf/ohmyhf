import { describe, expect, it } from 'vitest'
import { formatBytes, formatCount, formatParams, paramBucketOf } from './utils'

describe('formatBytes', () => {
  it('formats across unit boundaries', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1023)).toBe('1023 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(8_030_000_000)).toBe('7.5 GB')
    expect(formatBytes(2 ** 41)).toBe('2.0 TB')
  })

  it('handles invalid input', () => {
    expect(formatBytes(-1)).toBe('–')
    expect(formatBytes(Number.NaN)).toBe('–')
  })
})

describe('formatParams', () => {
  it('uses model-community suffixes', () => {
    expect(formatParams(8_030_000_000)).toBe('8.0B')
    expect(formatParams(70_600_000_000)).toBe('70.6B')
    expect(formatParams(350_000_000)).toBe('350M')
    expect(formatParams(1_500_000_000_000)).toBe('1.5T')
    expect(formatParams(500)).toBe('500')
  })
})

describe('paramBucketOf', () => {
  it('buckets parameter counts', () => {
    expect(paramBucketOf(undefined)).toBeUndefined()
    expect(paramBucketOf(500e6)).toBe('lt1b')
    expect(paramBucketOf(3e9)).toBe('1to7b')
    expect(paramBucketOf(13e9)).toBe('7to30b')
    expect(paramBucketOf(70e9)).toBe('gt30b')
  })
})

describe('formatCount', () => {
  it('is locale-aware and compact', () => {
    expect(formatCount(1_234_567, 'en')).toBe('1.2M')
    expect(formatCount(950, 'en')).toBe('950')
  })
})
