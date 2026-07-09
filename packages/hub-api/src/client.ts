import type {
  DiscussionDetail,
  DiscussionSummary,
  FileTreeEntry,
  HubNotification,
  Page,
  PaperSummary,
  RepoDetail,
  RepoKind,
  RepoSummary,
  SearchQuery,
  UserProfile
} from '@oh-my-huggingface/shared'
import { HubApiError, isNotFound } from './errors'
import {
  mapDiscussionDetail,
  mapDiscussionSummary,
  mapFileTree,
  mapPaper,
  mapRepoDetail,
  mapRepoSummary,
  mapWhoAmI
} from './mappers'

export const DEFAULT_ENDPOINT = 'https://huggingface.co'

export const API_PATH: Record<RepoKind, string> = {
  model: 'models',
  dataset: 'datasets',
  space: 'spaces'
}

/** URL prefix used by resolve/tree URLs ("" for models, "datasets/"…). */
export const RESOLVE_PREFIX: Record<RepoKind, string> = {
  model: '',
  dataset: 'datasets/',
  space: 'spaces/'
}

const SORT_PARAM: Record<SearchQuery['sort'], string> = {
  trending: 'trendingScore',
  downloads: 'downloads',
  likes: 'likes',
  updated: 'lastModified',
  created: 'createdAt'
}

const LIST_EXPAND: Record<RepoKind, string[]> = {
  model: [
    'downloads',
    'likes',
    'lastModified',
    'createdAt',
    'pipeline_tag',
    'library_name',
    'tags',
    'private',
    'gated',
    'trendingScore',
    'safetensors'
  ],
  dataset: [
    'downloads',
    'likes',
    'lastModified',
    'createdAt',
    'tags',
    'private',
    'gated',
    'trendingScore'
  ],
  space: ['likes', 'lastModified', 'createdAt', 'tags', 'private', 'sdk', 'trendingScore']
}

export interface HubClientOptions {
  endpoint?: string
  userAgent?: string
  fetchImpl?: typeof fetch
  /** TTL for the in-memory GET cache. 0 disables caching. */
  cacheTtlMs?: number
  /** Called on every request; return undefined when signed out. */
  getAccessToken?: () => string | undefined
}

interface CacheEntry {
  at: number
  status: number
  body: unknown
  nextUrl?: string
}

function parseLinkNext(header: string | null): string | undefined {
  if (!header) return undefined
  for (const part of header.split(',')) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="next"/)
    if (m) return m[1]
  }
  return undefined
}

/**
 * Thin, cached client over the Hub REST API. All requests carry a descriptive
 * User-Agent and are centrally cached so UI-driven refetches never hammer the API.
 */
export class HubClient {
  private readonly endpoint: string
  private readonly userAgent: string
  private readonly fetchImpl: typeof fetch
  private readonly cacheTtlMs: number
  private readonly getAccessToken: () => string | undefined
  private readonly cache = new Map<string, CacheEntry>()

  constructor(options: HubClientOptions = {}) {
    this.endpoint = (options.endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, '')
    this.userAgent = options.userAgent ?? 'oh-my-huggingface (unofficial desktop client)'
    this.fetchImpl = options.fetchImpl ?? fetch
    this.cacheTtlMs = options.cacheTtlMs ?? 30_000
    this.getAccessToken = options.getAccessToken ?? (() => undefined)
  }

  get baseUrl(): string {
    return this.endpoint
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'User-Agent': this.userAgent }
    const token = this.getAccessToken()
    if (token) h.Authorization = `Bearer ${token}`
    return h
  }

  private cacheKey(url: string): string {
    // Token presence changes responses (private/gated repos), so partition the cache.
    return `${this.getAccessToken() ? 'auth' : 'anon'}:${url}`
  }

  invalidateCache(): void {
    this.cache.clear()
  }

  private async getJson<T>(url: string, opts: { ttl?: number } = {}): Promise<{
    body: T
    nextUrl?: string
  }> {
    const ttl = opts.ttl ?? this.cacheTtlMs
    const key = this.cacheKey(url)
    const hit = this.cache.get(key)
    if (hit && Date.now() - hit.at < ttl) {
      return { body: hit.body as T, nextUrl: hit.nextUrl }
    }
    const res = await this.fetchImpl(url, { headers: this.headers() })
    if (!res.ok) {
      throw new HubApiError(`GET ${url} failed: ${res.status} ${res.statusText}`, res.status, url)
    }
    const body = (await res.json()) as T
    const nextUrl = parseLinkNext(res.headers.get('Link'))
    if (ttl > 0) this.cache.set(key, { at: Date.now(), status: res.status, body, nextUrl })
    return { body, nextUrl }
  }

  private async getText(url: string): Promise<string> {
    const key = this.cacheKey(url)
    const hit = this.cache.get(key)
    if (hit && Date.now() - hit.at < this.cacheTtlMs) return hit.body as string
    const res = await this.fetchImpl(url, { headers: this.headers() })
    if (!res.ok) {
      throw new HubApiError(`GET ${url} failed: ${res.status} ${res.statusText}`, res.status, url)
    }
    const body = await res.text()
    if (this.cacheTtlMs > 0) this.cache.set(key, { at: Date.now(), status: res.status, body })
    return body
  }

  /** Build the search URL for a query; exposed for tests. */
  buildSearchUrl(query: SearchQuery): string {
    const url = new URL(`${this.endpoint}/api/${API_PATH[query.kind]}`)
    if (query.search) url.searchParams.set('search', query.search)
    if (query.author) url.searchParams.set('author', query.author)
    if (query.pipelineTag) url.searchParams.set('pipeline_tag', query.pipelineTag)
    if (query.library) url.searchParams.set('library', query.library)
    for (const tag of query.tags ?? []) url.searchParams.append('filter', tag)
    if (query.license) url.searchParams.append('filter', `license:${query.license}`)
    url.searchParams.set('sort', SORT_PARAM[query.sort])
    url.searchParams.set('direction', '-1')
    url.searchParams.set('limit', String(query.limit ?? 30))
    for (const field of LIST_EXPAND[query.kind]) url.searchParams.append('expand[]', field)
    return url.toString()
  }

  async searchRepos(query: SearchQuery): Promise<Page<RepoSummary>> {
    const url = query.cursor ?? this.buildSearchUrl(query)
    const { body, nextUrl } = await this.getJson<unknown[]>(url)
    return { items: body.map((raw) => mapRepoSummary(raw as never, query.kind)), nextCursor: nextUrl }
  }

  async getRepoDetail(kind: RepoKind, repoId: string): Promise<RepoDetail> {
    const url = `${this.endpoint}/api/${API_PATH[kind]}/${repoId}`
    const { body } = await this.getJson<unknown>(url)
    return mapRepoDetail(body as never, kind)
  }

  resolveUrl(kind: RepoKind, repoId: string, revision: string, path: string): string {
    const rev = encodeURIComponent(revision)
    const p = path.split('/').map(encodeURIComponent).join('/')
    return `${this.endpoint}/${RESOLVE_PREFIX[kind]}${repoId}/resolve/${rev}/${p}`
  }

  /** Fetch README.md via the resolve URL. Returns '' when the repo has no card. */
  async getReadme(kind: RepoKind, repoId: string, revision = 'main'): Promise<string> {
    try {
      return await this.getText(this.resolveUrl(kind, repoId, revision, 'README.md'))
    } catch (err) {
      if (isNotFound(err)) return ''
      throw err
    }
  }

  /** Lists a tree level (or the whole tree with `recursive`), draining Link-header pagination. */
  async getFileTree(
    kind: RepoKind,
    repoId: string,
    revision = 'main',
    path = '',
    opts: { recursive?: boolean } = {}
  ): Promise<FileTreeEntry[]> {
    const rev = encodeURIComponent(revision)
    const suffix = path ? `/${path.split('/').map(encodeURIComponent).join('/')}` : ''
    let url: string | undefined =
      `${this.endpoint}/api/${API_PATH[kind]}/${repoId}/tree/${rev}${suffix}` +
      (opts.recursive ? '?recursive=true' : '')
    const all: FileTreeEntry[] = []
    while (url) {
      const page: { body: never[]; nextUrl?: string } = await this.getJson<never[]>(url)
      all.push(...mapFileTree(page.body))
      url = page.nextUrl
    }
    return all
  }

  async getDailyPapers(cursor?: string): Promise<Page<PaperSummary>> {
    const url = cursor ?? `${this.endpoint}/api/daily_papers?limit=50`
    const { body, nextUrl } = await this.getJson<unknown[]>(url)
    return { items: (body as never[]).map(mapPaper), nextCursor: nextUrl }
  }

  async listDiscussions(kind: RepoKind, repoId: string): Promise<Page<DiscussionSummary>> {
    const url = `${this.endpoint}/api/${API_PATH[kind]}/${repoId}/discussions`
    const { body } = await this.getJson<{ discussions?: unknown[] }>(url)
    return { items: (body.discussions ?? []).map((d) => mapDiscussionSummary(d as never)) }
  }

  async getDiscussion(kind: RepoKind, repoId: string, num: number): Promise<DiscussionDetail> {
    const url = `${this.endpoint}/api/${API_PATH[kind]}/${repoId}/discussions/${num}`
    const { body } = await this.getJson<unknown>(url, { ttl: 5_000 })
    return mapDiscussionDetail(body as never)
  }

  async commentOnDiscussion(
    kind: RepoKind,
    repoId: string,
    num: number,
    comment: string
  ): Promise<void> {
    const url = `${this.endpoint}/api/${API_PATH[kind]}/${repoId}/discussions/${num}/comment`
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment })
    })
    if (!res.ok) {
      throw new HubApiError(`POST ${url} failed: ${res.status} ${res.statusText}`, res.status, url)
    }
  }

  async whoAmI(): Promise<UserProfile> {
    const { body } = await this.getJson<unknown>(`${this.endpoint}/api/whoami-v2`, { ttl: 0 })
    return mapWhoAmI(body as never)
  }

  /**
   * The notifications endpoint is not part of the documented public API; treat any
   * failure as "no notifications" so the inbox degrades gracefully.
   */
  async getNotifications(): Promise<Page<HubNotification>> {
    try {
      const { body } = await this.getJson<{ notifications?: unknown[] }>(
        `${this.endpoint}/api/notifications`,
        { ttl: 10_000 }
      )
      const items = (body.notifications ?? []).map((raw, i) => {
        const n = raw as {
          id?: string
          title?: string
          url?: string
          read?: boolean
          createdAt?: string
          repo?: { name?: string }
        }
        return {
          id: n.id ?? String(i),
          title: n.title ?? '',
          url: n.url,
          read: n.read ?? false,
          createdAt: n.createdAt,
          repoId: n.repo?.name
        }
      })
      return { items }
    } catch {
      return { items: [] }
    }
  }

  /** List repos for an author, used by the follow poller. */
  async listByAuthor(kind: RepoKind, author: string, limit = 20): Promise<RepoSummary[]> {
    const page = await this.searchRepos({ kind, author, sort: 'updated', limit })
    return page.items
  }
}
