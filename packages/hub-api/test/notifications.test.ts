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

const HEX = '6608ca7bbc8b7a1e30ba53e1'

describe('HubClient.getNotifications', () => {
  const rawPage = {
    count: { view: 12, unread: 3, all: 12 },
    start: 0,
    notifications: [
      {
        type: 'repo',
        read: false,
        updatedAt: '2026-07-09T10:00:00.000Z',
        repo: { name: 'openai-community/gpt2', type: 'model' },
        discussion: {
          num: 159,
          title: 'Fix tokenizer',
          status: 'open',
          id: HEX,
          isPullRequest: true,
          participating: [{ _id: HEX, user: 'alice', avatar: '/avatars/a.svg' }]
        }
      },
      {
        type: 'paper',
        read: true,
        updatedAt: '2026-07-08T10:00:00.000Z',
        paper: { _id: '6608ca7bbc8b7a1e30ba53e2', title: 'A Paper' },
        paperDiscussion: {
          id: '6608ca7bbc8b7a1e30ba53e3',
          paperId: '6608ca7bbc8b7a1e30ba53e2',
          participating: []
        }
      },
      {
        type: 'post',
        read: false,
        post: {
          id: '6608ca7bbc8b7a1e30ba53e4',
          slug: '12345',
          authorName: 'julien',
          title: 'I shipped a thing',
          participating: []
        }
      },
      {
        type: 'community_blog',
        read: true,
        blog: { id: '6608ca7bbc8b7a1e30ba53e5', slug: 'x', title: 'Blog post', canonical: true }
      }
    ]
  }

  it('maps repo/paper/post variants with in-app routes and the blog fallback', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(rawPage))
    const client = new HubClient({ fetchImpl, ...FAST })
    const page = await client.getNotifications()
    expect(requestOf(fetchImpl).url).toBe('https://huggingface.co/api/notifications')
    expect(page.count).toBe(12)
    expect(page.items).toHaveLength(4)
    expect(page.items[0]).toEqual({
      kind: 'repo',
      read: false,
      updatedAt: '2026-07-09T10:00:00.000Z',
      title: 'Fix tokenizer',
      discussionId: HEX,
      repoId: 'openai-community/gpt2',
      repoKind: 'model',
      discussionNum: 159,
      discussionStatus: 'open',
      isPullRequest: true,
      participants: [{ user: 'alice', avatar: 'https://huggingface.co/avatars/a.svg' }],
      route: '/models/openai-community/gpt2/discussions/159'
    })
    expect(page.items[1]).toMatchObject({
      kind: 'paper',
      read: true,
      title: 'A Paper',
      discussionId: '6608ca7bbc8b7a1e30ba53e3',
      route: '/papers/6608ca7bbc8b7a1e30ba53e2'
    })
    expect(page.items[2]).toMatchObject({
      kind: 'post',
      title: 'I shipped a thing',
      discussionId: '6608ca7bbc8b7a1e30ba53e4',
      route: '/posts/julien/12345'
    })
    expect(page.items[3]).toMatchObject({
      kind: 'other',
      title: 'Blog post',
      discussionId: '6608ca7bbc8b7a1e30ba53e5'
    })
    expect(page.items[3]!.route).toBeUndefined()
  })

  it('passes the page number as p', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ notifications: [], count: { view: 0 } }))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.getNotifications(2)
    expect(requestOf(fetchImpl).url).toBe('https://huggingface.co/api/notifications?p=2')
  })
})

describe('HubClient.markNotificationsRead', () => {
  it('POSTs explicit discussion ids', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.markNotificationsRead([HEX], true)
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/notifications/mark-as-read')
    expect(init.method).toBe('POST')
    expect(jsonBodyOf(init)).toEqual({ discussionIds: [HEX], read: true })
  })

  it('applies to all notifications when the id list is empty', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.markNotificationsRead([], false)
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/notifications/mark-as-read?applyToAll=true')
    expect(jsonBodyOf(init)).toEqual({ read: false })
  })
})

describe('HubClient.clearNotifications', () => {
  it('DELETEs all notifications via applyToAll', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.clearNotifications()
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/notifications?applyToAll=true')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })
})

describe('HubClient.updateWatch', () => {
  it('PATCHes add/delete watch targets, defaulting missing sides to []', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.updateWatch({ add: [{ id: HEX, type: 'org' }] })
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/settings/watch')
    expect(init.method).toBe('PATCH')
    expect(jsonBodyOf(init)).toEqual({ add: [{ id: HEX, type: 'org' }], delete: [] })
  })

  it('returns the resulting watch list so callers can verify adds took effect', async () => {
    // The Hub answers 200 but silently ignores token-based org adds, so the
    // response list — not the status — is the source of truth.
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        watched: [
          { _id: 'a'.repeat(24), id: 'alice', name: 'alice', type: 'user' },
          { _id: 'b'.repeat(24), id: 'acme', name: 'Acme', type: 'org' },
          { id: 'legacy-no-hex' }
        ]
      })
    )
    const client = new HubClient({ fetchImpl, ...FAST })
    const watched = await client.updateWatch({ add: [{ id: HEX, type: 'org' }] })
    expect(watched).toEqual([
      { internalId: 'a'.repeat(24), name: 'alice', type: 'user' },
      { internalId: 'b'.repeat(24), name: 'Acme', type: 'org' },
      { internalId: undefined, name: 'legacy-no-hex', type: 'user' }
    ])
  })

  it('tolerates an empty response body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
    const client = new HubClient({ fetchImpl, ...FAST })
    await expect(client.updateWatch({ add: [{ id: HEX, type: 'user' }] })).resolves.toEqual([])
  })
})

describe('HubClient.listWatched', () => {
  it('reads the watch list via a no-op delete of a nonexistent id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        watched: [{ _id: HEX, name: 'alice', type: 'user' }]
      })
    )
    const client = new HubClient({ fetchImpl, ...FAST })
    await expect(client.listWatched()).resolves.toEqual([
      { internalId: HEX, name: 'alice', type: 'user' }
    ])
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/settings/watch')
    expect(jsonBodyOf(init)).toEqual({
      add: [],
      delete: [{ id: '0'.repeat(24), type: 'user' }]
    })
  })
})

describe('HubClient.setWatch', () => {
  it('reports applied=false when the Hub silently ignores the mutation', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ watched: [] }))
    const client = new HubClient({ fetchImpl, ...FAST })
    await expect(client.setWatch({ id: HEX, type: 'user' }, true)).resolves.toEqual({
      applied: false,
      watched: []
    })
  })

  it('reports applied=true when the target appears after an add', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ watched: [{ _id: HEX, name: 'alice', type: 'user' }] })
    )
    const client = new HubClient({ fetchImpl, ...FAST })
    await expect(client.setWatch({ id: HEX, type: 'user' }, true)).resolves.toEqual({
      applied: true,
      watched: [{ internalId: HEX, name: 'alice', type: 'user' }]
    })
  })
})

describe('HubClient.listMyRepos', () => {
  it('maps entries and drops bucket/kernel repos', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          id: 'me/model-a',
          type: 'model',
          updatedAt: '2026-07-01T00:00:00.000Z',
          visibility: 'private',
          storage: 1024,
          storagePercent: 0.5
        },
        {
          id: 'me/bucket-x',
          type: 'bucket',
          updatedAt: '2026-07-01T00:00:00.000Z',
          visibility: 'public',
          storage: 0,
          storagePercent: 0
        }
      ])
    )
    const client = new HubClient({ fetchImpl, ...FAST })
    const repos = await client.listMyRepos()
    expect(requestOf(fetchImpl).url).toBe('https://huggingface.co/api/settings/repositories')
    expect(repos).toEqual([
      {
        id: 'me/model-a',
        kind: 'model',
        visibility: 'private',
        updatedAt: '2026-07-01T00:00:00.000Z',
        storage: 1024,
        storagePercent: 0.5
      }
    ])
  })
})

describe('HubClient.getBillingUsage', () => {
  it('flattens the usage map into rows and converts micro-USD to cents', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        period: {
          periodStart: '2026-07-01T00:00:00.000Z',
          periodEnd: '2026-08-01T00:00:00.000Z'
        },
        usage: {
          Spaces: [
            {
              entityId: HEX,
              label: null,
              product: 'spaces/t4-small/minutes',
              productPrettyName: 'Spaces T4 small',
              quantity: 5,
              unitLabel: 'minutes',
              totalCostMicroUSD: 50_000,
              unitCostMicroUSD: 10_000,
              active: false
            }
          ],
          Endpoints: [
            {
              entityId: HEX,
              label: 'my-endpoint',
              product: 'endpoints/aws/nvidia-t4/x1',
              productPrettyName: 'AWS T4 x1',
              quantity: 100,
              unitLabel: 'minutes',
              totalCostMicroUSD: 123_456,
              unitCostMicroUSD: 1_234,
              active: true
            }
          ]
        }
      })
    )
    const client = new HubClient({ fetchImpl, ...FAST })
    const usage = await client.getBillingUsage()
    expect(requestOf(fetchImpl).url).toBe('https://huggingface.co/api/settings/billing/usage')
    expect(usage).toEqual({
      periodStart: '2026-07-01T00:00:00.000Z',
      periodEnd: '2026-08-01T00:00:00.000Z',
      rows: [
        { label: 'Spaces T4 small', detail: '5 minutes', amountCents: 5 },
        { label: 'my-endpoint', detail: 'AWS T4 x1 · 100 minutes', amountCents: 12 }
      ]
    })
  })

  it('tolerates an empty payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await expect(client.getBillingUsage()).resolves.toEqual({
      periodStart: undefined,
      periodEnd: undefined,
      rows: []
    })
  })
})

describe('HubClient.getUserOverview internalId', () => {
  it('maps the 24-hex _id required for watch updates', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ _id: HEX, user: 'julien' }))
    const client = new HubClient({ fetchImpl, ...FAST })
    const overview = await client.getUserOverview('julien')
    expect(overview.internalId).toBe(HEX)
  })
})
