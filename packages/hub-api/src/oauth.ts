/**
 * OAuth 2.0 + PKCE helpers for "Sign in with Hugging Face".
 * Pure functions — the desktop flow (loopback server, system browser) lives in the app.
 */
import { DEFAULT_ENDPOINT } from './client'
import { HubApiError } from './errors'

export interface PkcePair {
  verifier: string
  challenge: string
}

function base64url(bytes: Uint8Array): string {
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function generatePkce(): Promise<PkcePair> {
  const random = new Uint8Array(64)
  globalThis.crypto.getRandomValues(random)
  const verifier = base64url(random)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return { verifier, challenge: base64url(new Uint8Array(digest)) }
}

export function generateState(): string {
  const random = new Uint8Array(16)
  globalThis.crypto.getRandomValues(random)
  return base64url(random)
}

export interface AuthorizeUrlOptions {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
  scopes?: string[]
  endpoint?: string
}

/**
 * write-repos enables the upload workflow, write-discussions enables replies,
 * inference-api enables the playground, read/write-collections enable the
 * collections manager, manage-repos enables repo administration (rename,
 * visibility, deletion, gated-access review), read-billing enables the usage
 * summary. Users who signed in before a scope was added must sign out and back
 * in to pick it up — the UI gates those features on the granted scopes instead
 * of failing. The OAuth app registration must allow every scope listed here.
 */
export const DEFAULT_SCOPES = [
  'openid',
  'profile',
  'read-repos',
  'write-repos',
  'write-discussions',
  'inference-api',
  'read-collections',
  'write-collections',
  'manage-repos',
  'read-billing'
]

export function buildAuthorizeUrl(opts: AuthorizeUrlOptions): string {
  const url = new URL(`${opts.endpoint ?? DEFAULT_ENDPOINT}/oauth/authorize`)
  url.searchParams.set('client_id', opts.clientId)
  url.searchParams.set('redirect_uri', opts.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', (opts.scopes ?? DEFAULT_SCOPES).join(' '))
  url.searchParams.set('state', opts.state)
  url.searchParams.set('code_challenge', opts.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
  refresh_token?: string
  id_token?: string
  scope?: string
}

async function postToken(
  params: Record<string, string>,
  endpoint: string,
  fetchImpl: typeof fetch
): Promise<TokenResponse> {
  const url = `${endpoint}/oauth/token`
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new HubApiError(`Token exchange failed: ${res.status} ${text}`, res.status, url)
  }
  return (await res.json()) as TokenResponse
}

export interface ExchangeCodeOptions {
  clientId: string
  redirectUri: string
  code: string
  codeVerifier: string
  endpoint?: string
  fetchImpl?: typeof fetch
}

export async function exchangeCode(opts: ExchangeCodeOptions): Promise<TokenResponse> {
  return postToken(
    {
      client_id: opts.clientId,
      grant_type: 'authorization_code',
      code: opts.code,
      redirect_uri: opts.redirectUri,
      code_verifier: opts.codeVerifier
    },
    opts.endpoint ?? DEFAULT_ENDPOINT,
    opts.fetchImpl ?? fetch
  )
}

export interface RefreshTokenOptions {
  clientId: string
  refreshToken: string
  endpoint?: string
  fetchImpl?: typeof fetch
}

export async function refreshAccessToken(opts: RefreshTokenOptions): Promise<TokenResponse> {
  return postToken(
    {
      client_id: opts.clientId,
      grant_type: 'refresh_token',
      refresh_token: opts.refreshToken
    },
    opts.endpoint ?? DEFAULT_ENDPOINT,
    opts.fetchImpl ?? fetch
  )
}
