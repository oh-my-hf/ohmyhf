import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import { HUB_SESSION_REQUIRED_CODE } from '@oh-my-huggingface/shared'
import { classifyError, describeError, isAuthError, isHubSessionRequired } from './errors'

/** Message shape the hub client emits: "GET <url> failed: <status> <statusText>". */
const hubError = (status: number, statusText: string): Error =>
  new Error(`GET https://huggingface.co/api/models failed: ${status} ${statusText}`)

describe('classifyError', () => {
  it('maps HTTP statuses recovered from the message', () => {
    expect(classifyError(hubError(401, 'Unauthorized'))).toEqual({ kind: 'auth', status: 401 })
    expect(classifyError(hubError(403, 'Forbidden'))).toEqual({ kind: 'gated', status: 403 })
    expect(classifyError(hubError(404, 'Not Found'))).toEqual({ kind: 'notFound', status: 404 })
    expect(classifyError(hubError(429, 'Too Many Requests'))).toEqual({
      kind: 'rateLimit',
      status: 429
    })
  })

  it('classifies 5xx as server errors', () => {
    expect(classifyError(hubError(500, 'Internal Server Error'))).toEqual({
      kind: 'server',
      status: 500
    })
    expect(classifyError(hubError(503, 'Service Unavailable'))).toEqual({
      kind: 'server',
      status: 503
    })
  })

  it('leaves unmapped 4xx statuses unknown but keeps the status', () => {
    expect(classifyError(hubError(422, 'Unprocessable Entity'))).toEqual({
      kind: 'unknown',
      status: 422
    })
  })

  it('recognizes network-failure shapes without a status', () => {
    expect(classifyError(new Error('fetch failed'))).toEqual({ kind: 'network' })
    expect(classifyError(new Error('getaddrinfo ENOTFOUND huggingface.co'))).toEqual({
      kind: 'network'
    })
    expect(classifyError(new Error('connect ECONNREFUSED 127.0.0.1:443'))).toEqual({
      kind: 'network'
    })
    expect(classifyError(new Error('read ECONNRESET'))).toEqual({ kind: 'network' })
    expect(classifyError(new Error('request timed out'))).toEqual({ kind: 'network' })
    expect(classifyError(new Error('The operation was aborted'))).toEqual({ kind: 'network' })
  })

  it('falls back to unknown for anything else, including non-Errors', () => {
    expect(classifyError(new Error('something exploded'))).toEqual({ kind: 'unknown' })
    expect(classifyError('plain string failure')).toEqual({ kind: 'unknown' })
    expect(classifyError(undefined)).toEqual({ kind: 'unknown' })
  })

  it('does not treat status-like numbers outside the message shape as statuses', () => {
    // "429" alone (e.g. inside a repo name) must not classify as rate limit.
    expect(classifyError(new Error('repo org/model-429 not readable'))).toEqual({
      kind: 'unknown'
    })
  })
})

describe('describeError', () => {
  const t = ((key: string) => key) as TFunction

  it('resolves the errors-namespace key for the classified kind', () => {
    expect(describeError(t, hubError(401, 'Unauthorized'))).toBe('errors:auth')
    expect(describeError(t, hubError(502, 'Bad Gateway'))).toBe('errors:server')
    expect(describeError(t, new Error('fetch failed'))).toBe('errors:network')
    expect(describeError(t, new Error('???'))).toBe('errors:unknown')
  })
})

describe('isAuthError', () => {
  it('matches 401/403 statuses and auth words in flattened IPC messages', () => {
    expect(
      isAuthError('GET https://huggingface.co/api/notifications failed: 401 Unauthorized')
    ).toBe(true)
    expect(isAuthError('GET https://huggingface.co/api/notifications failed: 403 Forbidden')).toBe(
      true
    )
    expect(isAuthError('Invalid credentials: unauthorized')).toBe(true)
  })

  it('does not match other failures or digits embedded in longer numbers', () => {
    expect(
      isAuthError('GET https://huggingface.co/api/models failed: 500 Internal Server Error')
    ).toBe(false)
    expect(isAuthError('fetch failed')).toBe(false)
    expect(isAuthError('repo org/model-4013 not readable')).toBe(false)
  })
})

describe('isHubSessionRequired', () => {
  it('detects the sentinel riding the message across IPC', () => {
    expect(isHubSessionRequired(new Error(`boom ${HUB_SESSION_REQUIRED_CODE}`))).toBe(true)
    expect(isHubSessionRequired(new Error('boom'))).toBe(false)
    expect(isHubSessionRequired('not an error')).toBe(false)
  })
})
