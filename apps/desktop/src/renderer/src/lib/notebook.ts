import { normalizeShikiLanguage } from './file-kinds'

/**
 * Minimal Jupyter notebook (.ipynb) parser. Normalizes the nbformat v4 shape
 * into cells the renderer can display without knowing the on-disk quirks
 * (source and output payloads are each `string | string[]`, base64 image data
 * may be line-wrapped, tracebacks carry ANSI color codes). Returns null for
 * anything that is not a notebook so the caller can fall back to raw text.
 */

export interface NotebookImage {
  /** e.g. "image/png"; used as the data-URI media type. */
  mime: string
  /** Ready-to-use `data:` URI for an `<img>` src. */
  dataUri: string
}

export type NotebookOutput =
  | { kind: 'stream'; stream: 'stdout' | 'stderr'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'html'; html: string }
  | { kind: 'image'; image: NotebookImage }
  | { kind: 'error'; errorName: string; text: string }

export interface NotebookCell {
  type: 'markdown' | 'code' | 'raw'
  source: string
  /** Code cells only: the `In [n]:` counter, null when never executed. */
  executionCount?: number | null
  outputs?: NotebookOutput[]
}

export interface ParsedNotebook {
  /** Kernel language (e.g. "python"), used for code-cell highlighting. */
  language?: string
  cells: NotebookCell[]
}

/** nbformat stores multi-line strings as either a string or an array of lines. */
function joinMultiline(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' ? v : '')).join('')
  return typeof value === 'string' ? value : ''
}

// Strip ANSI escape sequences (SGR color codes dominate tracebacks). Built from
// String.fromCharCode so the ESC control char never appears in a regex literal.
const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, 'g')
function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '')
}

const IMAGE_MIME_ORDER = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']

function toImage(mime: string, raw: unknown): NotebookImage {
  if (mime === 'image/svg+xml') {
    // SVG payloads are XML text, not base64 — inline as a UTF-8 data URI. Loaded
    // via <img>, so any embedded script never executes.
    return { mime, dataUri: `data:${mime};utf8,${encodeURIComponent(joinMultiline(raw))}` }
  }
  // Raster images are base64; drop the whitespace nbformat may have wrapped in.
  const b64 = joinMultiline(raw).replace(/\s+/g, '')
  return { mime, dataUri: `data:${mime};base64,${b64}` }
}

function parseDisplayData(data: Record<string, unknown>): NotebookOutput | null {
  const imageMime = IMAGE_MIME_ORDER.find((m) => data[m] != null)
  if (imageMime) return { kind: 'image', image: toImage(imageMime, data[imageMime]) }
  if (data['text/html'] != null) return { kind: 'html', html: joinMultiline(data['text/html']) }
  if (data['text/plain'] != null) return { kind: 'text', text: joinMultiline(data['text/plain']) }
  return null
}

function parseOutput(output: unknown): NotebookOutput | null {
  if (typeof output !== 'object' || output === null) return null
  const o = output as Record<string, unknown>
  switch (o.output_type) {
    case 'stream':
      return {
        kind: 'stream',
        stream: o.name === 'stderr' ? 'stderr' : 'stdout',
        text: joinMultiline(o.text)
      }
    case 'execute_result':
    case 'display_data':
      return typeof o.data === 'object' && o.data !== null
        ? parseDisplayData(o.data as Record<string, unknown>)
        : null
    case 'error': {
      const traceback = Array.isArray(o.traceback)
        ? o.traceback.map((line) => (typeof line === 'string' ? line : '')).join('\n')
        : joinMultiline(o.evalue)
      return {
        kind: 'error',
        errorName: typeof o.ename === 'string' ? o.ename : 'Error',
        text: stripAnsi(traceback)
      }
    }
    default:
      return null
  }
}

function parseCell(cell: unknown): NotebookCell | null {
  if (typeof cell !== 'object' || cell === null) return null
  const c = cell as Record<string, unknown>
  const source = joinMultiline(c.source)
  if (c.cell_type === 'markdown') return { type: 'markdown', source }
  if (c.cell_type === 'raw') return { type: 'raw', source }
  if (c.cell_type === 'code') {
    const outputs = Array.isArray(c.outputs)
      ? c.outputs.map(parseOutput).filter((o): o is NotebookOutput => o !== null)
      : []
    return {
      type: 'code',
      source,
      executionCount: typeof c.execution_count === 'number' ? c.execution_count : null,
      outputs
    }
  }
  return null
}

function detectLanguage(metadata: unknown): string | undefined {
  if (typeof metadata !== 'object' || metadata === null) return undefined
  const m = metadata as Record<string, unknown>
  const info = m.language_info as Record<string, unknown> | undefined
  const kernel = m.kernelspec as Record<string, unknown> | undefined
  const candidates = [info?.name, kernel?.language, kernel?.name].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  )
  for (const candidate of candidates) {
    const normalized = normalizeShikiLanguage(candidate)
    if (normalized) return normalized
  }
  // Keep a real but unsupported kernel name so CodeBlock can explain why it
  // rendered plain text instead of silently pretending highlighting succeeded.
  return candidates[0]
}

/** Parse notebook JSON; returns null if the text is not a valid notebook. */
export function parseNotebook(json: string): ParsedNotebook | null {
  let doc: unknown
  try {
    doc = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof doc !== 'object' || doc === null) return null
  const root = doc as Record<string, unknown>
  if (!Array.isArray(root.cells)) return null
  const cells = root.cells.map(parseCell).filter((c): c is NotebookCell => c !== null)
  return { language: detectLanguage(root.metadata), cells }
}
