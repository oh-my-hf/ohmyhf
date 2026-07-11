import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

/**
 * Hub web-session connect flow against a mock Hub: `auth:connectHubSession`
 * opens a login window on {endpoint}/login, captures the `token` cookie the
 * page sets, validates it via whoami-v2 with Cookie auth, and installs it as
 * the supplemental credential — unless the cookie belongs to a different
 * account than the token session (mismatch), which must be rejected without
 * touching the session.
 */
test('connecting a Hub web session captures and validates the login cookie', async () => {
  // Flipped to a mismatching account's cookie for the second connect.
  let loginCookie = 'e2e_cookie'
  const userForCookie: Record<string, string> = {
    e2e_cookie: 'e2e-user',
    e2e_other: 'other-user'
  }

  const hub = createServer((req, res) => {
    if (req.url?.startsWith('/login') === true) {
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Set-Cookie': `token=${loginCookie}; Path=/; HttpOnly`
      })
      res.end('<!doctype html><title>login</title>signed in')
      return
    }
    if (req.url?.startsWith('/api/whoami-v2') === true) {
      const cookieUser = /(?:^|;\s*)token=([^;]+)/.exec(req.headers.cookie ?? '')?.[1]
      const name =
        req.headers.authorization === 'Bearer hf_e2e_good'
          ? 'e2e-user'
          : cookieUser !== undefined
            ? userForCookie[cookieUser]
            : undefined
      if (name !== undefined) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            name,
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

    // Web sessions supplement a token session; without one, connect refuses.
    const signedOut = await window.evaluate(() =>
      window.omh.invoke('auth:connectHubSession', undefined)
    )
    expect(signedOut).toEqual({ ok: false, error: 'invalid' })

    const signIn = await window.evaluate(() =>
      window.omh.invoke('auth:signInWithToken', { token: 'hf_e2e_good' })
    )
    expect(signIn).toMatchObject({ ok: true, state: { hubSession: false } })

    // The login window opens, the mock /login sets the cookie, capture + whoami succeed.
    const connected = await window.evaluate(() =>
      window.omh.invoke('auth:connectHubSession', undefined)
    )
    expect(connected).toMatchObject({
      ok: true,
      state: { status: 'signedIn', hubSession: true, user: { name: 'e2e-user' } }
    })
    expect(
      await window.evaluate(() => window.omh.invoke('auth:getState', undefined))
    ).toMatchObject({ hubSession: true })

    // Settings → Account shows the connected badge and the disconnect control.
    await window
      .getByRole('button', { name: /^(Settings|设置)$/ })
      .first()
      .click()
    await window.getByRole('button', { name: /^(Account|账户)$/ }).click()
    await expect(window.getByText(/^(Hub web session|Hub 网页会话)$/)).toBeVisible()
    await expect(window.getByText(/^(Connected|已连接)$/)).toBeVisible()

    // Disconnect drops only the cookie; the token session stays signed in.
    await window.getByRole('button', { name: /^(Disconnect|断开连接)$/ }).click()
    await expect(window.getByText(/^(Connected|已连接)$/)).toHaveCount(0)
    expect(
      await window.evaluate(() => window.omh.invoke('auth:getState', undefined))
    ).toMatchObject({ status: 'signedIn', hubSession: false })

    // A login that belongs to a different account is rejected before persistence.
    loginCookie = 'e2e_other'
    const mismatch = await window.evaluate(() =>
      window.omh.invoke('auth:connectHubSession', undefined)
    )
    expect(mismatch).toEqual({ ok: false, error: 'mismatch' })
    expect(
      await window.evaluate(() => window.omh.invoke('auth:getState', undefined))
    ).toMatchObject({ status: 'signedIn', hubSession: false })
  } finally {
    await app.close()
    hub.close()
  }
})
