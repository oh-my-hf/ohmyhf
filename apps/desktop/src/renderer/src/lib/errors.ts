/**
 * Renderer-side error classification. HubApiError's `status` field is lost over
 * the IPC boundary (Electron re-wraps thrown errors as plain Error), so the
 * HTTP status is recovered from the message shape the hub client and download
 * worker emit: "GET <url> failed: 401 Unauthorized". Callers should still log
 * the raw error via console.error — describeError is for the human.
 */
import type { TFunction } from 'i18next'
import { HUB_SESSION_REQUIRED_CODE } from '@oh-my-huggingface/shared'

export type ErrorKind =
  'auth' | 'gated' | 'notFound' | 'rateLimit' | 'server' | 'network' | 'unknown'

export interface ClassifiedError {
  kind: ErrorKind
  status?: number
}

const HTTP_STATUS_RE = /\bfailed: (\d{3})\b/

const NETWORK_RE =
  /fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network|timed? ?out|abort/i

export function classifyError(err: unknown): ClassifiedError {
  const message = err instanceof Error ? err.message : String(err)
  const status = Number(HTTP_STATUS_RE.exec(message)?.[1])
  if (Number.isFinite(status)) {
    if (status === 401) return { kind: 'auth', status }
    if (status === 403) return { kind: 'gated', status }
    if (status === 404) return { kind: 'notFound', status }
    if (status === 429) return { kind: 'rateLimit', status }
    if (status >= 500) return { kind: 'server', status }
    return { kind: 'unknown', status }
  }
  if (NETWORK_RE.test(message)) return { kind: 'network' }
  return { kind: 'unknown' }
}

/** Translated, plain-language message for an error (keys in the `errors` namespace). */
export function describeError(t: TFunction, err: unknown): string {
  return t(`errors:${classifyError(err).kind}`)
}

/**
 * IPC flattens HubApiError into a message string; sniff auth failures from it.
 * Deliberately broader than classifyError's 'auth' kind (403s and word-only
 * matches count too): callers use this to treat a credential-capability gap
 * as non-retryable instead of hammering the API.
 */
export function isAuthError(message: string): boolean {
  return /\b401\b|\b403\b|unauthorized|forbidden/i.test(message)
}

/**
 * A social write was attempted without a Hub web session (CookieRequiredError
 * in the main process). The sentinel rides the message across IPC.
 */
export function isHubSessionRequired(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return message.includes(HUB_SESSION_REQUIRED_CODE)
}
