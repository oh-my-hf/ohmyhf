import { describe, expect, it, vi } from 'vitest'

// The component import graph touches window.matchMedia at module scope
// (lib/theme.ts); stub just enough of it for this node-environment suite.
vi.stubGlobal('window', {
  matchMedia: () => ({ matches: false, addEventListener: () => {} })
})
const { repoFileUrl } = await import('./MarkdownView')

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
})
