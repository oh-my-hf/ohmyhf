export class HubApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly url?: string
  ) {
    super(message)
    this.name = 'HubApiError'
  }
}

/**
 * Thrown before any network I/O when a cookie-authenticated endpoint is called
 * without a Hub web session. Deliberately carries no HTTP status so
 * isUnauthorized/isTokenRejection never mistake it for a token-auth failure.
 * The message embeds HUB_WEB_SESSION_REQUIRED because Electron flattens errors
 * to their message string across IPC — the renderer matches on that sentinel.
 */
export class CookieRequiredError extends HubApiError {
  constructor(url?: string) {
    super('this action needs a Hub web session (HUB_WEB_SESSION_REQUIRED)', undefined, url)
    this.name = 'CookieRequiredError'
  }
}

export function isCookieRequired(err: unknown): boolean {
  return err instanceof CookieRequiredError
}

export function isNotFound(err: unknown): boolean {
  return err instanceof HubApiError && err.status === 404
}

export function isUnauthorized(err: unknown): boolean {
  return err instanceof HubApiError && (err.status === 401 || err.status === 403)
}

/**
 * A definitive rejection from a token endpoint (invalid_grant is a 400).
 * Anything else — network failures, 429s, 5xx — is transient and must never
 * destroy stored credentials.
 */
export function isTokenRejection(err: unknown): boolean {
  return (
    err instanceof HubApiError &&
    (err.status === 400 || err.status === 401 || err.status === 403)
  )
}
