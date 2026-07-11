/**
 * Hub web-session capture: opens a real browser window on the Hub login page
 * and waits for the session cookie (named `token`) to appear. Captures the
 * full cookie jar for the Hub host (CSRF companion cookies included) — form
 * POSTs need more than `token=` alone. The values are secrets — they never
 * reach the renderer and are never logged.
 */
import { BrowserWindow, session } from 'electron'

export type HubSessionCapture =
  | { ok: true; cookie: string }
  | { ok: false; error: 'canceled' | 'timeout' }

/** Give the user plenty of room for passwords, 2FA, and SSO round-trips. */
const DEFAULT_TIMEOUT_MS = 10 * 60_000

/**
 * In-memory partition (no `persist:` prefix): nothing the user types into the
 * login page survives the capture — we clear storage on every exit path and
 * the partition dies with the app regardless.
 */
const LOGIN_PARTITION = 'hub-login'

let pending: { promise: Promise<HubSessionCapture>; focus: () => void } | null = null

export function captureHubSessionCookie(opts: {
  endpoint: string
  proxyUrl: string | null
  parent?: BrowserWindow
  timeoutMs?: number
}): Promise<HubSessionCapture> {
  // Singleton: a second click focuses the already-open login window instead
  // of stacking a new one.
  if (pending) {
    pending.focus()
    return pending.promise
  }
  const run = start(opts)
  pending = { promise: run.promise.finally(() => (pending = null)), focus: run.focus }
  return pending.promise
}

function start(opts: {
  endpoint: string
  proxyUrl: string | null
  parent?: BrowserWindow
  timeoutMs?: number
}): { promise: Promise<HubSessionCapture>; focus: () => void } {
  let endpointHost = ''
  try {
    endpointHost = new URL(opts.endpoint).hostname
  } catch {
    // Unusable endpoint: the window would never produce a matching cookie.
  }

  const ses = session.fromPartition(LOGIN_PARTITION)
  const win = new BrowserWindow({
    width: 480,
    height: 720,
    parent: opts.parent,
    autoHideMenuBar: true,
    webPreferences: {
      partition: LOGIN_PARTITION,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  const promise = new Promise<HubSessionCapture>((resolve) => {
    let settled = false
    let timer: NodeJS.Timeout | null = null

    const finish = (result: HubSessionCapture): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      ses.cookies.removeListener('changed', onCookieChanged)
      if (!win.isDestroyed()) win.destroy()
      // Wipe everything the login page left behind (including the cookie
      // itself — our encrypted credentials file is the single source of truth).
      void ses.clearStorageData().catch(() => undefined)
      resolve(result)
    }

    const matchesEndpoint = (cookieDomain: string | undefined): boolean => {
      if (!endpointHost || !cookieDomain) return false
      const domain = cookieDomain.replace(/^\./, '')
      return endpointHost === domain || endpointHost.endsWith(`.${domain}`)
    }

    /** Full Cookie header for the Hub host once `token` is present. */
    const captureJar = async (): Promise<string | null> => {
      const cookies = await ses.cookies.get({})
      const forHost = cookies.filter((c) => Boolean(c.value) && matchesEndpoint(c.domain))
      const token = forHost.find((c) => c.name === 'token')
      if (!token?.value) return null
      const rest = forHost.filter((c) => c.name !== 'token')
      return [`token=${token.value}`, ...rest.map((c) => `${c.name}=${c.value}`)].join('; ')
    }

    const tryFinishWithJar = (): void => {
      void captureJar()
        .then((jar) => {
          if (jar) finish({ ok: true, cookie: jar })
        })
        .catch(() => undefined)
    }

    const onCookieChanged = (
      _event: unknown,
      cookie: Electron.Cookie,
      _cause: string,
      removed: boolean
    ): void => {
      if (removed || cookie.name !== 'token' || !cookie.value) return
      if (!matchesEndpoint(cookie.domain)) return
      // Defer a tick so any CSRF companion cookies set in the same response
      // land before we snapshot the jar.
      setTimeout(tryFinishWithJar, 50)
    }

    // Fallback sweep: if the cookie landed before our listener attached (or
    // the partition somehow kept one), catch it after each navigation.
    const sweep = (): void => {
      tryFinishWithJar()
    }

    ses.cookies.on('changed', onCookieChanged)
    win.webContents.on('did-navigate', sweep)
    // The user closing the window is a cancel, not an error.
    win.on('closed', () => finish({ ok: false, error: 'canceled' }))
    timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    timer.unref?.()

    // The default-session proxy (proxy.ts) does not apply to custom
    // partitions; mirror it here so the login window works behind a proxy.
    // Deliberately NO navigation restrictions inside this window: SSO logins
    // (Google/Apple) bounce through third-party hosts and back.
    void ses
      .setProxy(opts.proxyUrl ? { proxyRules: opts.proxyUrl } : { mode: 'system' })
      .then(() => {
        sweep()
        return win.loadURL(`${opts.endpoint.replace(/\/$/, '')}/login`)
      })
      .catch(() => {
        // Load failures leave the window open with Chromium's error page; the
        // timeout or a user close resolves the capture.
      })
  })

  return {
    promise,
    focus: () => {
      if (!win.isDestroyed()) win.focus()
    }
  }
}
