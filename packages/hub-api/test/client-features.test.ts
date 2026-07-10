import { describe, expect, it, vi } from 'vitest'
import { HubClient } from '../src'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

describe('HubClient.searchUsers', () => {
  it('maps users and absolutizes avatar URLs', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        users: [
          { user: 'julien', fullname: 'Julien C', avatarUrl: '/avatars/abc.svg' },
          { user: 'no-avatar' }
        ]
      })
    )
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    const users = await client.searchUsers('juli')
    expect(users).toEqual([
      { name: 'julien', fullname: 'Julien C', avatarUrl: 'https://huggingface.co/avatars/abc.svg' },
      { name: 'no-avatar', fullname: undefined, avatarUrl: undefined }
    ])
    const url = new URL(fetchImpl.mock.calls[0]![0] as string)
    expect(url.pathname).toBe('/api/quicksearch')
    expect(url.searchParams.get('type')).toBe('user')
  })

  it('degrades to empty on failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('x', { status: 500 }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0, maxRetries: 0 })
    await expect(client.searchUsers('x')).resolves.toEqual([])
  })
})

describe('HubClient.isInferenceAvailable', () => {
  it('is true when providers exist and false for an empty mapping', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ inference: 'warm', inferenceProviderMapping: { novita: {} } })
      )
      .mockResolvedValueOnce(jsonResponse({ inferenceProviderMapping: {} }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    await expect(client.isInferenceAvailable('a/b')).resolves.toBe(true)
    await expect(client.isInferenceAvailable('c/d')).resolves.toBe(false)
  })

  it('degrades to false on failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('x', { status: 500 }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0, maxRetries: 0 })
    await expect(client.isInferenceAvailable('a/b')).resolves.toBe(false)
  })
})
