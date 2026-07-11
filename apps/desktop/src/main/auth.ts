import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import type {
  AuthState,
  HubSessionConnectResult,
  TokenSignInResult,
  UserProfile
} from '@oh-my-huggingface/shared'
import type { HubClient } from '@oh-my-huggingface/hub-api'
import { isUnauthorized } from '@oh-my-huggingface/hub-api'
import type { AppDatabase } from './db'

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
  /**
   * How the token was obtained. Only `'token'` (pasted User Access Token) is
   * supported. Legacy OAuth grants (`mode` absent or `'oauth'`) are discarded
   * on restore so the user re-signs in with an access token.
   */
  mode?: 'oauth' | 'token'
  /** User-chosen token name from whoami-v2, for the Account UI. */
  tokenDisplayName?: string
  /** 'read' | 'write' | 'fineGrained' from whoami-v2, when reported. */
  tokenRole?: string
  /**
   * Supplemental Hub web-session credentials: a full Cookie header
   * (`token=…; csrf=…`) from login capture, or a legacy raw `token` value.
   * Unlocks the social writes / settings form POSTs the Hub blocks for Bearer
   * tokens. Extra fields inside the same encrypted envelope keep
   * the version-1 file forward/backward compatible.
   */
  sessionCookie?: string
  /** Whoami name the cookie validated as, for the Account UI. */
  sessionUsername?: string
}

/** Retry cadence after a transient (network/5xx) whoAmI failure at startup. */
const RETRY_MS = 60_000

export class AuthManager {
  private state: AuthState = { status: 'signedOut' }
  private token: StoredToken | null = null
  private retryTimer: NodeJS.Timeout | null = null
  /**
   * Bumped whenever the session owner changes intent (sign-out, new sign-in).
   * An in-flight whoAmI from a previous epoch must discard its result instead
   * of resurrecting a token the user just discarded.
   */
  private epoch = 0
  private client!: HubClient

  constructor(
    private readonly db: AppDatabase,
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

  /** Called by HubClient on cookie-authenticated (social write) requests. */
  sessionCookie(): string | undefined {
    return this.token?.sessionCookie
  }

  private setState(state: AuthState): void {
    this.state = state
    this.onChange(state)
  }

  private signedInState(user: UserProfile): AuthState {
    return {
      status: 'signedIn',
      user,
      method: 'token',
      tokenDisplayName: this.token?.tokenDisplayName,
      tokenRole: this.token?.tokenRole,
      hubSession: Boolean(this.token?.sessionCookie)
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
   * token another session already installed, so concurrent sessions stay in sync.
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
      this.persistToken()
    } catch (err) {
      console.warn('[auth] migrating legacy token to the shared file failed; keeping it in memory', err)
    }
    return token
  }

  /** Retry later WITHOUT touching stored credentials — transient failures only. */
  private scheduleRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => {
      void this.init()
    }, RETRY_MS)
    this.retryTimer.unref?.()
  }

  /**
   * Only pasted User Access Tokens are accepted. Legacy OAuth grants (no mode,
   * or mode === 'oauth') are cleared so the user signs in with a token.
   */
  private acceptToken(token: StoredToken | null): StoredToken | null {
    if (!token) return null
    if (token.mode === 'token' && token.accessToken) return token
    console.warn('[auth] discarding legacy OAuth session; sign in with an access token')
    return null
  }

  /** Restore the session at startup (also the retry entry point after transient failures). */
  async init(): Promise<void> {
    if (this.state.status !== 'signedOut') return
    // Prefer a sibling session's shared file (dev + packaged share ~/.oh_my_hf).
    const rawShared = this.readSharedToken()
    const rawLoaded = this.loadPersistedToken() ?? this.token
    const accepted = this.acceptToken(rawShared) ?? this.acceptToken(rawLoaded)
    if ((rawShared !== null || rawLoaded !== null) && accepted === null) {
      // Legacy OAuth grant on disk — wipe it so the user pastes an access token.
      this.token = null
      this.persistToken()
      return
    }
    this.token = accepted
    if (!this.token) return
    try {
      this.persistToken()
    } catch {
      // Memory-only is fine for this run.
    }
    try {
      const user = await this.client.whoAmI()
      this.setState(this.signedInState(user))
    } catch (err) {
      if (isUnauthorized(err)) {
        await this.signOut()
        return
      }
      console.warn('[auth] whoAmI failed at startup', err)
      this.scheduleRetry()
    }
  }

  /**
   * Sign in with a pasted User Access Token. The candidate is validated with
   * an out-of-band, deadline-bounded whoAmI and NOTHING is touched until it
   * proves valid: a failed, slow, or hung paste leaves the current session
   * and the shared credentials file exactly as they were.
   */
  async signInWithToken(raw: string): Promise<TokenSignInResult> {
    const accessToken = raw.trim()
    if (!accessToken) return { ok: false, error: 'invalid' }
    const startEpoch = this.epoch
    let validated: { user: UserProfile; tokenDisplayName?: string; tokenRole?: string }
    try {
      validated = await this.client.whoAmIWithToken(accessToken)
    } catch (err) {
      return { ok: false, error: isUnauthorized(err) ? 'invalid' : 'network' }
    }
    if (this.epoch !== startEpoch) {
      // The user signed out (or in) mid-validation; that newer intent owns
      // the session — discard the candidate without touching anything.
      return { ok: false, error: 'network' }
    }
    this.epoch += 1
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    this.token = {
      accessToken,
      mode: 'token',
      tokenDisplayName: validated.tokenDisplayName,
      tokenRole: validated.tokenRole
    }
    this.persistToken()
    this.client.invalidateCache()
    this.setState(this.signedInState(validated.user))
    return { ok: true, state: this.state }
  }

  /**
   * Install a captured Hub web-session cookie as the supplemental credential.
   * Requires an existing token session (the cookie augments it, never replaces
   * it) and validates out of band with the same epoch discipline as
   * signInWithToken: nothing is touched until the cookie proves valid, and a
   * cookie that belongs to a different account than the token session is
   * rejected before persistence.
   */
  async connectHubSession(cookie: string): Promise<HubSessionConnectResult> {
    const trimmed = cookie.trim()
    if (!trimmed || this.state.status !== 'signedIn' || !this.token) {
      return { ok: false, error: 'invalid' }
    }
    const sessionUser = this.state.user
    const startEpoch = this.epoch
    let validated: { user: UserProfile }
    try {
      validated = await this.client.whoAmIWithCookie(trimmed)
    } catch (err) {
      return { ok: false, error: isUnauthorized(err) ? 'invalid' : 'network' }
    }
    if (this.epoch !== startEpoch || this.state.status !== 'signedIn' || !this.token) {
      // The user signed out (or re-signed-in) mid-validation; newer intent wins.
      return { ok: false, error: 'network' }
    }
    if (validated.user.name.toLowerCase() !== sessionUser.name.toLowerCase()) {
      return { ok: false, error: 'mismatch' }
    }
    this.token = { ...this.token, sessionCookie: trimmed, sessionUsername: validated.user.name }
    try {
      this.persistToken()
    } catch {
      // Memory-only is fine for this run (mirrors init()).
    }
    this.setState(this.signedInState(sessionUser))
    return { ok: true, state: this.state }
  }

  /**
   * Drop the web-session cookie, keeping the token session signed in. Also the
   * landing point when a cookie-backed call comes back 401 (cookie expired).
   */
  async disconnectHubSession(): Promise<AuthState> {
    if (this.token?.sessionCookie) {
      const { sessionCookie: _cookie, sessionUsername: _name, ...rest } = this.token
      this.token = rest
      try {
        this.persistToken()
      } catch {
        // Memory-only is fine for this run.
      }
      if (this.state.status === 'signedIn') {
        this.setState(this.signedInState(this.state.user))
      }
    }
    return this.state
  }

  /**
   * Re-fetch whoami and broadcast the updated profile (avatar, fullname, …).
   * Soft-fails on transient errors so a successful profile save still returns
   * to the caller. Busts Chromium's HTTP cache for stable `/avatars/` URLs.
   */
  async refreshUser(): Promise<AuthState> {
    if (this.state.status !== 'signedIn' || !this.token) return this.state
    try {
      const user = await this.client.whoAmI()
      this.setState(
        this.signedInState({
          ...user,
          avatarUrl: bustAvatarCache(user.avatarUrl)
        })
      )
    } catch (err) {
      console.warn('[auth] refreshUser failed', err)
    }
    return this.state
  }

  async signOut(): Promise<AuthState> {
    this.epoch += 1
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    this.token = null
    this.persistToken()
    this.client.invalidateCache()
    this.setState({ status: 'signedOut' })
    return this.state
  }
}

/** Append ?v= so Chromium does not keep a stale Hub /avatars/… image. */
function bustAvatarCache(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    const abs = url.startsWith('/') ? `https://huggingface.co${url}` : url
    const parsed = new URL(abs)
    if (!parsed.pathname.includes('/avatars/')) return abs
    parsed.searchParams.set('v', String(Date.now()))
    return parsed.toString()
  } catch {
    return url
  }
}
