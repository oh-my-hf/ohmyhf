import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo, Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

/**
 * Manual-token sign-in against a mock Hub: a pasted User Access Token must
 * validate via whoami-v2 before it replaces the session, and a rejected paste
 * must leave the previous state untouched. Asserts in-session behavior only —
 * on headless CI safeStorage may be unavailable, so the credentials file is
 * not part of the contract here.
 */
test('manual access-token sign-in validates against the Hub', async () => {
  const hub = createServer((req, res) => {
    if (req.url?.startsWith('/api/whoami-v2') === true) {
      if (req.headers.authorization === 'Bearer hf_e2e_good') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            name: 'e2e-user',
            fullname: 'E2E User',
            orgs: [],
            auth: {
              type: 'access_token',
              accessToken: { displayName: 'e2e-token', role: 'write' }
            }
          })
        )
        return
      }
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid credentials' }))
      return
    }
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not mocked' }))
  })
  await new Promise<void>((resolve) => {
    hub.listen(0, '127.0.0.1', resolve)
  })
  const endpoint = `http://127.0.0.1:${(hub.address() as AddressInfo).port}`

  const userDataDir = mkdtempSync(join(tmpdir(), 'omh-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..'),
    env: { ...process.env, OMH_USER_DATA_DIR: userDataDir, OMH_CREDENTIALS_DIR: userDataDir }
  })
  try {
    const window = await app.firstWindow()
    await window.waitForSelector('aside nav', { timeout: 30_000 })

    await window.evaluate(
      (hubEndpoint) => window.omh.invoke('settings:set', { patch: { hubEndpoint } }),
      endpoint
    )

    // A rejected token reports 'invalid' and never disturbs the session.
    const bad = await window.evaluate(() =>
      window.omh.invoke('auth:signInWithToken', { token: 'hf_e2e_bad' })
    )
    expect(bad).toEqual({ ok: false, error: 'invalid' })
    expect(await window.evaluate(() => window.omh.invoke('auth:getState', undefined))).toEqual({
      status: 'signedOut'
    })

    // A valid token becomes a token-mode session carrying the token identity.
    const good = await window.evaluate(() =>
      window.omh.invoke('auth:signInWithToken', { token: 'hf_e2e_good' })
    )
    expect(good).toMatchObject({
      ok: true,
      state: {
        status: 'signedIn',
        method: 'token',
        tokenDisplayName: 'e2e-token',
        tokenRole: 'write',
        user: { name: 'e2e-user' }
      }
    })

    // Settings → Account shows the token session badge.
    await window
      .getByRole('button', { name: /^(Settings|设置)$/ })
      .first()
      .click()
    await window.getByRole('button', { name: /^(Account|账户)$/ }).click()
    await expect(window.getByText(/^(Access token|访问令牌)$/)).toBeVisible()
    await expect(window.getByText('e2e-token')).toBeVisible()
    await expect(window.getByRole('button', { name: /^(Re-authorize|重新授权)$/ })).toHaveCount(0)
  } finally {
    await app.close()
    hub.close()
  }
})

/**
 * A Hub that accepts the connection but never answers must not spin the
 * sign-in forever: validation carries its own deadline and reports 'network'.
 * Regression test for the infinite "signing in" spinner on hostile networks
 * (no proxy to huggingface.co, stalled connections, saturated request slots).
 */
test('token sign-in fails fast when the Hub never responds', async () => {
  const sockets = new Set<Socket>()
  const hub = createServer(() => {
    // Accept the request and go silent — simulates a stalled connection.
  })
  hub.on('connection', (socket) => sockets.add(socket))
  await new Promise<void>((resolve) => {
    hub.listen(0, '127.0.0.1', resolve)
  })
  const endpoint = `http://127.0.0.1:${(hub.address() as AddressInfo).port}`

  const userDataDir = mkdtempSync(join(tmpdir(), 'omh-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..'),
    env: { ...process.env, OMH_USER_DATA_DIR: userDataDir, OMH_CREDENTIALS_DIR: userDataDir }
  })
  try {
    const window = await app.firstWindow()
    await window.waitForSelector('aside nav', { timeout: 30_000 })

    await window.evaluate(
      (hubEndpoint) => window.omh.invoke('settings:set', { patch: { hubEndpoint } }),
      endpoint
    )

    const started = Date.now()
    const result = await window.evaluate(() =>
      window.omh.invoke('auth:signInWithToken', { token: 'hf_e2e_stalled' })
    )
    expect(result).toEqual({ ok: false, error: 'network' })
    // Well under the spinner-forever regime (undici's default is 300s).
    expect(Date.now() - started).toBeLessThan(25_000)
    expect(await window.evaluate(() => window.omh.invoke('auth:getState', undefined))).toEqual({
      status: 'signedOut'
    })
  } finally {
    await app.close()
    for (const socket of sockets) socket.destroy()
    hub.close()
  }
})
