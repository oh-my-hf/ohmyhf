import { describe, expect, it, vi } from 'vitest'

// @/lib/theme (via @/stores/app) reads window.matchMedia at module scope; stub it
// so the component module can load in the node test environment.
vi.stubGlobal('window', {
  matchMedia: () => ({ matches: false, addEventListener: () => {} })
})

const { sortsForKind } = await import('./CommandPalette')

describe('sortsForKind', () => {
  it('offers every sort for models and datasets', () => {
    const all = ['trending', 'downloads', 'likes', 'updated', 'created']
    expect(sortsForKind('model')).toEqual(all)
    expect(sortsForKind('dataset')).toEqual(all)
  })

  it('excludes downloads for spaces, matching FiltersBar', () => {
    expect(sortsForKind('space')).toEqual(['trending', 'likes', 'updated', 'created'])
  })
})
