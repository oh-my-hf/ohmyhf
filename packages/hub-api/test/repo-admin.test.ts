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

describe('HubClient.updateRepoSettings', () => {
  it('PUTs the settings patch with auth', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST, getAccessToken: () => 'hf_secret' })
    await client.updateRepoSettings('model', 'a/b', { private: true, gated: 'auto' })
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/models/a/b/settings')
    expect(init.method).toBe('PUT')
    expect(jsonBodyOf(init)).toEqual({ private: true, gated: 'auto' })
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer hf_secret')
  })

  it('throws HubApiError with the status on failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('forbidden', { status: 403 }))
    const client = new HubClient({ fetchImpl, ...FAST, maxRetries: 0 })
    await expect(
      client.updateRepoSettings('model', 'a/b', { private: true })
    ).rejects.toMatchObject({ name: 'HubApiError', status: 403 })
  })
})

describe('HubClient.moveRepo', () => {
  it('POSTs fromRepo/toRepo/type', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.moveRepo('dataset', 'me/old', 'org/new')
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/repos/move')
    expect(init.method).toBe('POST')
    expect(jsonBodyOf(init)).toEqual({ fromRepo: 'me/old', toRepo: 'org/new', type: 'dataset' })
  })
})

describe('HubClient.deleteRepo', () => {
  it('DELETEs with name/organization split from the repo id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.deleteRepo('model', 'me/gone')
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/repos/delete')
    expect(init.method).toBe('DELETE')
    expect(jsonBodyOf(init)).toEqual({ type: 'model', name: 'gone', organization: 'me' })
  })

  it('omits organization for un-namespaced repo ids', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.deleteRepo('dataset', 'solo')
    expect(jsonBodyOf(requestOf(fetchImpl).init)).toEqual({ type: 'dataset', name: 'solo' })
  })
})

describe('HubClient.duplicateSpace', () => {
  it('POSTs the target repository to the spaces path and returns the new url', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ url: 'https://huggingface.co/spaces/me/copy' }))
    const client = new HubClient({ fetchImpl, ...FAST })
    const result = await client.duplicateSpace('a/b', 'me/copy', { private: true })
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/spaces/a/b/duplicate')
    expect(init.method).toBe('POST')
    expect(jsonBodyOf(init)).toEqual({ repository: 'me/copy', private: true })
    expect(result).toEqual({ url: 'https://huggingface.co/spaces/me/copy' })
  })
})

describe('HubClient branches', () => {
  it('POSTs a new branch with a starting point, encoding the branch name', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.createBranch('model', 'a/b', 'feat/x', 'abc123')
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/models/a/b/branch/feat%2Fx')
    expect(init.method).toBe('POST')
    expect(jsonBodyOf(init)).toEqual({ startingPoint: 'abc123' })
  })

  it('POSTs an empty body when no starting point is given', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.createBranch('model', 'a/b', 'dev')
    expect(jsonBodyOf(requestOf(fetchImpl).init)).toEqual({})
  })

  it('DELETEs a branch', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.deleteBranch('dataset', 'a/b', 'dev')
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/datasets/a/b/branch/dev')
    expect(init.method).toBe('DELETE')
  })
})

describe('HubClient tags', () => {
  it('POSTs the tag name in the body with the revision in the path', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.createTag('model', 'a/b', 'v1.0', undefined, 'first release')
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/models/a/b/tag/main')
    expect(init.method).toBe('POST')
    expect(jsonBodyOf(init)).toEqual({ tag: 'v1.0', message: 'first release' })
  })

  it('tags a specific revision', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.createTag('model', 'a/b', 'v1.1', 'abc123')
    expect(requestOf(fetchImpl).url).toBe('https://huggingface.co/api/models/a/b/tag/abc123')
    expect(jsonBodyOf(requestOf(fetchImpl).init)).toEqual({ tag: 'v1.1' })
  })

  it('DELETEs a tag by name', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.deleteTag('model', 'a/b', 'v1.0')
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/models/a/b/tag/v1.0')
    expect(init.method).toBe('DELETE')
  })
})

describe('HubClient access requests', () => {
  it('lists requests by status and maps users', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          user: {
            _id: '6608ca7bbc8b7a1e30ba53e1',
            user: 'alice',
            fullname: 'Alice A',
            avatarUrl: '/avatars/a.svg',
            isPro: false,
            type: 'user'
          },
          timestamp: '2026-07-01T00:00:00.000Z',
          status: 'pending',
          fields: { company: 'Acme' }
        }
      ])
    )
    const client = new HubClient({ fetchImpl, ...FAST })
    const requests = await client.listAccessRequests('dataset', 'a/b', 'pending')
    expect(requestOf(fetchImpl).url).toBe(
      'https://huggingface.co/api/datasets/a/b/user-access-request/pending'
    )
    expect(requests).toEqual([
      {
        user: {
          name: 'alice',
          fullname: 'Alice A',
          avatarUrl: 'https://huggingface.co/avatars/a.svg'
        },
        timestamp: '2026-07-01T00:00:00.000Z',
        fields: { company: 'Acme' }
      }
    ])
  })

  it('POSTs a handle decision with a rejection reason', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.handleAccessRequest('model', 'a/b', 'alice', 'rejected', 'incomplete form')
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/models/a/b/user-access-request/handle')
    expect(init.method).toBe('POST')
    expect(jsonBodyOf(init)).toEqual({
      user: 'alice',
      status: 'rejected',
      rejectionReason: 'incomplete form'
    })
  })

  it('POSTs a grant for a user', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.grantAccess('model', 'a/b', 'bob')
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/models/a/b/user-access-request/grant')
    expect(init.method).toBe('POST')
    expect(jsonBodyOf(init)).toEqual({ user: 'bob' })
  })
})

describe('HubClient.setLike', () => {
  it('POSTs to like and DELETEs to unlike', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    // Like (POST) is cookie-session only; unlike (DELETE) rides the token.
    const client = new HubClient({ fetchImpl, ...FAST, getSessionCookie: () => 'hf_session' })
    await client.setLike('model', 'a/b', true)
    expect(requestOf(fetchImpl, 0).url).toBe('https://huggingface.co/api/models/a/b/like')
    expect(requestOf(fetchImpl, 0).init.method).toBe('POST')
    await client.setLike('space', 'a/b', false)
    expect(requestOf(fetchImpl, 1).url).toBe('https://huggingface.co/api/spaces/a/b/like')
    expect(requestOf(fetchImpl, 1).init.method).toBe('DELETE')
  })
})

describe('HubClient.setFollow', () => {
  it('POSTs/DELETEs the user follow endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.setFollow('julien-c', true)
    expect(requestOf(fetchImpl, 0).url).toBe('https://huggingface.co/api/users/julien-c/follow')
    expect(requestOf(fetchImpl, 0).init.method).toBe('POST')
    await client.setFollow('julien-c', false)
    expect(requestOf(fetchImpl, 1).url).toBe('https://huggingface.co/api/users/julien-c/follow')
    expect(requestOf(fetchImpl, 1).init.method).toBe('DELETE')
  })

  it('routes org follows to the organizations endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.setFollow('huggingface', true, true)
    expect(requestOf(fetchImpl, 0).url).toBe(
      'https://huggingface.co/api/organizations/huggingface/follow'
    )
    expect(requestOf(fetchImpl, 0).init.method).toBe('POST')
    await client.setFollow('huggingface', false, true)
    expect(requestOf(fetchImpl, 1).init.method).toBe('DELETE')
  })
})

describe('HubClient.getUserLikes', () => {
  it('maps liked repos and drops bucket/kernel entries', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([
        { createdAt: '2026-07-01T00:00:00.000Z', repo: { name: 'meta/llama', type: 'model' } },
        { createdAt: '2026-07-02T00:00:00.000Z', repo: { name: 'me/bucket', type: 'bucket' } }
      ])
    )
    const client = new HubClient({ fetchImpl, ...FAST })
    const likes = await client.getUserLikes('julien')
    expect(requestOf(fetchImpl).url).toBe(
      'https://huggingface.co/api/users/julien/likes?limit=100'
    )
    expect(likes).toHaveLength(1)
    expect(likes[0]).toMatchObject({
      id: 'meta/llama',
      kind: 'model',
      author: 'meta',
      name: 'llama'
    })
  })
})
