import { describe, expect, it, vi } from 'vitest'
import { HubClient } from '../src'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

describe('HubClient.searchUsers', () => {
  it('maps users and absolutizes avatar URLs', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        users: [
          { user: 'julien', fullname: 'Julien C', avatarUrl: '/avatars/abc.svg' },
          { user: 'no-avatar' }
        ]
      })
    )
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    const users = await client.searchUsers('juli')
    expect(users).toEqual([
      { name: 'julien', fullname: 'Julien C', avatarUrl: 'https://huggingface.co/avatars/abc.svg' },
      { name: 'no-avatar', fullname: undefined, avatarUrl: undefined }
    ])
    const url = new URL(fetchImpl.mock.calls[0]![0] as string)
    expect(url.pathname).toBe('/api/quicksearch')
    expect(url.searchParams.get('type')).toBe('user')
  })

  it('degrades to empty on failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('x', { status: 500 }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0, maxRetries: 0 })
    await expect(client.searchUsers('x')).resolves.toEqual([])
  })
})

describe('HubClient.searchOrgs', () => {
  it('maps orgs and absolutizes avatar URLs', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        orgs: [
          { name: 'meta-llama', fullname: 'Meta Llama', avatarUrl: '/avatars/a.png' },
          { name: 'facebook' }
        ]
      })
    )
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    const orgs = await client.searchOrgs('meta')
    expect(orgs).toEqual([
      {
        name: 'meta-llama',
        fullname: 'Meta Llama',
        avatarUrl: 'https://huggingface.co/avatars/a.png'
      },
      { name: 'facebook', fullname: undefined, avatarUrl: undefined }
    ])
    const url = new URL(fetchImpl.mock.calls[0]![0] as string)
    expect(url.pathname).toBe('/api/quicksearch')
    expect(url.searchParams.get('type')).toBe('org')
    expect(url.searchParams.get('q')).toBe('meta')
  })

  it('degrades to empty on failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('x', { status: 500 }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0, maxRetries: 0 })
    await expect(client.searchOrgs('x')).resolves.toEqual([])
  })
})

describe('HubClient.searchPapers', () => {
  it('maps paper _id and title', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        papers: [{ _id: '2509.26507', id: 'The Dragon Hatchling' }]
      })
    )
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    await expect(client.searchPapers('transformer')).resolves.toEqual([
      { id: '2509.26507', title: 'The Dragon Hatchling' }
    ])
    const url = new URL(fetchImpl.mock.calls[0]![0] as string)
    expect(url.searchParams.get('type')).toBe('paper')
  })

  it('degrades to empty on failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('x', { status: 500 }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0, maxRetries: 0 })
    await expect(client.searchPapers('x')).resolves.toEqual([])
  })
})

describe('HubClient.searchCollections', () => {
  it('maps collection _id as slug and title', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        collections: [
          {
            _id: 'meta-llama/llama-4-67f0c30d9fe03840bc9d0164',
            title: 'Llama 4',
            description: 'Llama 4 release'
          }
        ]
      })
    )
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    await expect(client.searchCollections('llama')).resolves.toEqual([
      {
        slug: 'meta-llama/llama-4-67f0c30d9fe03840bc9d0164',
        title: 'Llama 4',
        description: 'Llama 4 release'
      }
    ])
    const url = new URL(fetchImpl.mock.calls[0]![0] as string)
    expect(url.searchParams.get('type')).toBe('collection')
  })

  it('degrades to empty on failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('x', { status: 500 }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0, maxRetries: 0 })
    await expect(client.searchCollections('x')).resolves.toEqual([])
  })
})

describe('HubClient.getPosts', () => {
  const rawPost = {
    slug: '943499680377839',
    author: {
      name: 'razaali10',
      fullname: 'RAZA ALI',
      avatarUrl: '/avatars/4b62671f5096c688c5f8d4ee0d12f42d.svg'
    },
    rawContent: 'I built a free, browser-based hydraulic simulation tool.',
    content: [{ type: 'text', value: 'ignored rich content' }],
    publishedAt: '2026-07-10T01:53:20.000Z',
    numComments: 3,
    reactions: [
      { reaction: '🔥', users: ['dipankarsarkar', 'John6666'], count: 2 },
      { reaction: '👍', users: ['a', 'b', 'c'] }
    ],
    url: '/posts/razaali10/943499680377839',
    totalUniqueImpressions: 1234
  }

  it('maps posts, absolutizes URLs and sums reactions', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ socialPosts: [rawPost], numTotalItems: 100 }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    const page = await client.getPosts()
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://huggingface.co/api/posts?limit=30')
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toEqual({
      slug: '943499680377839',
      author: 'razaali10',
      authorFullname: 'RAZA ALI',
      authorAvatarUrl: 'https://huggingface.co/avatars/4b62671f5096c688c5f8d4ee0d12f42d.svg',
      content: 'I built a free, browser-based hydraulic simulation tool.',
      publishedAt: '2026-07-10T01:53:20.000Z',
      numComments: 3,
      // count (2) + users fallback (3)
      numReactions: 5,
      reactions: [
        { emoji: '🔥', count: 2, users: ['dipankarsarkar', 'John6666'] },
        { emoji: '👍', count: 3, users: ['a', 'b', 'c'] }
      ],
      attachments: [],
      url: 'https://huggingface.co/posts/razaali10/943499680377839'
    })
  })

  it('maps image/video attachments (absolutized) and drops unknown/blank types', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        socialPosts: [
          {
            ...rawPost,
            attachments: [
              { type: 'image', url: 'https://cdn-uploads.huggingface.co/x/y.jpeg' },
              { type: 'video', url: 'https://cdn-uploads.huggingface.co/x/z.mp4' },
              { type: 'image', url: '/relative/w.png' },
              { type: 'audio', url: 'https://cdn-uploads.huggingface.co/x/a.mp3' },
              { type: 'image' }
            ]
          }
        ]
      })
    )
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    const page = await client.getPosts()
    expect(page.items[0]!.attachments).toEqual([
      { type: 'image', url: 'https://cdn-uploads.huggingface.co/x/y.jpeg' },
      { type: 'video', url: 'https://cdn-uploads.huggingface.co/x/z.mp4' },
      // Relative URLs get absolutized against the endpoint.
      { type: 'image', url: 'https://huggingface.co/relative/w.png' }
      // audio (unknown type) and the url-less entry are dropped.
    ])
  })

  it('builds a skip cursor from the received item count', async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ socialPosts: [rawPost], numTotalItems: 100 }))
      )
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    const first = await client.getPosts()
    expect(first.nextCursor).toBe('https://huggingface.co/api/posts?limit=30&skip=1')
    const second = await client.getPosts(first.nextCursor)
    expect(fetchImpl.mock.calls[1]![0]).toBe('https://huggingface.co/api/posts?limit=30&skip=1')
    expect(second.nextCursor).toBe('https://huggingface.co/api/posts?limit=30&skip=2')
  })

  it('stops paginating at numTotalItems and on empty pages', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ socialPosts: [rawPost], numTotalItems: 1 }))
      .mockResolvedValueOnce(jsonResponse({ socialPosts: [], numTotalItems: 1 }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    const last = await client.getPosts()
    expect(last.nextCursor).toBeUndefined()
    const empty = await client.getPosts()
    expect(empty.items).toEqual([])
    expect(empty.nextCursor).toBeUndefined()
  })
})

describe('HubClient.getDiscussionDiff', () => {
  it('fetches the diff text advertised by diffUrl', async () => {
    const diff = 'diff --git a/README.md b/README.md\n+hello\n'
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          num: 159,
          isPullRequest: true,
          diffUrl: 'https://huggingface.co/openai-community/gpt2/discussions/159/files.diff',
          changes: { base: 'refs/heads/main' }
        })
      )
      .mockResolvedValueOnce(new Response(diff, { status: 200 }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    await expect(client.getDiscussionDiff('model', 'openai-community/gpt2', 159)).resolves.toBe(
      diff
    )
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      'https://huggingface.co/api/models/openai-community/gpt2/discussions/159'
    )
    expect(fetchImpl.mock.calls[1]![0]).toBe(
      'https://huggingface.co/openai-community/gpt2/discussions/159/files.diff'
    )
  })

  it('returns empty string when the discussion has no diffUrl', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ num: 1, isPullRequest: false }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    await expect(client.getDiscussionDiff('dataset', 'a/b', 1)).resolves.toBe('')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('truncates diffs beyond 2 MiB with a trailing marker', async () => {
    const cap = 2 * 1024 * 1024
    const huge = 'x'.repeat(cap + 100)
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ diffUrl: 'https://huggingface.co/a/b/x.diff' }))
      .mockResolvedValueOnce(new Response(huge, { status: 200 }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    const diff = await client.getDiscussionDiff('model', 'a/b', 2)
    expect(diff.length).toBe(cap + '\n... (diff truncated)'.length)
    expect(diff.endsWith('\n... (diff truncated)')).toBe(true)
    expect(diff.startsWith('xxx')).toBe(true)
  })
})

describe('HubClient.listDiscussions', () => {
  it('passes type and status filters through to the URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ discussions: [] }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    await client.listDiscussions('model', 'a/b', { type: 'pull_request', status: 'open' })
    const url = new URL(fetchImpl.mock.calls[0]![0] as string)
    expect(url.pathname).toBe('/api/models/a/b/discussions')
    expect(url.searchParams.get('type')).toBe('pull_request')
    expect(url.searchParams.get('status')).toBe('open')
  })

  it('omits filter params when none are given', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ discussions: [] }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    await client.listDiscussions('space', 'a/b')
    const url = new URL(fetchImpl.mock.calls[0]![0] as string)
    expect(url.searchParams.get('type')).toBeNull()
    expect(url.searchParams.get('status')).toBeNull()
  })
})

describe('HubClient spaces gallery mapping', () => {
  const rawSpace = {
    id: 'evalstate/parler-tts',
    likes: 12,
    tags: ['gradio'],
    sdk: 'gradio',
    cardData: {
      title: 'Parler TTS',
      emoji: '🎙️',
      colorFrom: 'indigo',
      colorTo: 'purple',
      short_description: 'High fidelity text-to-speech'
    },
    runtime: { stage: 'RUNNING', hardware: { current: 'cpu-basic' } }
  }

  it('maps emoji, gradient colors, description and runtime stage for spaces', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([rawSpace]))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    const page = await client.searchRepos({ kind: 'space', sort: 'trending' })
    expect(page.items[0]).toMatchObject({
      id: 'evalstate/parler-tts',
      emoji: '🎙️',
      colorFrom: 'indigo',
      colorTo: 'purple',
      shortDescription: 'High fidelity text-to-speech',
      runtimeStage: 'RUNNING'
    })
  })

  it('keeps gallery fields undefined for models even when cardData exists', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse([{ id: 'a/b', cardData: { emoji: '🤖', colorFrom: 'red' } }]))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    const page = await client.searchRepos({ kind: 'model', sort: 'trending' })
    expect(page.items[0]!.emoji).toBeUndefined()
    expect(page.items[0]!.colorFrom).toBeUndefined()
    expect(page.items[0]!.runtimeStage).toBeUndefined()
  })
})

describe('mapDiscussionDetail PR fields', () => {
  it('surfaces baseRef and diffUrl on discussion details', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        num: 159,
        title: 'Fix tokenizer',
        status: 'open',
        isPullRequest: true,
        changes: { base: 'refs/heads/main' },
        diffUrl: 'https://huggingface.co/openai-community/gpt2/discussions/159/files.diff',
        events: []
      })
    )
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    const detail = await client.getDiscussion('model', 'openai-community/gpt2', 159)
    expect(detail.baseRef).toBe('refs/heads/main')
    expect(detail.diffUrl).toBe(
      'https://huggingface.co/openai-community/gpt2/discussions/159/files.diff'
    )
  })

  it('normalizes comment reactions and drops emoji-less rows', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        num: 1,
        title: 't',
        status: 'open',
        events: [
          {
            id: '678de6cec15b184e48c89ae6',
            type: 'comment',
            data: {
              latest: { raw: 'hello' },
              reactions: [
                { reaction: '🚀', users: ['a', 'b'], count: 2 },
                { reaction: '👍', users: ['c'] },
                { users: ['ghost'] }
              ]
            }
          },
          { id: 'e2', type: 'status-change', data: { status: 'closed' } }
        ]
      })
    )
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    const detail = await client.getDiscussion('model', 'a/b', 1)
    expect(detail.events[0]!.reactions).toEqual([
      { emoji: '🚀', count: 2, users: ['a', 'b'] },
      { emoji: '👍', count: 1, users: ['c'] }
    ])
    expect(detail.events[1]!.reactions).toEqual([])
  })

  it('surfaces title-change, pinning-change, and locking-change fields (openapi.json, verified 2026-07-13)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        num: 1,
        title: 't',
        status: 'open',
        events: [
          { id: 'e1', type: 'title-change', data: { from: 'Old title', to: 'New title' } },
          { id: 'e2', type: 'pinning-change', data: { pinned: true } },
          { id: 'e3', type: 'pinning-change', data: { pinned: false } },
          { id: 'e4', type: 'locking-change', data: { locked: true } },
          { id: 'e5', type: 'ref-deleted', data: {} }
        ]
      })
    )
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    const detail = await client.getDiscussion('model', 'a/b', 1)
    expect(detail.events[0]).toMatchObject({
      type: 'title-change',
      titleFrom: 'Old title',
      titleTo: 'New title'
    })
    expect(detail.events[1]).toMatchObject({ type: 'pinning-change', pinned: true })
    expect(detail.events[2]).toMatchObject({ type: 'pinning-change', pinned: false })
    expect(detail.events[3]).toMatchObject({ type: 'locking-change', locked: true })
    expect(detail.events[4]).toMatchObject({ type: 'ref-deleted' })
  })
})

describe('HubClient.isInferenceAvailable', () => {
  it('is true when providers exist and false for an empty mapping', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ inference: 'warm', inferenceProviderMapping: { novita: {} } })
      )
      .mockResolvedValueOnce(jsonResponse({ inferenceProviderMapping: {} }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    await expect(client.isInferenceAvailable('a/b')).resolves.toBe(true)
    await expect(client.isInferenceAvailable('c/d')).resolves.toBe(false)
  })

  it('degrades to false on failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('x', { status: 500 }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0, maxRetries: 0 })
    await expect(client.isInferenceAvailable('a/b')).resolves.toBe(false)
  })
})

describe('HubClient.createDiscussion', () => {
  it('POSTs title/description/pullRequest with bearer auth and returns the number', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ num: 42, title: 'Add eval results' }, 201))
    const client = new HubClient({
      fetchImpl,
      cacheTtlMs: 0,
      minRequestGapMs: 0,
      getAccessToken: () => 'hf_token'
    })
    const created = await client.createDiscussion(
      'dataset',
      'org/data',
      'Add eval results',
      'Numbers attached below.'
    )
    expect(created).toEqual({ num: 42 })
    const [url, init] = fetchImpl.mock.calls[0]! as [string, RequestInit]
    expect(url).toBe('https://huggingface.co/api/datasets/org/data/discussions')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer hf_token')
    expect(JSON.parse(init.body as string)).toEqual({
      title: 'Add eval results',
      description: 'Numbers attached below.',
      pullRequest: false
    })
  })

  it('sets pullRequest for draft PRs', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ num: 7 }, 201))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    await client.createDiscussion('model', 'org/m', 'Fix config', 'See patch.', true)
    expect(JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string)).toMatchObject({
      pullRequest: true
    })
  })
})

describe('HubClient.getPaperComments', () => {
  it('nests replies one level via parentCommentId, drops hidden content, and normalizes reactions', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        comments: [
          {
            id: 'c1',
            type: 'comment',
            author: {
              name: 'alice',
              fullname: 'Alice',
              avatarUrl: 'https://cdn/a.png',
              isPro: true
            },
            createdAt: '2024-01-01T00:00:00Z',
            data: {
              hidden: false,
              latest: { raw: 'top-level' },
              reactions: [{ reaction: '🔥', users: ['x'], count: 1 }]
            }
          },
          {
            id: 'c2',
            type: 'comment',
            author: { name: 'bob' },
            createdAt: '2024-01-02T00:00:00Z',
            data: { hidden: false, latest: { raw: 'a reply' }, parentCommentId: 'c1' }
          },
          {
            id: 'c3',
            type: 'comment',
            author: { name: 'mod' },
            createdAt: '2024-01-03T00:00:00Z',
            data: {
              hidden: true,
              hiddenReason: 'Spam',
              hiddenBy: 'mod',
              latest: { raw: 'should be dropped' }
            }
          }
        ]
      })
    )
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    const comments = await client.getPaperComments('2310.06825')
    expect(comments).toHaveLength(2)
    expect(comments[0]).toMatchObject({
      id: 'c1',
      author: 'alice',
      authorFullname: 'Alice',
      authorAvatarUrl: 'https://cdn/a.png',
      authorIsPro: true,
      content: 'top-level',
      reactions: [{ emoji: '🔥', count: 1, users: ['x'] }]
    })
    expect(comments[0]!.replies).toEqual([
      expect.objectContaining({ id: 'c2', author: 'bob', content: 'a reply' })
    ])
    expect(comments[1]).toMatchObject({
      id: 'c3',
      hidden: true,
      hiddenReason: 'Spam',
      hiddenBy: 'mod',
      content: ''
    })
    const [url] = fetchImpl.mock.calls[0]! as [string]
    expect(url).toBe('https://huggingface.co/api/papers/2310.06825?field=comments')
  })

  it('returns an empty list when the response has no comments field', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: '2310.06825' }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    await expect(client.getPaperComments('2310.06825')).resolves.toEqual([])
  })
})
