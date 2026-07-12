/**
 * Stringify a decoded parquet cell for display in the preview table. hyparquet
 * returns native JS values — bigints for INT64, typed arrays for BYTE_ARRAY,
 * Date for timestamps, and nested objects/arrays for struct/list columns — none
 * of which render directly in a table cell.
 */
export function formatParquetCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    const n = value instanceof Uint8Array ? value.byteLength : value.byteLength
    return `<${n} bytes>`
  }
  // Struct/list columns: JSON, with bigints coerced to strings so it can't throw.
  try {
    return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v))
  } catch {
    return String(value)
  }
}

/**
 * hyparquet throws when a page uses a codec it can't decode (e.g. zstd/brotli
 * without hyparquet-compressors). Detect that so the UI can show a clear,
 * download-instead message rather than a raw error.
 */
export function isUnsupportedCodecError(message: string): boolean {
  return /unsupported|compress|codec|snappy|zstd|brotli|lz4|gzip/i.test(message)
}
