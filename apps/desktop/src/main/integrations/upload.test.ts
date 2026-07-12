import { describe, expect, it, vi } from 'vitest'
import { buildRepoUrl, resolveHubUrl } from './upload'

// upload.ts pulls in ../hub for the proxied fetch, and hub.ts imports electron's
// `app` at module scope; vitest runs on plain Node, so stub the electron surface.
vi.mock('electron', () => ({ app: { getVersion: () => '0.0.0-test' } }))

describe('resolveHubUrl', () => {
  it('falls back to the default endpoint when none is configured', () => {
    expect(resolveHubUrl(null)).toBe('https://huggingface.co')
  })

  it('uses the configured endpoint and strips a trailing slash', () => {
    expect(resolveHubUrl('https://hub.example.com/')).toBe('https://hub.example.com')
    expect(resolveHubUrl('https://hub.example.com')).toBe('https://hub.example.com')
  })
})

describe('buildRepoUrl', () => {
  it('links the repo on the active endpoint with the kind prefix', () => {
    expect(buildRepoUrl('https://huggingface.co', 'model', 'me/repo')).toBe(
      'https://huggingface.co/me/repo'
    )
    expect(buildRepoUrl('https://hub.example.com', 'dataset', 'me/repo')).toBe(
      'https://hub.example.com/datasets/me/repo'
    )
    expect(buildRepoUrl('https://hub.example.com', 'space', 'me/repo')).toBe(
      'https://hub.example.com/spaces/me/repo'
    )
  })
})
