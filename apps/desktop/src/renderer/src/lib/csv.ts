/**
 * Minimal CSV/TSV parser for file preview. Handles quoted fields with
 * embedded separators and doubled quotes; does not implement the full RFC.
 */

export function delimiterOf(path: string): ',' | '\t' {
  const name = path.toLowerCase()
  return name.endsWith('.tsv') ? '\t' : ','
}

/** Split one CSV/TSV record into fields. */
export function splitDelimitedLine(line: string, delimiter: ',' | '\t'): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === delimiter) {
      fields.push(current)
      current = ''
      continue
    }
    current += ch
  }
  fields.push(current)
  return fields
}

/** Split text into records, respecting quoted newlines. */
export function splitDelimitedRecords(text: string): string[] {
  const records: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '"') {
      current += ch
      if (inQuotes && text[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i++
      if (current.length > 0 || records.length > 0) records.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current.length > 0) records.push(current)
  return records
}

export interface CsvTable {
  columns: string[]
  rows: string[][]
}

/**
 * Parse a delimited text preview into a header + data rows. Empty input yields
 * an empty table; a single line is treated as header-only.
 */
export function parseCsvPreview(text: string, delimiter: ',' | '\t'): CsvTable {
  const records = splitDelimitedRecords(text)
  if (records.length === 0) return { columns: [], rows: [] }
  const columns = splitDelimitedLine(records[0]!, delimiter)
  const rows = records.slice(1).map((line) => {
    const cells = splitDelimitedLine(line, delimiter)
    // Pad / trim to header width so the table stays rectangular.
    if (cells.length === columns.length) return cells
    const out = columns.map((_, i) => cells[i] ?? '')
    return out
  })
  return { columns, rows }
}
