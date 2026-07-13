import { describe, expect, it, vi } from 'vitest'

// The component import graph touches window.matchMedia at module scope
// (lib/theme.ts); stub just enough of it for this node-environment suite.
vi.stubGlobal('window', {
  matchMedia: () => ({ matches: false, addEventListener: () => {} })
})
const { markdownCodeLanguage, repoFileUrl, repoMarkdownLinkUrl } = await import('./MarkdownView')

describe('markdownCodeLanguage', () => {
  it('preserves the full fence token and normalizes aliases', () => {
    expect(markdownCodeLanguage('language-c++')).toBe('cpp')
    expect(markdownCodeLanguage('foo language-c# bar')).toBe('csharp')
    expect(markdownCodeLanguage('language-objective-c')).toBe('objective-c')
    expect(markdownCodeLanguage('language-shell-session')).toBe('shellsession')
  })

  it('keeps an unknown fence name so CodeBlock can explain the fallback', () => {
    expect(markdownCodeLanguage('language-custom-lang')).toBe('custom-lang')
    expect(markdownCodeLanguage(undefined)).toBeUndefined()
  })
})

describe('repoFileUrl', () => {
  it('builds an omhf-file URL the main-process handler can parse back', () => {
    const url = new URL(repoFileUrl('model', 'owner/repo', 'assets/logo cat.png'))
    expect(url.protocol).toBe('omhf-file:')
    expect(url.searchParams.get('kind')).toBe('model')
    expect(url.searchParams.get('repoId')).toBe('owner/repo')
    expect(url.searchParams.get('revision')).toBe('main')
    // The raw path round-trips: spaces, slashes and '&' survive the query encoding.
    expect(url.searchParams.get('path')).toBe('assets/logo cat.png')
  })

  it('keeps repoId and revision separate from the path', () => {
    const url = new URL(repoFileUrl('dataset', 'owner/data', 'a&b=c.png', 'refs/pr/1'))
    expect(url.searchParams.get('kind')).toBe('dataset')
    expect(url.searchParams.get('repoId')).toBe('owner/data')
    expect(url.searchParams.get('revision')).toBe('refs/pr/1')
    expect(url.searchParams.get('path')).toBe('a&b=c.png')
  })

  it('partitions custom-protocol cache entries by Hub endpoint', () => {
    const url = new URL(
      repoFileUrl('model', 'owner/repo', 'logo.png', 'main', 'https://hub.example.test/hf/')
    )
    expect(url.searchParams.get('endpoint')).toBe('https://hub.example.test/hf')
  })
})

describe('repoMarkdownLinkUrl', () => {
  it('uses the configured endpoint without double-encoding paths or URL suffixes', () => {
    expect(
      repoMarkdownLinkUrl(
        'model',
        'owner/repo',
        'refs/pr/1',
        'docs/a%20b.md?download=1#heading',
        'https://hub.example.test/hf'
      )
    ).toBe(
      'https://hub.example.test/hf/owner/repo/blob/refs%2Fpr%2F1/docs/a%20b.md?download=1#heading'
    )
  })
})
