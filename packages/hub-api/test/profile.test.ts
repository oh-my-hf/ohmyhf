import { describe, expect, it, vi } from 'vitest'
import { HubApiError, HubClient, mapUserOverview, mapWhoAmIAuth } from '../src'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

const rawPost = {
  slug: '943499680377839',
  author: {
    name: 'RazaAli10',
    fullname: 'RAZA ALI',
    avatarUrl: '/avatars/4b62671f5096c688c5f8d4ee0d12f42d.svg'
  },
  rawContent: 'I built a free, browser-based hydraulic simulation tool.',
  publishedAt: '2026-07-10T01:53:20.000Z',
  numComments: 3,
  reactions: [{ reaction: '🔥', users: ['a', 'b'], count: 2 }],
  url: '/posts/RazaAli10/943499680377839'
}

describe('HubClient.getPostDetail', () => {
  it('finds the post by slug with a case-insensitive author match', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ socialPosts: [rawPost] }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    const post = await client.getPostDetail('razaali10', '943499680377839')
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      'https://huggingface.co/api/posts?slug=943499680377839'
    )
    expect(post).toEqual({
      slug: '943499680377839',
      author: 'RazaAli10',
      authorFullname: 'RAZA ALI',
      authorAvatarUrl: 'https://huggingface.co/avatars/4b62671f5096c688c5f8d4ee0d12f42d.svg',
      authorIsPro: undefined,
      content: 'I built a free, browser-based hydraulic simulation tool.',
      publishedAt: '2026-07-10T01:53:20.000Z',
      numComments: 3,
      numReactions: 2,
      reactions: [{ emoji: '🔥', count: 2, users: ['a', 'b'] }],
      attachments: [],
      url: 'https://huggingface.co/posts/RazaAli10/943499680377839'
    })
  })

  it('throws a 404 HubApiError when the author does not match', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ socialPosts: [rawPost] }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    await expect(client.getPostDetail('someone-else', '943499680377839')).rejects.toMatchObject({
      name: 'HubApiError',
      status: 404
    })
  })

  it('throws a 404 HubApiError when the feed comes back empty', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ socialPosts: [] }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    await expect(client.getPostDetail('razaali10', 'missing')).rejects.toBeInstanceOf(HubApiError)
  })
})

describe('HubClient.whoAmIWithToken / mapWhoAmIAuth', () => {
  it('sends the candidate token, a deadline, and maps the token identity block', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        name: 'me',
        fullname: 'Me',
        orgs: [],
        auth: { type: 'access_token', accessToken: { displayName: 'my-laptop', role: 'write' } }
      })
    )
    // getAccessToken returns the CURRENT session token; validation must ignore it.
    const client = new HubClient({
      fetchImpl,
      cacheTtlMs: 0,
      minRequestGapMs: 0,
      getAccessToken: () => 'hf_current_session'
    })
    const detailed = await client.whoAmIWithToken('hf_candidate')
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://huggingface.co/api/whoami-v2')
    expect(init.headers.Authorization).toBe('Bearer hf_candidate')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(detailed).toEqual({
      user: {
        name: 'me',
        fullname: 'Me',
        email: undefined,
        avatarUrl: undefined,
        isPro: undefined,
        orgs: []
      },
      tokenDisplayName: 'my-laptop',
      tokenRole: 'write'
    })
  })

  it('rejects with a status-carrying HubApiError on 401', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, 401))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    await expect(client.whoAmIWithToken('hf_bad')).rejects.toMatchObject({
      name: 'HubApiError',
      status: 401
    })
  })

  it('tolerates a payload with no auth block (mirror endpoints omit it)', () => {
    expect(mapWhoAmIAuth({ name: 'me' }, 'https://huggingface.co')).toEqual({
      user: {
        name: 'me',
        fullname: undefined,
        email: undefined,
        avatarUrl: undefined,
        isPro: undefined,
        orgs: []
      },
      tokenDisplayName: undefined,
      tokenRole: undefined
    })
    expect(
      mapWhoAmIAuth({ name: 'me', auth: {} }, 'https://huggingface.co').tokenRole
    ).toBeUndefined()
    expect(
      mapWhoAmIAuth({ name: 'me', auth: { accessToken: {} } }, 'https://huggingface.co')
        .tokenDisplayName
    ).toBeUndefined()
  })

  it('absolutizes the relative avatar path the Hub returns for the signed-in user', () => {
    const { user } = mapWhoAmIAuth(
      {
        name: 'me',
        avatarUrl: '/avatars/abc.svg',
        orgs: [{ name: 'acme', avatarUrl: '/avatars/org.svg' }]
      },
      'https://huggingface.co'
    )
    expect(user.avatarUrl).toBe('https://huggingface.co/avatars/abc.svg')
    expect(user.orgs[0]!.avatarUrl).toBe('https://huggingface.co/avatars/org.svg')
  })

  it('preserves a path-prefixed custom endpoint for relative Hub assets', () => {
    const { user } = mapWhoAmIAuth(
      { name: 'me', avatarUrl: '/avatars/abc.svg' },
      'https://hub.example.test/hf'
    )
    expect(user.avatarUrl).toBe('https://hub.example.test/hf/avatars/abc.svg')
  })
})

describe('HubClient.getUserOverview', () => {
  it('maps user, bio, orgs and absolutizes relative avatar URLs', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        user: 'julien-c',
        fullname: 'Julien Chaumond',
        avatarUrl: '/avatars/abc.svg',
        isPro: true,
        details: 'Co-founder at Hugging Face',
        numModels: 12,
        numDatasets: 3,
        numSpaces: 5,
        numPapers: 2,
        numFollowers: 100,
        numFollowing: 42,
        numLikes: 7,
        orgs: [
          {
            name: 'huggingface',
            fullname: 'Hugging Face',
            avatarUrl: '/avatars/org.svg',
            plan: 'team'
          },
          {
            user: 'hf-internal-testing',
            fullname: 'HF Internal Testing',
            avatarUrl: 'https://cdn.example.com/org2.png'
          }
        ],
        createdAt: '2016-03-01T00:00:00.000Z',
        type: 'user'
      })
    )
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    const overview = await client.getUserOverview('julien-c')
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://huggingface.co/api/users/julien-c/overview')
    expect(overview).toMatchObject({
      name: 'julien-c',
      fullname: 'Julien Chaumond',
      avatarUrl: 'https://huggingface.co/avatars/abc.svg',
      bio: 'Co-founder at Hugging Face',
      isPro: true,
      numModels: 12,
      numDatasets: 3,
      numSpaces: 5,
      numPapers: 2,
      numFollowers: 100,
      numFollowing: 42,
      numLikes: 7,
      orgs: [
        {
          name: 'huggingface',
          fullname: 'Hugging Face',
          avatarUrl: 'https://huggingface.co/avatars/org.svg',
          plan: 'team'
        },
        {
          name: 'hf-internal-testing',
          fullname: 'HF Internal Testing',
          avatarUrl: 'https://cdn.example.com/org2.png'
        }
      ],
      createdAt: '2016-03-01T00:00:00.000Z'
    })
  })

  it('encodes the username in the URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ user: 'a b' }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    await client.getUserOverview('a b')
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://huggingface.co/api/users/a%20b/overview')
  })

  it('defaults missing numerics to 0 and orgs to empty', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ user: 'minimal' }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    const overview = await client.getUserOverview('minimal')
    expect(overview).toMatchObject({
      name: 'minimal',
      fullname: undefined,
      avatarUrl: undefined,
      bio: undefined,
      isPro: undefined,
      numModels: 0,
      numDatasets: 0,
      numSpaces: 0,
      numPapers: 0,
      numFollowers: 0,
      numFollowing: 0,
      numLikes: 0,
      orgs: [],
      createdAt: undefined
    })
  })

  it('propagates a 404 for unknown users', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0, maxRetries: 0 })
    await expect(client.getUserOverview('nobody')).rejects.toMatchObject({
      name: 'HubApiError',
      status: 404
    })
  })
})

describe('mapUserOverview', () => {
  it('is exported and handles a fully empty payload', () => {
    expect(mapUserOverview({}, 'https://huggingface.co')).toMatchObject({
      name: '',
      numModels: 0,
      numFollowers: 0,
      orgs: []
    })
  })

  it('normalizes known org plans and drops unknown ones', () => {
    expect(
      mapUserOverview(
        { name: 'acme', plan: 'ENTERPRISE', orgs: [{ name: 'x', plan: 'nope' }] },
        'https://huggingface.co',
        true
      )
    ).toMatchObject({
      plan: 'enterprise',
      orgs: [{ name: 'x', plan: undefined }]
    })
  })
})

describe('HubClient.getUserFollowing', () => {
  it('drains Link pagination and maps accounts', async () => {
    const page1 = new Response(
      JSON.stringify([
        { user: 'alice', fullname: 'Alice', avatarUrl: '/avatars/a.svg', type: 'user' },
        { user: 'acme', fullname: 'Acme', type: 'org' }
      ]),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          Link: '<https://huggingface.co/api/users/me/following?cursor=x>; rel="next"'
        }
      }
    )
    const page2 = new Response(JSON.stringify([{ user: 'bob', type: 'user' }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
    const fetchImpl = vi.fn().mockResolvedValueOnce(page1).mockResolvedValueOnce(page2)
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    const following = await client.getUserFollowing('me')
    expect(following).toHaveLength(3)
    expect(following[0]).toEqual({
      name: 'alice',
      fullname: 'Alice',
      avatarUrl: 'https://huggingface.co/avatars/a.svg',
      isOrg: false
    })
    expect(following[1]!.isOrg).toBe(true)
    expect(following[2]!.name).toBe('bob')
  })
})

describe('HubClient.getUserOverview org fallback', () => {
  it('falls back to the organizations endpoint on user 404', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: 'HackerNoon',
            fullname: 'HackerNoon',
            details: 'stories',
            avatarUrl: 'https://cdn.example/a.jpg',
            numModels: 2,
            numFollowers: 10,
            numUsers: 5
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0, maxRetries: 0 })
    const overview = await client.getUserOverview('HackerNoon')
    expect(overview.name).toBe('HackerNoon')
    expect(overview.isOrg).toBe(true)
    expect(overview.numFollowers).toBe(10)
    expect(overview.numUsers).toBe(5)
    expect(fetchImpl.mock.calls[1]![0]).toContain('/api/organizations/HackerNoon/overview')
  })

  it('maps org plan tiers from the overview payload', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 404 }))
      .mockResolvedValueOnce(
        jsonResponse({
          name: 'openai',
          fullname: 'OpenAI',
          plan: 'plus',
          numModels: 1,
          numFollowers: 2,
          numUsers: 3
        })
      )
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0, maxRetries: 0 })
    const overview = await client.getUserOverview('openai')
    expect(overview).toMatchObject({
      name: 'openai',
      isOrg: true,
      plan: 'plus'
    })
  })
})

describe('HubClient.getOrgMembers', () => {
  it('maps members and absolutizes avatars', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([
        { user: 'alice', fullname: 'Alice', avatarUrl: '/avatars/a.svg', type: 'user' },
        { user: 'bob', type: 'user' }
      ])
    )
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    const members = await client.getOrgMembers('acme', 10)
    expect(fetchImpl.mock.calls[0]![0]).toContain('/api/organizations/acme/members')
    expect(members).toEqual([
      {
        name: 'alice',
        fullname: 'Alice',
        avatarUrl: 'https://huggingface.co/avatars/a.svg',
        isOrg: false
      },
      { name: 'bob', fullname: undefined, avatarUrl: undefined, isOrg: false }
    ])
  })
})
