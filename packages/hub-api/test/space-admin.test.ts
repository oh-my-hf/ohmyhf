import { describe, expect, it, vi } from 'vitest'
import { HubClient } from '../src'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

const FAST = { cacheTtlMs: 0, minRequestGapMs: 0 } as const

function requestOf(
  fetchImpl: ReturnType<typeof vi.fn>,
  call = 0
): { url: string; init: RequestInit } {
  return {
    url: fetchImpl.mock.calls[call]![0] as string,
    init: (fetchImpl.mock.calls[call]![1] ?? {}) as RequestInit
  }
}

function jsonBodyOf(init: RequestInit): unknown {
  return JSON.parse(init.body as string)
}

function sseResponse(text: string, opts: { close?: boolean } = {}): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      if (opts.close !== false) controller.close()
    }
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

describe('HubClient space secrets', () => {
  it('lists secrets from the object map response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        HF_TOKEN: {
          key: 'HF_TOKEN',
          description: 'api key',
          updatedAt: '2026-07-01T00:00:00.000Z'
        },
        OTHER: { key: 'OTHER' }
      })
    )
    const client = new HubClient({ fetchImpl, ...FAST })
    const secrets = await client.listSpaceSecrets('a/b')
    expect(requestOf(fetchImpl).url).toBe('https://huggingface.co/api/spaces/a/b/secrets')
    expect(secrets).toEqual([
      { key: 'HF_TOKEN', description: 'api key', updatedAt: '2026-07-01T00:00:00.000Z' },
      { key: 'OTHER', description: undefined, updatedAt: undefined }
    ])
  })

  it('POSTs a secret upsert', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.setSpaceSecret('a/b', 'HF_TOKEN', 'hf_xxx', 'api key')
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/spaces/a/b/secrets')
    expect(init.method).toBe('POST')
    expect(jsonBodyOf(init)).toEqual({ key: 'HF_TOKEN', value: 'hf_xxx', description: 'api key' })
  })

  it('DELETEs a secret by key in the body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.deleteSpaceSecret('a/b', 'HF_TOKEN')
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/spaces/a/b/secrets')
    expect(init.method).toBe('DELETE')
    expect(jsonBodyOf(init)).toEqual({ key: 'HF_TOKEN' })
  })
})

describe('HubClient space variables', () => {
  it('lists variables with their values', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        MODEL: { key: 'MODEL', value: 'gpt2', description: 'model id' }
      })
    )
    const client = new HubClient({ fetchImpl, ...FAST })
    const variables = await client.listSpaceVariables('a/b')
    expect(requestOf(fetchImpl).url).toBe('https://huggingface.co/api/spaces/a/b/variables')
    expect(variables).toEqual([
      { key: 'MODEL', value: 'gpt2', description: 'model id', updatedAt: undefined }
    ])
  })

  it('POSTs a variable upsert and DELETEs by key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.setSpaceVariable('a/b', 'MODEL', 'gpt2')
    const post = requestOf(fetchImpl, 0)
    expect(post.url).toBe('https://huggingface.co/api/spaces/a/b/variables')
    expect(post.init.method).toBe('POST')
    expect(jsonBodyOf(post.init)).toEqual({ key: 'MODEL', value: 'gpt2' })
    await client.deleteSpaceVariable('a/b', 'MODEL')
    const del = requestOf(fetchImpl, 1)
    expect(del.init.method).toBe('DELETE')
    expect(jsonBodyOf(del.init)).toEqual({ key: 'MODEL' })
  })
})

describe('HubClient.getSpaceLogsSnapshot', () => {
  it('concatenates the data: payload lines of a finished stream', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        sseResponse('data: {"a":1}\n\ndata: line two\nevent: ping\nid: 7\n\ndata:bare\n')
      )
    const client = new HubClient({ fetchImpl, ...FAST })
    await expect(client.getSpaceLogsSnapshot('a/b', 'run')).resolves.toEqual({
      text: '{"a":1}\nline two\nbare'
    })
    expect(requestOf(fetchImpl).url).toBe('https://huggingface.co/api/spaces/a/b/logs/run')
    const headers = requestOf(fetchImpl).init.headers as Record<string, string>
    expect(headers.Accept).toBe('text/event-stream')
  })

  it('returns collected text when the stream stays open past the window', async () => {
    vi.useFakeTimers()
    try {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: first\n'))
          // Never closes: the snapshot must still resolve at the deadline.
        }
      })
      const fetchImpl = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }))
      const client = new HubClient({ fetchImpl, ...FAST })
      const promise = client.getSpaceLogsSnapshot('a/b', 'build')
      await vi.advanceTimersByTimeAsync(2600)
      await expect(promise).resolves.toEqual({ text: 'first' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops reading after the byte cap without waiting for the timeout', async () => {
    const bigLine = `data: ${'a'.repeat(70_000)}\n`
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(bigLine))
        // Never closes: the byte cap alone must end the read.
      }
    })
    const fetchImpl = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }))
    const client = new HubClient({ fetchImpl, ...FAST })
    const { text } = await client.getSpaceLogsSnapshot('a/b', 'run')
    expect(text).toBe('a'.repeat(70_000))
  })

  it('throws HubApiError on a non-OK response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }))
    const client = new HubClient({ fetchImpl, ...FAST, maxRetries: 0 })
    await expect(client.getSpaceLogsSnapshot('a/b', 'run')).rejects.toMatchObject({
      name: 'HubApiError',
      status: 404
    })
  })
})

describe('HubClient.restartSpace', () => {
  it('POSTs a plain restart and a factory reboot', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.restartSpace('a/b')
    expect(requestOf(fetchImpl, 0).url).toBe('https://huggingface.co/api/spaces/a/b/restart')
    expect(requestOf(fetchImpl, 0).init.method).toBe('POST')
    await client.restartSpace('a/b', true)
    expect(requestOf(fetchImpl, 1).url).toBe(
      'https://huggingface.co/api/spaces/a/b/restart?factory=true'
    )
  })
})
