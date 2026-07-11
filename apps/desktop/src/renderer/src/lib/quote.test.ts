import { describe, expect, it } from 'vitest'
import { appendQuote, quoteMarkdown } from './quote'

describe('quoteMarkdown', () => {
  it('prefixes each line with "> " and leaves a blank line + caret line below', () => {
    expect(quoteMarkdown('hello\nworld')).toBe('> hello\n> world\n\n\n')
  })

  it('turns empty lines into a bare ">" so the quote stays contiguous', () => {
    expect(quoteMarkdown('a\n\nb')).toBe('> a\n>\n> b\n\n\n')
  })

  it('normalizes CRLF to LF', () => {
    expect(quoteMarkdown('a\r\nb')).toBe('> a\n> b\n\n\n')
  })
})

describe('appendQuote', () => {
  it('returns the quote alone when the draft is empty or blank', () => {
    expect(appendQuote('', 'hi')).toBe('> hi\n\n\n')
    expect(appendQuote('   \n', 'hi')).toBe('> hi\n\n\n')
  })

  it('separates a new quote from existing draft text with a blank line', () => {
    expect(appendQuote('my thoughts', 'quoted')).toBe('my thoughts\n\n> quoted\n\n\n')
  })

  it('collapses trailing newlines before appending (no triple gap)', () => {
    expect(appendQuote('draft\n\n', 'q')).toBe('draft\n\n> q\n\n\n')
  })
})
