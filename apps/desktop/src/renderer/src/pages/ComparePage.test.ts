import { describe, expect, it } from 'vitest'
import { isValidRepoId } from '@oh-my-huggingface/shared'

// ComparePage validates typed model ids with the shared predicate (which
// mirrors the `repoId` IPC schema); these cases pin down what it accepts.
describe('isValidRepoId', () => {
  it('accepts canonical single-segment model ids', () => {
    expect(isValidRepoId('gpt2')).toBe(true)
    expect(isValidRepoId('bert-base-uncased')).toBe(true)
    expect(isValidRepoId('t5-small')).toBe(true)
  })

  it('accepts owner/name ids', () => {
    expect(isValidRepoId('meta-llama/Llama-3-8B')).toBe(true)
    expect(isValidRepoId('openai/whisper-large-v3')).toBe(true)
    expect(isValidRepoId('stabilityai/stable-diffusion-2.1')).toBe(true)
  })

  it('rejects malformed ids', () => {
    expect(isValidRepoId('')).toBe(false)
    expect(isValidRepoId('a/b/c')).toBe(false)
    expect(isValidRepoId('owner/')).toBe(false)
    expect(isValidRepoId('/name')).toBe(false)
    expect(isValidRepoId('has space')).toBe(false)
  })

  it('rejects dot-only segments like the shared repoId schema', () => {
    expect(isValidRepoId('.')).toBe(false)
    expect(isValidRepoId('..')).toBe(false)
    expect(isValidRepoId('../etc')).toBe(false)
    expect(isValidRepoId('owner/..')).toBe(false)
  })

  it('rejects ids longer than 256 characters', () => {
    expect(isValidRepoId('a'.repeat(257))).toBe(false)
    expect(isValidRepoId('a'.repeat(256))).toBe(true)
  })
})
