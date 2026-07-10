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

const SLUG = 'julien/cool-models-6608ca7bbc8b7a1e30ba53e3'

const rawCollection = {
  slug: SLUG,
  title: 'Cool models',
  description: 'A few favorites',
  owner: { name: 'julien', type: 'user' },
  private: false,
  theme: 'indigo',
  upvotes: 7,
  lastUpdated: '2026-07-01T00:00:00.000Z',
  items: [
    {
      _id: '6608ca7bbc8b7a1e30ba53e4',
      type: 'model',
      id: 'meta-llama/Llama-3-8B',
      position: 0,
      downloads: 5000,
      likes: 100,
      note: { text: 'the classic', html: '<p>the classic</p>' }
    },
    {
      _id: '6608ca7bbc8b7a1e30ba53e5',
      type: 'paper',
      id: '2401.00001',
      title: 'Attention Is Still All You Need',
      position: 1,
      upvotes: 42
    },
    // Unsupported item types are dropped from the mapped detail.
    { _id: '6608ca7bbc8b7a1e30ba53e6', type: 'bucket', id: 'julien/bucket', position: 2 },
    {
      _id: '6608ca7bbc8b7a1e30ba53e7',
      type: 'collection',
      id: '6608ca7bbc8b7a1e30ba53e8',
      title: 'Nested picks',
      slug: 'julien/nested-picks-6608ca7bbc8b7a1e30ba53e8',
      position: 3,
      upvotes: 3
    }
  ]
}

describe('HubClient.listCollections', () => {
  it('lists collections for an owner and maps summaries', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([rawCollection]))
    const client = new HubClient({ fetchImpl, ...FAST })
    const collections = await client.listCollections('julien')
    const { url } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/collections?owner=julien&limit=100')
    expect(collections).toEqual([
      {
        slug: SLUG,
        title: 'Cool models',
        description: 'A few favorites',
        owner: 'julien',
        private: false,
        theme: 'indigo',
        itemCount: 4,
        upvotes: 7,
        updatedAt: '2026-07-01T00:00:00.000Z'
      }
    ])
  })
})

describe('HubClient.getCollection', () => {
  it('fetches by slug and maps items, dropping unsupported types', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(rawCollection))
    const client = new HubClient({ fetchImpl, ...FAST })
    const detail = await client.getCollection(SLUG)
    expect(requestOf(fetchImpl).url).toBe(`https://huggingface.co/api/collections/${SLUG}`)
    expect(detail.items).toEqual([
      {
        itemId: '6608ca7bbc8b7a1e30ba53e4',
        type: 'model',
        id: 'meta-llama/Llama-3-8B',
        title: 'meta-llama/Llama-3-8B',
        note: 'the classic',
        position: 0,
        downloads: 5000,
        likes: 100,
        emoji: undefined
      },
      {
        itemId: '6608ca7bbc8b7a1e30ba53e5',
        type: 'paper',
        id: '2401.00001',
        title: 'Attention Is Still All You Need',
        note: undefined,
        position: 1,
        downloads: undefined,
        likes: 42,
        emoji: undefined
      },
      {
        itemId: '6608ca7bbc8b7a1e30ba53e7',
        type: 'collection',
        id: '6608ca7bbc8b7a1e30ba53e8',
        title: 'Nested picks',
        // Nested collections keep their routable slug (id is the internal 24-hex id).
        slug: 'julien/nested-picks-6608ca7bbc8b7a1e30ba53e8',
        note: undefined,
        position: 3,
        downloads: undefined,
        likes: 3,
        emoji: undefined
      }
    ])
  })
})

describe('HubClient.createCollection', () => {
  it('POSTs title/namespace/description/private and maps the created detail', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ...rawCollection, items: [], private: true }))
    const client = new HubClient({ fetchImpl, ...FAST })
    const created = await client.createCollection({
      namespace: 'julien',
      title: 'Cool models',
      description: 'A few favorites',
      private: true
    })
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe('https://huggingface.co/api/collections')
    expect(init.method).toBe('POST')
    expect(jsonBodyOf(init)).toEqual({
      title: 'Cool models',
      namespace: 'julien',
      description: 'A few favorites',
      private: true
    })
    expect(created.slug).toBe(SLUG)
    expect(created.private).toBe(true)
    expect(created.items).toEqual([])
  })
})

describe('HubClient collection mutations', () => {
  it('PATCHes collection metadata', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.updateCollection(SLUG, { title: 'Renamed', private: true, theme: 'orange' })
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe(`https://huggingface.co/api/collections/${SLUG}`)
    expect(init.method).toBe('PATCH')
    expect(jsonBodyOf(init)).toEqual({ title: 'Renamed', private: true, theme: 'orange' })
  })

  it('DELETEs a collection', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.deleteCollection(SLUG)
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe(`https://huggingface.co/api/collections/${SLUG}`)
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })

  it('POSTs a new item with a note', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.addCollectionItem(SLUG, { type: 'model', id: 'a/b' }, 'nice')
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe(`https://huggingface.co/api/collections/${SLUG}/items`)
    expect(init.method).toBe('POST')
    expect(jsonBodyOf(init)).toEqual({ item: { type: 'model', id: 'a/b' }, note: 'nice' })
  })

  it('PATCHes an item note/position by item id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.updateCollectionItem(SLUG, '6608ca7bbc8b7a1e30ba53e4', { note: 'x', position: 3 })
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe(
      `https://huggingface.co/api/collections/${SLUG}/items/6608ca7bbc8b7a1e30ba53e4`
    )
    expect(init.method).toBe('PATCH')
    expect(jsonBodyOf(init)).toEqual({ note: 'x', position: 3 })
  })

  it('DELETEs an item by item id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = new HubClient({ fetchImpl, ...FAST })
    await client.removeCollectionItem(SLUG, '6608ca7bbc8b7a1e30ba53e4')
    const { url, init } = requestOf(fetchImpl)
    expect(url).toBe(
      `https://huggingface.co/api/collections/${SLUG}/items/6608ca7bbc8b7a1e30ba53e4`
    )
    expect(init.method).toBe('DELETE')
  })

  it('invalidates the GET cache after a successful mutation', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse([])))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 60_000, minRequestGapMs: 0 })
    await client.listCollections('julien')
    await client.listCollections('julien')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await client.deleteCollection(SLUG)
    await client.listCollections('julien')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })
})
