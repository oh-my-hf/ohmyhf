/** Pure text-editing helpers behind the Markdown editor (unit-tested in editor.test.ts). */

export type Format = 'bold' | 'italic' | 'code' | 'link' | 'quote' | 'list'

export interface FormatResult {
  next: string
  selectStart: number
  selectEnd: number
}

export function applyFormat(
  value: string,
  start: number,
  end: number,
  format: Format
): FormatResult {
  const selected = value.slice(start, end)
  const wrap = (fence: string): FormatResult => ({
    next: value.slice(0, start) + fence + selected + fence + value.slice(end),
    selectStart: start + fence.length,
    selectEnd: end + fence.length
  })
  switch (format) {
    case 'bold':
      return wrap('**')
    case 'italic':
      return wrap('*')
    case 'code':
      return wrap('`')
    case 'link': {
      // Selection becomes the link text; the url placeholder stays selected for overtyping.
      const next = `${value.slice(0, start)}[${selected}](url)${value.slice(end)}`
      const urlStart = start + selected.length + 3
      return { next, selectStart: urlStart, selectEnd: urlStart + 3 }
    }
    case 'quote':
    case 'list': {
      const marker = format === 'quote' ? '> ' : '- '
      // start === 0 must clamp to 0: lastIndexOf('\n', -1) would still find a leading newline.
      const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1
      const block = value.slice(lineStart, end)
      const prefixed = block
        .split('\n')
        .map((line) => marker + line)
        .join('\n')
      return {
        next: value.slice(0, lineStart) + prefixed + value.slice(end),
        selectStart: lineStart,
        selectEnd: lineStart + prefixed.length
      }
    }
  }
}

/** An @mention being typed: `start` is the index of the "@" in the draft. */
export interface ActiveMention {
  start: number
  query: string
}

/** Matches an "@partial-name" immediately before the caret (line start or after whitespace/brackets). */
const MENTION_BEFORE_CARET = /(?:^|[\s([{>])@([\w.-]{0,30})$/

export function mentionAtCaret(text: string, caret: number): ActiveMention | null {
  const match = MENTION_BEFORE_CARET.exec(text.slice(0, caret))
  if (!match) return null
  const query = match[1] ?? ''
  return { start: caret - query.length - 1, query }
}

/** `- `, `* `, `> `, `1. ` — the markers Enter should continue. */
const LINE_MARKER = /^(\s*)(?:(>)\s|([-*])\s|(\d+)\.\s)(.*)$/

export interface ContinueResult {
  next: string
  selectStart: number
}

/**
 * GitHub-style Enter behavior for a caret at `caret` (no selection): continue
 * `>`/`-`/`*`/`1.` markers (numbers increment), exit the list when the current
 * item is empty. Returns null when the line has no marker.
 */
export function continueLine(value: string, caret: number): ContinueResult | null {
  const lineStart = caret === 0 ? 0 : value.lastIndexOf('\n', caret - 1) + 1
  const match = LINE_MARKER.exec(value.slice(lineStart, caret))
  if (!match) return null
  const [, indent = '', quote, bullet, num, beforeCaret = ''] = match

  const lineEnd = value.indexOf('\n', caret)
  const afterCaret = value.slice(caret, lineEnd === -1 ? value.length : lineEnd)
  if (beforeCaret.trim() === '' && afterCaret.trim() === '') {
    // Enter on an empty item ends the list: drop the marker.
    return { next: value.slice(0, lineStart) + value.slice(caret), selectStart: lineStart }
  }
  const marker = quote ? '> ' : bullet ? `${bullet} ` : `${Number(num) + 1}. `
  const inserted = `\n${indent}${marker}`
  return {
    next: value.slice(0, caret) + inserted + value.slice(caret),
    selectStart: caret + inserted.length
  }
}
