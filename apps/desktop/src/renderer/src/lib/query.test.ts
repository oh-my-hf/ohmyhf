import { describe, expect, it } from 'vitest'
import { isHubRemoteQuery } from './query'

describe('isHubRemoteQuery', () => {
  it('identifies Hub-backed query families', () => {
    expect(isHubRemoteQuery(['repo', 'model', 'org/name'])).toBe(true)
    expect(isHubRemoteQuery(['hub-notifications', 0])).toBe(true)
    expect(isHubRemoteQuery(['fileText', 'model', 'org/name', 'README.md'])).toBe(true)
  })

  it('preserves local and application query families', () => {
    expect(isHubRemoteQuery(['downloads'])).toBe(false)
    expect(isHubRemoteQuery(['cache'])).toBe(false)
    expect(isHubRemoteQuery(['favorites'])).toBe(false)
    expect(isHubRemoteQuery(['history'])).toBe(false)
    expect(isHubRemoteQuery(['app-update'])).toBe(false)
  })
})
