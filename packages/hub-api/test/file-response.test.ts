import { describe, expect, it, vi } from 'vitest'
import { HubApiError, HubClient } from '../src'

describe('HubClient.fetchFileResponse', () => {
  it('fetches the encoded resolve URL with the bearer token and returns the raw response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([0x89, 0x50]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' }
      })
    )
    const client = new HubClient({
      fetchImpl,
      cacheTtlMs: 0,
      getAccessToken: () => 'hf_secret'
    })
    const res = await client.fetchFileResponse('model', 'owner/repo', 'assets/logo cat.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://huggingface.co/owner/repo/resolve/main/assets/logo%20cat.png')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer hf_secret' })
  })

  it('prefixes dataset repos and encodes the revision', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('x', { status: 200 }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0 })
    await client.fetchFileResponse('dataset', 'owner/data', 'img.png', 'refs/pr/1')
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://huggingface.co/datasets/owner/data/resolve/refs%2Fpr%2F1/img.png',
      expect.anything()
    )
  })

  it('sends no Authorization header when signed out', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('x', { status: 200 }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0 })
    await client.fetchFileResponse('model', 'owner/repo', 'img.png')
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(init.headers).not.toHaveProperty('Authorization')
  })

  it('throws HubApiError carrying the upstream status on failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('denied', { status: 403 }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0 })
    const err = await client
      .fetchFileResponse('model', 'owner/private', 'img.png')
      .then(() => null)
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(HubApiError)
    expect((err as HubApiError).status).toBe(403)
  })
})
