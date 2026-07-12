import { describe, expect, it } from 'vitest'
import { formatParquetCell, isUnsupportedCodecError } from './parquet'

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
