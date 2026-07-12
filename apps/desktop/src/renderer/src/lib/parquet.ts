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

/**
 * Sniff a byte-array cell for a known image format by its magic number, so an
 * image column (raw PNG/JPEG/… bytes, common in HF image datasets) can render as
 * a thumbnail instead of a "<N bytes>" placeholder. Returns the MIME type or null.
 */
export function imageMimeOfBytes(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null
  const [a, b, c, d] = bytes
  if (a === 0x89 && b === 0x50 && c === 0x4e && d === 0x47) return 'image/png'
  if (a === 0xff && b === 0xd8 && c === 0xff) return 'image/jpeg'
  if (a === 0x47 && b === 0x49 && c === 0x46) return 'image/gif' // GIF
  if (a === 0x42 && b === 0x4d) return 'image/bmp' // BM
  // RIFF....WEBP
  if (
    a === 0x52 &&
    b === 0x49 &&
    c === 0x46 &&
    d === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

/** Base64 `data:` URI for a byte array, chunked so large images don't blow the call stack. */
export function bytesToDataUri(bytes: Uint8Array, mime: string): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return `data:${mime};base64,${btoa(binary)}`
}
