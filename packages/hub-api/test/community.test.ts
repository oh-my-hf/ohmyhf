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

describe('HubClient.commentOnDiscussion', () => {
  it('POSTs the comment to the discussion', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.commentOnDiscussion('model', 'a/b', 5, 'looks good')
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/models/a/b/discussions/5/comment')
    expect(init.method).toBe('POST')
    expect(jsonBodyOf(init)).toEqual({ comment: 'looks good' })
  })

  it('invalidates the GET cache after a successful comment', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({})))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 60_000, minRequestGapMs: 0 })
    await client.getDiscussion('model', 'a/b', 5)
    await client.getDiscussion('model', 'a/b', 5)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await client.commentOnDiscussion('model', 'a/b', 5, 'reply')
    await client.getDiscussion('model', 'a/b', 5)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })
})

describe('HubClient.commentOnPost', () => {
  // Post comments are cookie-session only (Bearer tokens 401); the client is
  // built with a session cookie here. Cookie-required behavior is covered in
  // cookie-auth.test.ts.
  const COOKIE = { getSessionCookie: () => 'hf_session' } as const

  it('POSTs a top-level comment', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST, ...COOKIE })
    await client.commentOnPost('julien', '12345', 'nice work')
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/posts/julien/12345/comment')
    expect(init.method).toBe('POST')
    expect(jsonBodyOf(init)).toEqual({ comment: 'nice work' })
  })

  it('POSTs a reply to an existing comment', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST, ...COOKIE })
    await client.commentOnPost('julien', '12345', 'agreed', '6608ca7bbc8b7a1e30ba53e1')
    expect(requestOf(fetchImpl).url).toBe(
      'https://huggingface.co/api/posts/julien/12345/comment/6608ca7bbc8b7a1e30ba53e1/reply'
    )
    expect(jsonBodyOf(requestOf(fetchImpl).init)).toEqual({ comment: 'agreed' })
  })
})

describe('HubClient.commentOnPaper', () => {
  it('POSTs a top-level comment', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.commentOnPaper('2401.00001', 'great paper')
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/papers/2401.00001/comment')
    expect(init.method).toBe('POST')
    expect(jsonBodyOf(init)).toEqual({ comment: 'great paper' })
  })

  it('POSTs a reply to an existing comment', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.commentOnPaper('2401.00001', 'me too', '6608ca7bbc8b7a1e30ba53e1')
    expect(requestOf(fetchImpl).url).toBe(
      'https://huggingface.co/api/papers/2401.00001/comment/6608ca7bbc8b7a1e30ba53e1/reply'
    )
  })
})

describe('HubClient.mergePullRequest', () => {
  it('POSTs the merge with an optional comment', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.mergePullRequest('model', 'a/b', 159, 'LGTM')
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/models/a/b/discussions/159/merge')
    expect(init.method).toBe('POST')
    expect(jsonBodyOf(init)).toEqual({ comment: 'LGTM' })
  })

  it('sends an empty body without a comment', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.mergePullRequest('dataset', 'a/b', 2)
    expect(jsonBodyOf(requestOf(fetchImpl).init)).toEqual({})
  })
})

describe('HubClient.setDiscussionStatus', () => {
  it('POSTs the new status with an optional comment', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.setDiscussionStatus('model', 'a/b', 7, 'closed', 'stale')
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/models/a/b/discussions/7/status')
    expect(init.method).toBe('POST')
    expect(jsonBodyOf(init)).toEqual({ status: 'closed', comment: 'stale' })
  })
})

describe('HubClient.setDiscussionTitle', () => {
  it('POSTs the new title', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.setDiscussionTitle('space', 'a/b', 3, 'Better title')
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/spaces/a/b/discussions/3/title')
    expect(init.method).toBe('POST')
    expect(jsonBodyOf(init)).toEqual({ title: 'Better title' })
  })
})
