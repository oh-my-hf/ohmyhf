import { describe, expect, it } from 'vitest'
import {
  CookieRequiredError,
  HubApiError,
  isForbidden,
  isNotFound,
  isTokenRejection,
  isUnauthorized
} from '../src'

describe('error classification', () => {
  it('isUnauthorized matches only a definitive 401', () => {
    expect(isUnauthorized(new HubApiError('x', 401))).toBe(true)
    // 403s come from WAF challenges, geo blocks, and gated repos — never a revoked token.
    expect(isUnauthorized(new HubApiError('x', 403))).toBe(false)
    expect(isUnauthorized(new HubApiError('x', 400))).toBe(false)
    expect(isUnauthorized(new HubApiError('x', 500))).toBe(false)
    expect(isUnauthorized(new HubApiError('x'))).toBe(false)
    expect(isUnauthorized(new CookieRequiredError())).toBe(false)
    expect(isUnauthorized(new Error('x'))).toBe(false)
  })

  it('isForbidden matches only 403', () => {
    expect(isForbidden(new HubApiError('x', 403))).toBe(true)
    expect(isForbidden(new HubApiError('x', 401))).toBe(false)
    expect(isForbidden(new HubApiError('x', 404))).toBe(false)
    expect(isForbidden(new HubApiError('x'))).toBe(false)
    expect(isForbidden(new Error('x'))).toBe(false)
  })

  it('isTokenRejection covers definitive token-endpoint rejections only', () => {
    for (const status of [400, 401, 403]) {
      expect(isTokenRejection(new HubApiError('x', status))).toBe(true)
    }
    // Transient failures must never destroy stored credentials.
    expect(isTokenRejection(new HubApiError('x', 429))).toBe(false)
    expect(isTokenRejection(new HubApiError('x', 500))).toBe(false)
    expect(isTokenRejection(new HubApiError('x'))).toBe(false)
    expect(isTokenRejection(new Error('x'))).toBe(false)
  })

  it('isNotFound matches only 404', () => {
    expect(isNotFound(new HubApiError('x', 404))).toBe(true)
    expect(isNotFound(new HubApiError('x', 403))).toBe(false)
    expect(isNotFound(new Error('x'))).toBe(false)
  })
})
