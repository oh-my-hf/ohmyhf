import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Throttle, gitBlobSha1OfFile } from './download-worker'

describe('Throttle', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('passes bytes straight through when the limit is null', async () => {
    const throttle = new Throttle(null)
    await expect(throttle.take(10_000_000)).resolves.toBeUndefined()
  })

  it('sleeps when the rolling rate exceeds the limit', async () => {
    vi.useFakeTimers()
    const throttle = new Throttle(1000) // 1000 B/s → 2000 B should take ~2 s
    let resolved = false
    void throttle.take(2000).then(() => {
      resolved = true
    })
    await vi.advanceTimersByTimeAsync(1900)
    expect(resolved).toBe(false)
    await vi.advanceTimersByTimeAsync(200)
    expect(resolved).toBe(true)
  })

  it('applies live rate updates in both directions', async () => {
    vi.useFakeTimers()
    const throttle = new Throttle(null)

    // Enabling a limit mid-flight starts throttling.
    throttle.setLimit(1000)
    let slow = false
    void throttle.take(1000).then(() => {
      slow = true
    })
    await vi.advanceTimersByTimeAsync(900)
    expect(slow).toBe(false)
    await vi.advanceTimersByTimeAsync(200)
    expect(slow).toBe(true)

    // Raising the limit resets the window: the same volume now passes quickly.
    throttle.setLimit(1_000_000)
    let fast = false
    void throttle.take(1000).then(() => {
      fast = true
    })
    await vi.advanceTimersByTimeAsync(10)
    expect(fast).toBe(true)
  })
})

describe('gitBlobSha1OfFile', () => {
  it('computes the git blob oid (blob <size>\\0 + content)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omh-worker-'))
    const file = join(dir, 'hello.txt')
    writeFileSync(file, 'hello\n')
    // `printf 'hello\n' | git hash-object --stdin`
    await expect(gitBlobSha1OfFile(file)).resolves.toBe('ce013625030ba8dba906f756967f9e9ca394464a')
  })
})
