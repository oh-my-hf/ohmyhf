import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { buildAuthorizeUrl, exchangeCode, generatePkce, generateState } from '../src'

describe('generatePkce', () => {
  it('produces a base64url verifier and its S256 challenge', async () => {
    const { verifier, challenge } = await generatePkce()
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
    const expected = createHash('sha256').update(verifier).digest('base64url')
    expect(challenge).toBe(expected)
  })

  it('is random', async () => {
    const a = await generatePkce()
    const b = await generatePkce()
    expect(a.verifier).not.toBe(b.verifier)
    expect(generateState()).not.toBe(generateState())
  })
})

describe('buildAuthorizeUrl', () => {
  it('includes all required OAuth + PKCE parameters', () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: 'client-123',
        redirectUri: 'http://127.0.0.1:51789/callback',
        state: 'st',
        codeChallenge: 'ch'
      })
    )
    expect(url.origin).toBe('https://huggingface.co')
    expect(url.pathname).toBe('/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('client-123')
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:51789/callback')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('scope')).toContain('read-repos')
  })
})

describe('exchangeCode', () => {
  it('posts a form-encoded body to /oauth/token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'tok', token_type: 'bearer' }), { status: 200 })
    )
    const res = await exchangeCode({
      clientId: 'c',
      redirectUri: 'http://127.0.0.1:51789/callback',
      code: 'the-code',
      codeVerifier: 'the-verifier',
      fetchImpl
    })
    expect(res.access_token).toBe('tok')
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://huggingface.co/oauth/token')
    const params = new URLSearchParams(init.body as string)
    expect(params.get('grant_type')).toBe('authorization_code')
    expect(params.get('code')).toBe('the-code')
    expect(params.get('code_verifier')).toBe('the-verifier')
  })

  it('throws on a failed exchange', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('bad', { status: 400 }))
    await expect(
      exchangeCode({
        clientId: 'c',
        redirectUri: 'r',
        code: 'x',
        codeVerifier: 'v',
        fetchImpl
      })
    ).rejects.toMatchObject({ status: 400 })
  })
})
