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

export function isNotFound(err: unknown): boolean {
  return err instanceof HubApiError && err.status === 404
}

export function isUnauthorized(err: unknown): boolean {
  return err instanceof HubApiError && (err.status === 401 || err.status === 403)
}

/**
 * A definitive rejection from the OAuth token endpoint (invalid_grant is a 400).
 * Anything else — network failures, 429s, 5xx — is transient and must never
 * destroy stored credentials.
 */
export function isTokenRejection(err: unknown): boolean {
  return (
    err instanceof HubApiError &&
    (err.status === 400 || err.status === 401 || err.status === 403)
  )
}
