/** MIME fallback when Hub returns missing / generic Content-Type for omhf-file. */
const MIME_BY_EXTENSION: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  opus: 'audio/opus',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  ico: 'image/x-icon',
  bmp: 'image/bmp'
}

function extensionOf(path: string): string {
  const name = path.split('/').at(-1) ?? path
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

/**
 * Best-effort Content-Type for omhf-file streaming. Prefer a concrete Hub
 * header; fall back by path extension when it is missing or generic.
 */
export function mimeForOmhfFile(
  path: string,
  contentType: string | null | undefined
): string | null {
  const raw = contentType?.split(';')[0]?.trim().toLowerCase()
  if (raw && raw !== 'application/octet-stream' && raw !== 'binary/octet-stream') {
    return raw
  }
  return MIME_BY_EXTENSION[extensionOf(path)] ?? null
}
