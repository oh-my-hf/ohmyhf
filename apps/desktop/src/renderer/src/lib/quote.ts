/**
 * Markdown blockquote helpers for "reply with quote" — mirrors the Hub's
 * behavior: prefix every line of the quoted comment with "> ", then leave a
 * blank line below for the reply. Empty lines become a bare ">" so the quote
 * stays contiguous.
 */
export function quoteMarkdown(content: string): string {
  const quoted = content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => (line === '' ? '>' : `> ${line}`))
    .join('\n')
  // Blockquote, then a blank line separating it from the reply, then the line
  // the caret lands on — so the user types one line below the quote.
  return `${quoted}\n\n\n`
}

/**
 * Append a quote block to an existing draft, separating it from prior text
 * with a blank line. Returns the quote alone when the draft is empty/blank.
 */
export function appendQuote(existing: string, content: string): string {
  const quote = quoteMarkdown(content)
  if (existing.trim() === '') return quote
  return `${existing.replace(/\n*$/, '')}\n\n${quote}`
}
