import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { safeStorage, shell } from 'electron'
import type { AuthState, UserProfile } from '@oh-my-huggingface/shared'
import type { HubClient } from '@oh-my-huggingface/hub-api'
import {
  DEFAULT_SCOPES,
  buildAuthorizeUrl,
  exchangeCode,
  generatePkce,
  generateState,
  isTokenRejection,
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

/**
 * The one OAuth client id for this app. Hard-pinned and intentionally NOT
 * configurable at runtime: every build — dev, packaged, and any profile —
 * authenticates against the same registered "Oh My HuggingFace" OAuth app, so
 * the consent screen name and the loopback redirect allowlist always match.
 *
 * This is a PUBLIC client id (PKCE, no secret). It necessarily travels in the
 * authorize URL and can be read by anyone; it is not sensitive and hiding it
 * would buy no security. Misuse is prevented on the Hugging Face side — by the
 * OAuth app's redirect-URI allowlist (locked to REDIRECT_URI below) and by the
 * app name shown on the consent screen — never by keeping this string secret.
 * See the "Security" section of the README.
 */
const CLIENT_ID = '91ed1d9e-c0b8-4dab-a81d-a44a26c11373'

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
  /** OAuth scopes granted to this token; the UI gates features on them. */
  scopes?: string[]
}

/** Retry cadence after a transient (network/5xx) refresh failure. */
const REFRESH_RETRY_MS = 60_000

/** Thrown to abort an in-flight sign-in the user chose to cancel. */
class SignInCanceledError extends Error {
  constructor() {
    super('sign-in canceled')
    this.name = 'SignInCanceledError'
  }
}

export class AuthManager {
  private state: AuthState = { status: 'signedOut' }
  private token: StoredToken | null = null
  private refreshTimer: NodeJS.Timeout | null = null
  private refreshing: Promise<boolean> | null = null
  /**
   * Bumped whenever the session owner changes intent (sign-out, new sign-in).
   * An in-flight refresh from a previous epoch must discard its result instead
   * of resurrecting a token the user just discarded.
   */
  private epoch = 0
  /** Outcome of the last post-refresh session restore; init() keys off it. */
  private lastRestoreOutcome: 'signedIn' | 'unauthorized' | 'transient' = 'signedIn'
  /** Aborts the in-flight loopback wait so the user can cancel a stuck sign-in. */
  private cancelPending: ((err: Error) => void) | null = null
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

  private tokenFromResponse(res: TokenResponse, fallbackScopes?: string[]): StoredToken {
    return {
      accessToken: res.access_token,
      refreshToken: res.refresh_token,
      expiresAt: res.expires_in ? Date.now() + res.expires_in * 1000 : undefined,
      scopes: res.scope ? res.scope.split(/\s+/).filter(Boolean) : fallbackScopes
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
    // Atomic replace: concurrent sessions read this file, a torn write must be impossible.
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify({ version: 1, cipher: cipher.toString('base64') }), {
      mode: 0o600
    })
    renameSync(tmp, file)
    // The pre-shared-credentials location; clear it so there is one source of truth.
    this.db.prepare('DELETE FROM auth WHERE id = 1').run()
  }

  /**
   * Decrypt the shared credentials file without side effects. Used to adopt a
   * token another session already rotated before (or after) trying our own
   * refresh token, so concurrent sessions never sign each other out.
   */
  private readSharedToken(): StoredToken | null {
    if (!safeStorage.isEncryptionAvailable()) return null
    const file = credentialsFile()
    if (!existsSync(file)) return null
    try {
      const { cipher } = JSON.parse(readFileSync(file, 'utf8')) as { cipher: string }
      return JSON.parse(safeStorage.decryptString(Buffer.from(cipher, 'base64'))) as StoredToken
    } catch {
      return null
    }
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
    let token: StoredToken
    try {
      token = JSON.parse(safeStorage.decryptString(row.token_cipher)) as StoredToken
    } catch (err) {
      console.warn('[auth] failed to decrypt stored token, discarding', err)
      this.db.prepare('DELETE FROM auth WHERE id = 1').run()
      return null
    }
    this.token = token
    try {
      // Best-effort migration to the shared file; a failed write (full/read-only
      // disk) must not reject init() — the in-memory token still works this run.
      this.persistToken()
    } catch (err) {
      console.warn('[auth] migrating legacy token to the shared file failed; keeping it in memory', err)
    }
    return token
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

  /** Retry later WITHOUT touching stored credentials — transient failures only. */
  private scheduleRetry(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(() => {
      if (this.state.status === 'signedIn') void this.refresh()
      else void this.init()
    }, REFRESH_RETRY_MS)
    this.refreshTimer.unref?.()
  }

  private refresh(): Promise<boolean> {
    // Single-flight: the expiry timer and 401-triggered refreshes must not race.
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }

  private async doRefresh(): Promise<boolean> {
    const epoch = this.epoch
    // A concurrent session (dev + packaged share ~/.oh_my_hf) may already have
    // rotated the token: adopt the shared file's version instead of spending a
    // refresh token that would be rejected as already-used.
    const shared = this.readSharedToken()
    if (
      shared &&
      shared.accessToken !== this.token?.accessToken &&
      (!shared.expiresAt || shared.expiresAt > Date.now() + 60_000)
    ) {
      this.token = shared
      this.scheduleRefresh()
      this.client.invalidateCache()
      await this.restoreStateIfNeeded(epoch)
      return true
    }
    const current = this.token
    const refreshToken = current?.refreshToken
    if (!refreshToken) return false
    try {
      const res = await refreshAccessToken({ clientId: CLIENT_ID, refreshToken })
      if (epoch !== this.epoch) return false // signed out (or re-signed-in) mid-flight
      this.token = this.tokenFromResponse(res, current?.scopes)
      // The token endpoint may omit refresh_token when it does not rotate.
      this.token.refreshToken ??= refreshToken
      this.persistToken()
      this.scheduleRefresh()
      this.client.invalidateCache()
      await this.restoreStateIfNeeded(epoch)
      return true
    } catch (err) {
      if (epoch !== this.epoch) return false // stale outcome either way
      if (!isTokenRejection(err)) {
        // Offline, 5xx, 429: keep the credentials and try again later. Deleting
        // them here is how a sleeping laptop used to sign the whole app out.
        console.warn('[auth] token refresh failed transiently; retrying later', err)
        this.scheduleRetry()
        return false
      }
      // Definitively rejected. One last chance: a concurrent session may have
      // rotated the token while our request was in flight — adopt its result.
      const latest = this.readSharedToken()
      if (latest && latest.refreshToken && latest.refreshToken !== refreshToken) {
        this.token = latest
        this.scheduleRefresh()
        this.client.invalidateCache()
        await this.restoreStateIfNeeded(epoch)
        return true
      }
      console.warn('[auth] refresh token rejected; signing out', err)
      await this.signOut()
      return false
    }
  }

  /**
   * After a background refresh succeeds while the UI shows signed-out, restore
   * the session. The outcome distinguishes a dead grant (whoAmI 401 on a fresh
   * token) from transient trouble — only the former may destroy credentials.
   * `epoch` is the caller's session generation: if it changed across the
   * whoAmI await (the user signed out or signed in elsewhere), we neither touch
   * state nor arm a retry — the newer intent owns the session now.
   */
  private async restoreStateIfNeeded(
    epoch: number
  ): Promise<'signedIn' | 'unauthorized' | 'transient' | 'stale'> {
    if (this.state.status === 'signedIn') return (this.lastRestoreOutcome = 'signedIn')
    try {
      const user = await this.client.whoAmI()
      if (epoch !== this.epoch) return 'stale'
      if (this.token) {
        this.setState({ status: 'signedIn', user, scopes: this.token.scopes })
      }
      return (this.lastRestoreOutcome = 'signedIn')
    } catch (err) {
      if (epoch !== this.epoch) return 'stale'
      if (isUnauthorized(err)) return (this.lastRestoreOutcome = 'unauthorized')
      // Network trouble: stay signed out for now, retry recovers.
      console.warn('[auth] whoAmI failed after refresh; will retry', err)
      this.scheduleRetry()
      return (this.lastRestoreOutcome = 'transient')
    }
  }

  /** Restore the session at startup (also the retry entry point after transient failures). */
  async init(): Promise<void> {
    if (this.state.status !== 'signedOut') return
    // The file is the source of truth; fall back to a memory-only token when
    // OS encryption is unavailable and nothing was ever persisted.
    this.token = this.loadPersistedToken() ?? this.token
    if (!this.token) return
    if (this.token.expiresAt && this.token.expiresAt < Date.now()) {
      // refresh() restores the session on success and schedules a retry on
      // transient failure. A rotated token that still can't whoAmI (401) is a
      // dead grant — sign out to clear the stale credentials, same as below.
      const ok = await this.refresh()
      if (ok && this.getState().status !== 'signedIn' && this.lastRestoreOutcome === 'unauthorized') {
        await this.signOut()
      }
      return
    }
    try {
      const user = await this.client.whoAmI()
      this.setState({ status: 'signedIn', user, scopes: this.token.scopes })
      this.scheduleRefresh()
    } catch (err) {
      if (isUnauthorized(err)) {
        const ok = await this.refresh()
        // Only a definitive 401/403 on a freshly rotated token means the grant
        // is dead; transient whoAmI failures already scheduled their own retry.
        if (ok && this.getState().status !== 'signedIn') {
          if (this.lastRestoreOutcome === 'unauthorized') await this.signOut()
        }
      } else {
        // Network trouble: keep the token, stay signed out in the UI, retry soon.
        console.warn('[auth] whoAmI failed at startup', err)
        this.scheduleRetry()
      }
    }
  }

  /**
   * Full desktop OAuth 2.0 + PKCE flow: loopback server for the redirect,
   * system browser for the authorize page.
   */
  async signIn(): Promise<AuthState> {
    if (this.state.status === 'signingIn') return this.state
    // Re-authorization (e.g. to pick up new scopes) starts from a valid session;
    // an abandoned or failed attempt must restore it, never destroy it.
    const previousToken = this.token
    const previousState = this.state
    const startEpoch = this.epoch
    this.setState({ status: 'signingIn' })
    let acquired = false
    try {
      const code = await this.runAuthorizationFlow()
      const tokenRes = await exchangeCode({
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
        code: code.code,
        codeVerifier: code.verifier
      })
      if (this.epoch !== startEpoch) {
        // The user signed out mid-flow; discard the new grant.
        this.setState({ status: 'signedOut' })
        return this.state
      }
      this.epoch += 1 // discard any in-flight refresh of the old token
      // Fall back to the requested scopes when the token response omits `scope`.
      this.token = this.tokenFromResponse(tokenRes, DEFAULT_SCOPES)
      // The grant is live in memory now; anything past this point that throws
      // (persist to a full/read-only disk, whoAmI) must recover via the retry
      // loop, never strand the session in 'signingIn' or drop a valid token.
      acquired = true
      this.persistToken()
      this.scheduleRefresh()
      this.client.invalidateCache()
      const user: UserProfile = await this.client.whoAmI()
      this.setState({ status: 'signedIn', user, scopes: this.token.scopes })
    } catch (err) {
      if (acquired) {
        // The new token is stored and scheduled; only the profile fetch failed.
        // Stay signed out in the UI and let the retry loop finish the job.
        console.warn('[auth] whoAmI failed right after sign-in; retrying shortly', err)
        this.setState({ status: 'signedOut' })
        this.scheduleRetry()
        throw err
      }
      if (err instanceof SignInCanceledError) {
        // User aborted before a token was acquired. Never throw (no error toast)
        // and never leave the UI stuck in 'signingIn'. If a concurrent refresh
        // already restored a signed-in session, leave it; otherwise put the
        // prior session (signed-in for a re-auth, signed-out otherwise) back.
        if (this.getState().status === 'signingIn') {
          // this.token is already correct: previousToken if untouched, or the
          // fresher token a concurrent refresh installed — keep either.
          this.setState(
            previousState.status === 'signedIn' ? previousState : { status: 'signedOut' }
          )
          if (this.token) this.scheduleRefresh()
        }
        return this.state
      }
      if (this.epoch === startEpoch && this.token === previousToken) {
        // Failed before acquiring anything AND nothing rotated the token while
        // the OAuth flow was open (doRefresh does not bump the epoch): put the
        // previous session back. If a background refresh replaced this.token,
        // leave its fresher value in place — restoring the stale snapshot would
        // spend an already-rotated refresh token.
        console.warn('[auth] sign-in failed; restoring the previous session', err)
        this.setState(previousState.status === 'signedIn' ? previousState : { status: 'signedOut' })
        if (previousToken) this.scheduleRefresh()
      }
      throw err
    }
    return this.state
  }

  /**
   * Abort an in-flight sign-in (e.g. the user closed the browser without
   * authorizing). Closes the loopback server immediately; signIn() then
   * restores the previous session state, which broadcasts to the UI.
   */
  async cancelSignIn(): Promise<AuthState> {
    if (this.state.status !== 'signingIn') return this.state
    this.cancelPending?.(new SignInCanceledError())
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
        this.cancelPending = null
      }

      // Let cancelSignIn() abort the wait immediately instead of leaving the
      // user stuck on "waiting for browser…" until the 5-minute timeout.
      this.cancelPending = (err: Error): void => {
        cleanup()
        reject(err)
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
    this.epoch += 1 // an in-flight refresh must not resurrect the session
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = null
    this.token = null
    this.persistToken()
    this.client.invalidateCache()
    this.setState({ status: 'signedOut' })
    return this.state
  }
}
