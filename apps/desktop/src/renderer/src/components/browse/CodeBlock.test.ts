import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params?.language ? `${key}:${params.language}` : key
  })
}))

const { CodeBlock, HIGHLIGHT_MAX_CHARS } = await import('./CodeBlock')

describe('CodeBlock fallbacks', () => {
  it('labels oversized code as an intentional plain-text fallback', () => {
    const html = renderToStaticMarkup(
      createElement(CodeBlock, { code: 'x'.repeat(HIGHLIGHT_MAX_CHARS + 1), language: 'python' })
    )

    expect(html).toContain('detail:preview.highlightTooLarge')
    expect(html).toContain('<pre>')
  })

  it('labels an unknown fenced language instead of silently swallowing it', () => {
    const html = renderToStaticMarkup(
      createElement(CodeBlock, { code: 'custom syntax', language: 'custom-lang' })
    )

    expect(html).toContain('detail:preview.highlightUnknown:custom-lang')
    expect(html).toContain('role="status"')
  })
})
