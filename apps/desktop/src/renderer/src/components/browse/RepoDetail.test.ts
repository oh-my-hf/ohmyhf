import { describe, expect, it, vi } from 'vitest'

// The component import graph touches window.matchMedia at module scope
// (lib/theme.ts); stub just enough of it for this node-environment suite.
vi.stubGlobal('window', {
  matchMedia: () => ({ matches: false, addEventListener: () => {} })
})
const { chatCompletionCapable } = await import('./RepoDetail')

describe('chatCompletionCapable', () => {
  it('accepts conversational text-generation and image-text-to-text models', () => {
    expect(
      chatCompletionCapable({ pipelineTag: 'text-generation', tags: ['conversational'] })
    ).toBe(true)
    expect(
      chatCompletionCapable({ pipelineTag: 'image-text-to-text', tags: ['conversational'] })
    ).toBe(true)
  })

  it('rejects completion-only language models without the conversational tag', () => {
    expect(chatCompletionCapable({ pipelineTag: 'text-generation', tags: [] })).toBe(false)
  })

  it('rejects non-chat tasks even when tagged conversational', () => {
    expect(chatCompletionCapable({ pipelineTag: 'sentence-similarity', tags: [] })).toBe(false)
    expect(chatCompletionCapable({ pipelineTag: 'text-to-image', tags: [] })).toBe(false)
    expect(chatCompletionCapable({ pipelineTag: 'fill-mask', tags: ['conversational'] })).toBe(
      false
    )
  })

  it('stays permissive while task metadata is unknown', () => {
    expect(chatCompletionCapable(undefined)).toBe(true)
    expect(chatCompletionCapable({ tags: ['conversational'] })).toBe(true)
  })
})
