import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { safeStorage, shell } from 'electron'
import type { AuthState, UserProfile } from '@oh-my-huggingface/shared'
import type { HubClient } from '@oh-my-huggingface/hub-api'
import {
  buildAuthorizeUrl,
  exchangeCode,
  generatePkce,
  generateState,
  isUnauthorized,
  refreshAccessToken,
  type TokenResponse
} from '@oh-my-huggingface/hub-api'
import type { AppDatabase } from './db'
import type { MainI18n } from './i18n'

/**
 * The redirect URL is fixed by the OAuth app registration on the Hub, so the
 * loopback server must bind exactly this port.
 */
const REDIRECT_PORT = 51789
const REDIRECT_PATH = '/callback'
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}${REDIRECT_PATH}`
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000

/** Shared development client id; override with HF_OAUTH_CLIENT_ID (see README). */
const CLIENT_ID = process.env.HF_OAUTH_CLIENT_ID ?? '91ed1d9e-c0b8-4dab-a81d-a44a26c11373'

/**
 * Credentials live OUTSIDE the per-profile userData so every session — packaged,
 * dev, and any extra profile — shares one login. Still safeStorage-encrypted;
 * never plaintext. Tests isolate themselves via OMH_CREDENTIALS_DIR.
 */
function credentialsFile(): string {
  const dir = process.env.OMH_CREDENTIALS_DIR ?? join(homedir(), '.oh_my_hf')
  return join(dir, 'credentials.json')
}

interface StoredToken {
  accessToken: string
  refreshToken?: string
  /** Epoch ms; undefined = no known expiry. */
  expiresAt?: number
}

export class AuthManager {
  private state: AuthState = { status: 'signedOut' }
  private token: StoredToken | null = null
  private refreshTimer: NodeJS.Timeout | null = null
  private client!: HubClient

  constructor(
    private readonly db: AppDatabase,
    private readonly i18n: MainI18n,
    private readonly onChange: (state: AuthState) => void
  ) {}

  attachClient(client: HubClient): void {
    this.client = client
  }

  getState(): AuthState {
    return this.state
  }

  /** Called by HubClient on every request. */
  accessToken(): string | undefined {
    return this.token?.accessToken
  }

  private setState(state: AuthState): void {
    this.state = state
    this.onChange(state)
  }

  private tokenFromResponse(res: TokenResponse): StoredToken {
    return {
      accessToken: res.access_token,
      refreshToken: res.refresh_token,
      expiresAt: res.expires_in ? Date.now() + res.expires_in * 1000 : undefined
    }
  }

  private persistToken(): void {
    const file = credentialsFile()
    if (!this.token) {
      rmSync(file, { force: true })
      this.db.prepare('DELETE FROM auth WHERE id = 1').run()
      return
    }
    if (!safeStorage.isEncryptionAvailable()) {
      // Hard rule: never store the token unencrypted. Session stays in memory only.
      console.warn('[auth] OS encryption unavailable; token will not be persisted')
      return
    }
    const cipher = safeStorage.encryptString(JSON.stringify(this.token))
    mkdirSync(join(file, '..'), { recursive: true, mode: 0o700 })
    writeFileSync(
      file,
      JSON.stringify({ version: 1, cipher: cipher.toString('base64') }),
      { mode: 0o600 }
    )
    // The pre-shared-credentials location; clear it so there is one source of truth.
    this.db.prepare('DELETE FROM auth WHERE id = 1').run()
  }

  private loadPersistedToken(): StoredToken | null {
    if (!safeStorage.isEncryptionAvailable()) return null
    const file = credentialsFile()
    if (existsSync(file)) {
      try {
        const { cipher } = JSON.parse(readFileSync(file, 'utf8')) as { cipher: string }
        return JSON.parse(
          safeStorage.decryptString(Buffer.from(cipher, 'base64'))
        ) as StoredToken
      } catch (err) {
        console.warn('[auth] failed to decrypt shared credentials, discarding', err)
        rmSync(file, { force: true })
      }
    }
    // Legacy location (pre-shared-credentials): migrate out of the profile DB.
    const row = this.db.prepare('SELECT token_cipher FROM auth WHERE id = 1').get() as
      | { token_cipher: Buffer }
      | undefined
    if (!row) return null
    try {
      const token = JSON.parse(safeStorage.decryptString(row.token_cipher)) as StoredToken
      this.token = token
      this.persistToken()
      return token
    } catch (err) {
      console.warn('[auth] failed to decrypt stored token, discarding', err)
      this.db.prepare('DELETE FROM auth WHERE id = 1').run()
      return null
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = null
    const expiresAt = this.token?.expiresAt
    if (!expiresAt || !this.token?.refreshToken) return
    const delay = Math.max(10_000, expiresAt - Date.now() - 2 * 60 * 1000)
    this.refreshTimer = setTimeout(() => void this.refresh(), delay)
    this.refreshTimer.unref?.()
  }

  private async refresh(): Promise<boolean> {
    const refreshToken = this.token?.refreshToken
    if (!refreshToken) return false
    try {
      const res = await refreshAccessToken({ clientId: CLIENT_ID, refreshToken })
      this.token = { refreshToken, ...this.tokenFromResponse(res) }
      this.persistToken()
      this.scheduleRefresh()
      this.client.invalidateCache()
      return true
    } catch (err) {
      console.warn('[auth] token refresh failed', err)
      await this.signOut()
      return false
    }
  }

  /** Restore the session at startup. */
  async init(): Promise<void> {
    this.token = this.loadPersistedToken()
    if (!this.token) return
    if (this.token.expiresAt && this.token.expiresAt < Date.now()) {
      const ok = await this.refresh()
      if (!ok) return
    }
    try {
      const user = await this.client.whoAmI()
      this.setState({ status: 'signedIn', user })
      this.scheduleRefresh()
    } catch (err) {
      if (isUnauthorized(err)) {
        const ok = await this.refresh()
        if (ok) {
          try {
            const user = await this.client.whoAmI()
            this.setState({ status: 'signedIn', user })
            return
          } catch {
            /* fall through to sign-out */
          }
        }
        await this.signOut()
      } else {
        // Network trouble: keep the token, stay optimistically signed out in UI.
        console.warn('[auth] whoAmI failed at startup', err)
      }
    }
  }

  /**
   * Full desktop OAuth 2.0 + PKCE flow: loopback server for the redirect,
   * system browser for the authorize page.
   */
  async signIn(): Promise<AuthState> {
    if (this.state.status === 'signingIn') return this.state
    this.setState({ status: 'signingIn' })
    try {
      const code = await this.runAuthorizationFlow()
      const tokenRes = await exchangeCode({
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
        code: code.code,
        codeVerifier: code.verifier
      })
      this.token = this.tokenFromResponse(tokenRes)
      this.persistToken()
      this.scheduleRefresh()
      this.client.invalidateCache()
      const user: UserProfile = await this.client.whoAmI()
      this.setState({ status: 'signedIn', user })
    } catch (err) {
      console.warn('[auth] sign-in failed', err)
      this.token = null
      this.persistToken()
      this.setState({ status: 'signedOut' })
      throw err
    }
    return this.state
  }

  private runAuthorizationFlow(): Promise<{ code: string; verifier: string }> {
    return new Promise((resolve, reject) => {
      let server: Server | null = null
      let timeout: NodeJS.Timeout | null = null
      const cleanup = (): void => {
        if (timeout) clearTimeout(timeout)
        server?.close()
        server = null
      }

      void (async () => {
        const pkce = await generatePkce()
        const state = generateState()

        const html = (title: string, body: string): string =>
          `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>` +
          `<body style="font-family: system-ui; max-width: 40rem; margin: 4rem auto; line-height: 1.6">` +
          `<h2>${title}</h2><p>${body}</p></body></html>`

        server = createServer((req, res) => {
          const url = new URL(req.url ?? '/', REDIRECT_URI)
          if (url.pathname !== REDIRECT_PATH) {
            res.writeHead(404).end()
            return
          }
          const returnedState = url.searchParams.get('state')
          const code = url.searchParams.get('code')
          const error = url.searchParams.get('error')
          if (error || !code || returnedState !== state) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(html(this.i18n.t('oauth.failedTitle'), this.i18n.t('oauth.failedBody')))
            cleanup()
            reject(new Error(error ?? 'OAuth callback missing code or state mismatch'))
            return
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(html(this.i18n.t('oauth.successTitle'), this.i18n.t('oauth.successBody')))
          cleanup()
          resolve({ code, verifier: pkce.verifier })
        })

        server.on('error', (err) => {
          cleanup()
          reject(err)
        })

        server.listen(REDIRECT_PORT, '127.0.0.1', () => {
          timeout = setTimeout(() => {
            cleanup()
            reject(new Error('Sign-in timed out'))
          }, SIGN_IN_TIMEOUT_MS)
          const authorizeUrl = buildAuthorizeUrl({
            clientId: CLIENT_ID,
            redirectUri: REDIRECT_URI,
            state,
            codeChallenge: pkce.challenge
          })
          void shell.openExternal(authorizeUrl)
        })
      })().catch((err) => {
        cleanup()
        reject(err instanceof Error ? err : new Error(String(err)))
      })
    })
  }

  async signOut(): Promise<AuthState> {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = null
    this.token = null
    this.persistToken()
    this.client.invalidateCache()
    this.setState({ status: 'signedOut' })
    return this.state
  }
}
