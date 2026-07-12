import { describe, expect, it } from 'vitest'
import {
  bytesToDataUri,
  formatParquetCell,
  imageMimeOfBytes,
  isUnsupportedCodecError
} from './parquet'

describe('imageMimeOfBytes', () => {
  const pad = (head: number[]): Uint8Array => {
    const b = new Uint8Array(16)
    b.set(head)
    return b
  }
  it('recognizes common image magic numbers', () => {
    expect(imageMimeOfBytes(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'image/png'
    )
    expect(imageMimeOfBytes(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(imageMimeOfBytes(pad([0x47, 0x49, 0x46, 0x38]))).toBe('image/gif')
    const webp = pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
    expect(imageMimeOfBytes(webp)).toBe('image/webp')
  })
  it('returns null for non-image or too-short bytes', () => {
    expect(imageMimeOfBytes(pad([0x0e, 0x00, 0x0a, 0x0c]))).toBeNull()
    expect(imageMimeOfBytes(new Uint8Array([0x89, 0x50]))).toBeNull()
  })
})

describe('bytesToDataUri', () => {
  it('builds a base64 data URI with the given mime', () => {
    expect(bytesToDataUri(new Uint8Array([104, 105]), 'image/png')).toBe(
      'data:image/png;base64,aGk='
    )
  })
  it('handles arrays larger than the chunk size without throwing', () => {
    const big = new Uint8Array(0x8000 * 2 + 5).fill(65)
    const uri = bytesToDataUri(big, 'image/jpeg')
    expect(uri.startsWith('data:image/jpeg;base64,')).toBe(true)
  })
})

describe('formatParquetCell', () => {
  it('renders empty for null/undefined', () => {
    expect(formatParquetCell(null)).toBe('')
    expect(formatParquetCell(undefined)).toBe('')
  })

  it('passes strings through and stringifies primitives', () => {
    expect(formatParquetCell('hello')).toBe('hello')
    expect(formatParquetCell(42)).toBe('42')
    expect(formatParquetCell(true)).toBe('true')
  })

  it('renders bigints (INT64) without precision loss', () => {
    expect(formatParquetCell(9007199254740993n)).toBe('9007199254740993')
  })

  it('renders timestamps as ISO', () => {
    expect(formatParquetCell(new Date('2026-01-02T03:04:05.000Z'))).toBe('2026-01-02T03:04:05.000Z')
  })

  it('summarizes byte-array cells by length', () => {
    expect(formatParquetCell(new Uint8Array([1, 2, 3]))).toBe('<3 bytes>')
  })

  it('json-encodes nested struct/list cells, coercing nested bigints', () => {
    expect(formatParquetCell({ a: 1, b: [2, 3] })).toBe('{"a":1,"b":[2,3]}')
    expect(formatParquetCell([{ id: 5n }])).toBe('[{"id":"5"}]')
  })
})

describe('isUnsupportedCodecError', () => {
  it('flags codec/compression failures', () => {
    expect(isUnsupportedCodecError('unsupported compression codec ZSTD')).toBe(true)
    expect(isUnsupportedCodecError('brotli not available')).toBe(true)
  })

  it('does not flag unrelated errors', () => {
    expect(isUnsupportedCodecError('network request failed')).toBe(false)
  })
})
