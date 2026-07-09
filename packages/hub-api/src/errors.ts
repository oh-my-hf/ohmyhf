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
