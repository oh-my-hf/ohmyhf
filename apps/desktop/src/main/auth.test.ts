import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthState, UserProfile } from '@oh-my-huggingface/shared'
import { HubApiError, type HubClient } from '@oh-my-huggingface/hub-api'
import { AuthManager } from './auth'
import type { AppDatabase } from './db'

const electronMock = vi.hoisted(() => ({
  encryptionAvailable: true,
  encryptThrows: false,
  online: true
}))

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => electronMock.encryptionAvailable,
    encryptString: (value: string) => {
      if (electronMock.encryptThrows) throw new Error('keychain unavailable')
      return Buffer.from(value, 'utf8')
    },
    decryptString: (cipher: Buffer) => cipher.toString('utf8')
  },
  net: { isOnline: () => electronMock.online }
}))

const USER = { name: 'tester', orgs: [] } as UserProfile

function makeClient(): {
  whoAmI: ReturnType<typeof vi.fn>
  whoAmIWithToken: ReturnType<typeof vi.fn>
  whoAmIWithCookie: ReturnType<typeof vi.fn>
  invalidateCache: ReturnType<typeof vi.fn>
} {
  return {
    whoAmI: vi.fn(),
    whoAmIWithToken: vi.fn(),
    whoAmIWithCookie: vi.fn(),
    invalidateCache: vi.fn()
  }
}

function makeDb(runImpl: () => void = () => {}): AppDatabase {
  return {
    prepare: () => ({ run: runImpl, get: () => undefined })
  } as unknown as AppDatabase
}

/** Matches the on-disk format persistToken writes with the mocked safeStorage. */
function writeCredentials(dir: string, token: object): void {
  writeFileSync(
    join(dir, 'credentials.json'),
    JSON.stringify({
      version: 1,
      cipher: Buffer.from(JSON.stringify(token), 'utf8').toString('base64')
    })
  )
}

describe('AuthManager', () => {
  let dir: string
  let states: AuthState[]

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'omh-auth-test-'))
    process.env.OMH_CREDENTIALS_DIR = dir
    electronMock.encryptionAvailable = true
    electronMock.encryptThrows = false
    electronMock.online = true
    states = []
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.OMH_CREDENTIALS_DIR
    rmSync(dir, { recursive: true, force: true })
  })

  function makeAuth(client: ReturnType<typeof makeClient>, db = makeDb()): AuthManager {
    const auth = new AuthManager(db, (state) => states.push(state))
    auth.attachClient(client as unknown as HubClient)
    return auth
  }

  it('keeps stored credentials on a startup 403 and retries', async () => {
    vi.useFakeTimers()
    writeCredentials(dir, { accessToken: 'hf_x', mode: 'token' })
    const client = makeClient()
    client.whoAmI.mockRejectedValue(new HubApiError('blocked', 403))
    const auth = makeAuth(client)
    await auth.init()
    expect(auth.getState().status).toBe('signedOut')
    // A 403 (WAF/geo block) must never destroy the credentials file.
    expect(existsSync(join(dir, 'credentials.json'))).toBe(true)
    // The retry loop restores the session once the block clears.
    client.whoAmI.mockResolvedValue(USER)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(auth.getState().status).toBe('signedIn')
  })

  it('signs out and wipes credentials only on a definitive startup 401', async () => {
    writeCredentials(dir, { accessToken: 'hf_x', mode: 'token' })
    const client = makeClient()
    client.whoAmI.mockRejectedValue(new HubApiError('revoked', 401))
    const auth = makeAuth(client)
    await auth.init()
    expect(auth.getState().status).toBe('signedOut')
    expect(existsSync(join(dir, 'credentials.json'))).toBe(false)
  })

  it('signInWithToken still signs in when persisting the token fails', async () => {
    electronMock.encryptThrows = true
    const client = makeClient()
    client.whoAmIWithToken.mockResolvedValue({ user: USER })
    const auth = makeAuth(client)
    const result = await auth.signInWithToken('hf_new')
    expect(result.ok).toBe(true)
    expect(auth.getState().status).toBe('signedIn')
    expect(states.at(-1)?.status).toBe('signedIn')
  })

  it('signOut completes even when clearing persisted state fails', async () => {
    const client = makeClient()
    client.whoAmIWithToken.mockResolvedValue({ user: USER })
    const auth = makeAuth(
      client,
      makeDb(() => {
        throw new Error('disk full')
      })
    )
    await auth.signInWithToken('hf_x')
    expect(auth.getState().status).toBe('signedIn')
    const state = await auth.signOut()
    expect(state.status).toBe('signedOut')
    expect(auth.accessToken()).toBeUndefined()
  })

  it('detects a token revoked mid-session and signs out', async () => {
    vi.useFakeTimers()
    const client = makeClient()
    client.whoAmIWithToken.mockResolvedValue({ user: USER })
    client.whoAmI.mockRejectedValue(new HubApiError('revoked', 401))
    const auth = makeAuth(client)
    await auth.signInWithToken('hf_x')
    expect(auth.getState().status).toBe('signedIn')
    // Re-validation runs at 15 min plus up to 1 min of jitter.
    await vi.advanceTimersByTimeAsync(16 * 60_000)
    expect(auth.getState().status).toBe('signedOut')
    expect(existsSync(join(dir, 'credentials.json'))).toBe(false)
  })

  it('keeps the session when mid-run re-validation fails transiently', async () => {
    vi.useFakeTimers()
    const client = makeClient()
    client.whoAmIWithToken.mockResolvedValue({ user: USER })
    client.whoAmI.mockRejectedValue(new HubApiError('unavailable', 500))
    const auth = makeAuth(client)
    await auth.signInWithToken('hf_x')
    await vi.advanceTimersByTimeAsync(16 * 60_000)
    expect(auth.getState().status).toBe('signedIn')
    expect(existsSync(join(dir, 'credentials.json'))).toBe(true)
  })

  it('re-checks immediately when connectivity returns', async () => {
    vi.useFakeTimers()
    electronMock.online = false
    writeCredentials(dir, { accessToken: 'hf_x', mode: 'token' })
    const client = makeClient()
    client.whoAmI.mockRejectedValue(new TypeError('fetch failed'))
    const auth = makeAuth(client)
    await auth.init()
    expect(auth.getState().status).toBe('signedOut')
    client.whoAmI.mockResolvedValue(USER)
    electronMock.online = true
    // The online poll (5s cadence) fires the re-check without waiting out the backoff.
    await vi.advanceTimersByTimeAsync(5_000)
    expect(auth.getState().status).toBe('signedIn')
  })
})
