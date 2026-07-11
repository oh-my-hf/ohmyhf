import type {
  AccessRequest,
  ActivityFeed,
  BillingUsage,
  CollectionDetail,
  CollectionSummary,
  DatasetRows,
  DatasetSplit,
  FollowedAccount,
  DiscussionDetail,
  DiscussionStatusFilter,
  DiscussionSummary,
  DiscussionType,
  FileTextResult,
  FileTreeEntry,
  MyRepoEntry,
  NotificationsPage,
  Page,
  PaperSummary,
  PostSummary,
  RepoDetail,
  RepoKind,
  RepoSummary,
  SafetensorsHeader,
  SafetensorsTensor,
  SearchQuery,
  SpaceSecret,
  SpaceVariable,
  UserOverview,
  UserProfile,
  UserSearchResult,
  WatchedEntry,
  OrgSearchResult,
  PaperSearchResult,
  CollectionSearchResult
} from '@oh-my-huggingface/shared'
import { HubApiError, isNotFound } from './errors'
import {
  mapAccessRequest,
  mapActivityFeed,
  mapBillingUsage,
  mapCollectionDetail,
  mapCollectionSummary,
  mapDiscussionDetail,
  mapDiscussionSummary,
  mapFileTree,
  mapMyRepos,
  mapNotificationsPage,
  mapPaper,
  mapPaperDetail,
  mapPost,
  mapRepoDetail,
  mapRepoSummary,
  mapSpaceSecrets,
  mapSpaceVariables,
  mapUserOverview,
  mapWhoAmI,
  mapWhoAmIAuth,
  type WhoAmIDetailed
} from './mappers'

export const DEFAULT_ENDPOINT = 'https://huggingface.co'

export const DATASETS_SERVER = 'https://datasets-server.huggingface.co'

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
  space: [
    'likes',
    'lastModified',
    'createdAt',
    'tags',
    'private',
    'sdk',
    'trendingScore',
    'cardData',
    'runtime'
  ]
}

export interface HubClientOptions {
  endpoint?: string
  userAgent?: string
  fetchImpl?: typeof fetch
  /** TTL for the in-memory GET cache. 0 disables caching. */
  cacheTtlMs?: number
  /** Maximum number of requests in flight at once. */
  maxConcurrent?: number
  /** Minimum delay between request starts, spreading bursts to dodge rate limits. */
  minRequestGapMs?: number
  /** Retries for 429/503 responses, in addition to the initial attempt. */
  maxRetries?: number
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const RETRY_AFTER_CAP_MS = 60_000

/** Retry-After is either seconds or an HTTP date; without it, full-jitter backoff from 1s. */
function retryDelayMs(header: string | null, attempt: number): number {
  if (header) {
    const seconds = Number(header)
    if (Number.isFinite(seconds)) {
      return Math.min(Math.max(seconds, 0) * 1000, RETRY_AFTER_CAP_MS)
    }
    const date = Date.parse(header)
    if (!Number.isNaN(date)) {
      return Math.min(Math.max(date - Date.now(), 0), RETRY_AFTER_CAP_MS)
    }
  }
  return Math.min(Math.random() * 1000 * 2 ** attempt, RETRY_AFTER_CAP_MS)
}

/** Failures where an expired cache entry is still better than an error. */
function isTransientFailure(err: unknown): boolean {
  if (!(err instanceof HubApiError)) return true // network-level failure
  return err.status === 429 || err.status === 503
}

/** Total file size: Content-Range "bytes 0-x/TOTAL" wins over Content-Length. */
function totalSizeFrom(res: Response, received: number): number {
  const total = res.headers.get('Content-Range')?.match(/\/(\d+)$/)?.[1]
  if (total) return Number(total)
  const length = Number(res.headers.get('Content-Length'))
  return Number.isFinite(length) && length > 0 ? length : received
}

const MAX_CELL_CHARS = 200

/** Pre-stringify a dataset cell for display, truncating long values. */
function formatCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? '')
  return text.length > MAX_CELL_CHARS ? `${text.slice(0, MAX_CELL_CHARS)}…` : text
}

const SAFETENSORS_MAX_HEADER_BYTES = 8 * 1024 * 1024

/** PR diffs beyond this length are truncated before reaching the renderer. */
const DIFF_MAX_CHARS = 2 * 1024 * 1024

/** Bounds for the Space log SSE snapshot: stop after this many bytes or this long. */
const SPACE_LOGS_MAX_BYTES = 64 * 1024
const SPACE_LOGS_WINDOW_MS = 2500

/** Gated-access management only exists for models and datasets. */
type GatedRepoKind = Extract<RepoKind, 'model' | 'dataset'>

/** Watch targets are addressed by their 24-hex internal id. */
interface WatchTarget {
  id: string
  type: 'user' | 'org'
}

/** Concatenates the `data:` payload lines of a raw SSE stream into plain text. */
function sseDataText(raw: string): string {
  const lines: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice('data:'.length)
    lines.push(payload.startsWith(' ') ? payload.slice(1) : payload)
  }
  return lines.join('\n')
}

/**
 * Thin, cached client over the Hub REST API. All requests carry a descriptive
 * User-Agent and are centrally cached so UI-driven refetches never hammer the API.
 * Every fetch funnels through a global limiter (concurrency cap + start gap) with
 * 429/503 retries, and expired cache entries are served when a refresh fails.
 */
export class HubClient {
  private readonly endpoint: string
  private readonly endpointHost: string
  private readonly userAgent: string
  private readonly fetchImpl: typeof fetch
  private readonly cacheTtlMs: number
  private readonly maxConcurrent: number
  private readonly minRequestGapMs: number
  private readonly maxRetries: number
  private readonly getAccessToken: () => string | undefined
  private readonly cache = new Map<string, CacheEntry>()
  private readonly inflight = new Map<string, Promise<unknown>>()
  private active = 0
  private nextStartAt = 0
  private readonly slotWaiters: Array<() => void> = []

  constructor(options: HubClientOptions = {}) {
    this.endpoint = (options.endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, '')
    let endpointHost = ''
    try {
      endpointHost = new URL(this.endpoint).hostname
    } catch {
      // Non-URL endpoint: auth only attaches to *.huggingface.co hosts.
    }
    this.endpointHost = endpointHost
    this.userAgent = options.userAgent ?? 'oh-my-huggingface (unofficial desktop client)'
    this.fetchImpl = options.fetchImpl ?? fetch
    this.cacheTtlMs = options.cacheTtlMs ?? 30_000
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 4)
    this.minRequestGapMs = Math.max(0, options.minRequestGapMs ?? 120)
    this.maxRetries = Math.max(0, options.maxRetries ?? 2)
    this.getAccessToken = options.getAccessToken ?? (() => undefined)
  }

  get baseUrl(): string {
    return this.endpoint
  }

  /** Never send the token to hosts other than the configured endpoint or *.huggingface.co. */
  private allowsAuth(url: string): boolean {
    let host: string
    try {
      host = new URL(url).hostname
    } catch {
      return false
    }
    return (
      (this.endpointHost !== '' && host === this.endpointHost) ||
      host === 'huggingface.co' ||
      host.endsWith('.huggingface.co')
    )
  }

  private headers(url: string): Record<string, string> {
    const h: Record<string, string> = { 'User-Agent': this.userAgent }
    const token = this.getAccessToken()
    if (token && this.allowsAuth(url)) h.Authorization = `Bearer ${token}`
    return h
  }

  private cacheKey(url: string): string {
    // Token presence changes responses (private/gated repos), so partition the cache.
    return `${this.getAccessToken() ? 'auth' : 'anon'}:${url}`
  }

  invalidateCache(): void {
    this.cache.clear()
  }

  /** Admits a request start: caps concurrency and spaces starts by minRequestGapMs. */
  private async acquireSlot(): Promise<void> {
    while (this.active >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.slotWaiters.push(resolve))
    }
    this.active += 1
    const startAt = Math.max(Date.now(), this.nextStartAt)
    this.nextStartAt = startAt + this.minRequestGapMs
    const delay = startAt - Date.now()
    if (delay > 0) await sleep(delay)
  }

  private releaseSlot(): void {
    this.active -= 1
    this.slotWaiters.shift()?.()
  }

  /** All network access funnels through here: limiter plus 429/503 retry with Retry-After. */
  private async fetchWithPolicy(
    url: string,
    init?: RequestInit,
    opts: { retryStatuses?: number[] } = {}
  ): Promise<Response> {
    const retryStatuses = opts.retryStatuses ?? [429, 503]
    for (let attempt = 0; ; attempt++) {
      await this.acquireSlot()
      let res: Response
      try {
        res = await this.fetchImpl(url, init)
      } finally {
        this.releaseSlot()
      }
      if (retryStatuses.includes(res.status) && attempt < this.maxRetries) {
        void res.body?.cancel().catch(() => undefined)
        await sleep(retryDelayMs(res.headers.get('Retry-After'), attempt))
        continue
      }
      return res
    }
  }

  private throwHttpError(res: Response, url: string): never {
    const detail = res.status === 429 ? ' (rate limited)' : ''
    throw new HubApiError(
      `GET ${url} failed: ${res.status} ${res.statusText}${detail}`,
      res.status,
      url
    )
  }

  /**
   * Authenticated JSON mutation. Retries only 429s (a 503 may already have
   * applied side effects) and invalidates the GET cache after every success,
   * so the next read reflects the change.
   */
  private async sendJson(
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    body?: unknown
  ): Promise<Response> {
    const res = await this.fetchWithPolicy(
      url,
      {
        method,
        headers: {
          ...this.headers(url),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      },
      { retryStatuses: [429] }
    )
    if (!res.ok) {
      const detail = res.status === 429 ? ' (rate limited)' : ''
      throw new HubApiError(
        `${method} ${url} failed: ${res.status} ${res.statusText}${detail}`,
        res.status,
        url
      )
    }
    this.invalidateCache()
    return res
  }

  private async getJson<T>(
    url: string,
    opts: { ttl?: number } = {}
  ): Promise<{
    body: T
    nextUrl?: string
  }> {
    const ttl = opts.ttl ?? this.cacheTtlMs
    const key = this.cacheKey(url)
    const hit = this.cache.get(key)
    if (hit && Date.now() - hit.at < ttl) {
      return { body: hit.body as T, nextUrl: hit.nextUrl }
    }
    // Coalesce identical concurrent GETs into a single request.
    const inflightKey = `json:${key}`
    const pending = this.inflight.get(inflightKey)
    if (pending) return pending as Promise<{ body: T; nextUrl?: string }>
    const request = this.fetchJson<T>(url, key, ttl).finally(() => {
      this.inflight.delete(inflightKey)
    })
    this.inflight.set(inflightKey, request)
    return request
  }

  private async fetchJson<T>(
    url: string,
    key: string,
    ttl: number
  ): Promise<{ body: T; nextUrl?: string }> {
    try {
      const res = await this.fetchWithPolicy(url, { headers: this.headers(url) })
      if (!res.ok) this.throwHttpError(res, url)
      const body = (await res.json()) as T
      const nextUrl = parseLinkNext(res.headers.get('Link'))
      if (ttl > 0) this.cache.set(key, { at: Date.now(), status: res.status, body, nextUrl })
      return { body, nextUrl }
    } catch (err) {
      // Stale-on-error: an expired entry beats surfacing a transient failure.
      const stale = this.cache.get(key)
      if (stale && isTransientFailure(err)) return { body: stale.body as T, nextUrl: stale.nextUrl }
      throw err
    }
  }

  private async getText(url: string): Promise<string> {
    const key = this.cacheKey(url)
    const hit = this.cache.get(key)
    if (hit && Date.now() - hit.at < this.cacheTtlMs) return hit.body as string
    const inflightKey = `text:${key}`
    const pending = this.inflight.get(inflightKey)
    if (pending) return pending as Promise<string>
    const request = this.fetchText(url, key).finally(() => {
      this.inflight.delete(inflightKey)
    })
    this.inflight.set(inflightKey, request)
    return request
  }

  private async fetchText(url: string, key: string): Promise<string> {
    try {
      const res = await this.fetchWithPolicy(url, { headers: this.headers(url) })
      if (!res.ok) this.throwHttpError(res, url)
      const body = await res.text()
      if (this.cacheTtlMs > 0) this.cache.set(key, { at: Date.now(), status: res.status, body })
      return body
    } catch (err) {
      const stale = this.cache.get(key)
      if (stale && isTransientFailure(err)) return stale.body as string
      throw err
    }
  }

  /** Ranged GET returning the requested byte window even when the server ignores Range. */
  private async fetchRange(url: string, start: number, end: number): Promise<Uint8Array> {
    const res = await this.fetchWithPolicy(url, {
      headers: {
        ...this.headers(url),
        Range: `bytes=${start}-${end}`,
        'Accept-Encoding': 'identity'
      }
    })
    if (res.status !== 200 && res.status !== 206) this.throwHttpError(res, url)
    const bytes = new Uint8Array(await res.arrayBuffer())
    const want = end - start + 1
    return res.status === 200 && bytes.byteLength > want ? bytes.slice(start, end + 1) : bytes
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
    if (query.inferenceProvider && query.kind === 'model') {
      url.searchParams.set('inference_provider', query.inferenceProvider)
    }
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

  /** Single paper lookup (deep links to papers outside the daily feed). */
  async getPaper(paperId: string): Promise<PaperSummary> {
    const url = `${this.endpoint}/api/papers/${encodeURIComponent(paperId)}`
    const { body } = await this.getJson<unknown>(url, { ttl: 60_000 })
    return mapPaperDetail(body as never)
  }

  async listDiscussions(
    kind: RepoKind,
    repoId: string,
    opts: { type?: DiscussionType; status?: DiscussionStatusFilter } = {}
  ): Promise<Page<DiscussionSummary>> {
    const url = new URL(`${this.endpoint}/api/${API_PATH[kind]}/${repoId}/discussions`)
    if (opts.type) url.searchParams.set('type', opts.type)
    if (opts.status) url.searchParams.set('status', opts.status)
    const { body } = await this.getJson<{ discussions?: unknown[] }>(url.toString())
    return { items: (body.discussions ?? []).map((d) => mapDiscussionSummary(d as never)) }
  }

  /**
   * Raw unified diff of a pull request, capped at DIFF_MAX_CHARS. Returns ''
   * when the discussion exposes no diffUrl (plain discussions, drafts).
   */
  async getDiscussionDiff(kind: RepoKind, repoId: string, num: number): Promise<string> {
    const url = `${this.endpoint}/api/${API_PATH[kind]}/${repoId}/discussions/${num}`
    const { body } = await this.getJson<{ diffUrl?: string }>(url, { ttl: 5_000 })
    if (!body.diffUrl) return ''
    const diffUrl = new URL(body.diffUrl, this.endpoint).toString()
    const diff = await this.getText(diffUrl)
    if (diff.length <= DIFF_MAX_CHARS) return diff
    return `${diff.slice(0, DIFF_MAX_CHARS)}\n... (diff truncated)`
  }

  /**
   * Community posts feed. The endpoint sends no Link header, so pagination
   * advances a skip cursor by the number of items actually received (the
   * server may return fewer than the requested limit).
   */
  async getPosts(cursor?: string): Promise<Page<PostSummary>> {
    const url = cursor ?? `${this.endpoint}/api/posts?limit=30`
    const { body, nextUrl } = await this.getJson<{
      socialPosts?: unknown[]
      numTotalItems?: number
    }>(url)
    const items = (body.socialPosts ?? []).map((raw) => mapPost(raw as never, this.endpoint))
    let nextCursor = nextUrl
    if (!nextCursor && items.length > 0) {
      const next = new URL(url)
      const skip = Number(next.searchParams.get('skip') ?? '0') + items.length
      if (body.numTotalItems === undefined || skip < body.numTotalItems) {
        next.searchParams.set('skip', String(skip))
        nextCursor = next.toString()
      }
    }
    return { items, nextCursor }
  }

  /**
   * Personalized "following" activity feed — the real huggingface.co home feed.
   * Requires a signed-in token (it's account-specific). Paginates by an opaque
   * cursor plus an advancing skip; `cursor` in the return is the next-page URL.
   */
  async getRecentActivity(cursor?: string): Promise<ActivityFeed> {
    const url =
      cursor ?? `${this.endpoint}/api/recent-activity?limit=30&feedType=following&activityType=all`
    const { body } = await this.getJson<{ recentActivity?: unknown[]; cursor?: string }>(url)
    const feed = mapActivityFeed(body as never, this.endpoint)
    let nextCursor: string | undefined
    if (feed.cursor && (body.recentActivity?.length ?? 0) > 0) {
      const next = new URL(url)
      const skip = Number(next.searchParams.get('skip') ?? '0') + (body.recentActivity?.length ?? 0)
      next.searchParams.set('skip', String(skip))
      next.searchParams.set('cursor', feed.cursor)
      nextCursor = next.toString()
    }
    return { items: feed.items, cursor: nextCursor }
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
    await this.sendJson(
      'POST',
      `${this.endpoint}/api/${API_PATH[kind]}/${repoId}/discussions/${num}/comment`,
      { comment }
    )
  }

  async whoAmI(): Promise<UserProfile> {
    const { body } = await this.getJson<unknown>(`${this.endpoint}/api/whoami-v2`, { ttl: 0 })
    return mapWhoAmI(body as never)
  }

  /**
   * whoAmI with an explicit bearer token, for validating a pasted User Access
   * Token before it becomes the session. Deliberately OUT OF BAND: it skips
   * the response cache and the in-flight dedup (which key on URL, so a regular
   * whoAmI here could join the CURRENT session token's request and "validate"
   * the candidate against someone else's response), skips the request-slot
   * queue (validation must not starve behind stalled browsing requests), and
   * carries its own deadline — a Hub that never answers must fail the sign-in,
   * not spin it forever.
   */
  async whoAmIWithToken(token: string, opts: { timeoutMs?: number } = {}): Promise<WhoAmIDetailed> {
    const url = `${this.endpoint}/api/whoami-v2`
    const headers: Record<string, string> = { 'User-Agent': this.userAgent }
    if (this.allowsAuth(url)) headers.Authorization = `Bearer ${token}`
    const res = await this.fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000)
    })
    if (!res.ok) {
      void res.body?.cancel().catch(() => undefined)
      this.throwHttpError(res, url)
    }
    return mapWhoAmIAuth((await res.json()) as never)
  }

  /** Paged notification inbox (20/page on the Hub; `p` is zero-based). */
  async getNotifications(page = 0): Promise<NotificationsPage> {
    const url = new URL(`${this.endpoint}/api/notifications`)
    if (page > 0) url.searchParams.set('p', String(page))
    const { body } = await this.getJson<unknown>(url.toString(), { ttl: 10_000 })
    return mapNotificationsPage(body as never, this.endpoint)
  }

  /** Marks discussions read/unread; an empty id list applies to all notifications. */
  async markNotificationsRead(discussionIds: string[], read: boolean): Promise<void> {
    const all = discussionIds.length === 0
    const url = `${this.endpoint}/api/notifications/mark-as-read${all ? '?applyToAll=true' : ''}`
    await this.sendJson('POST', url, all ? { read } : { discussionIds, read })
  }

  /** Deletes all notifications (the API only accepts explicit ids or applyToAll). */
  async clearNotifications(): Promise<void> {
    await this.sendJson('DELETE', `${this.endpoint}/api/notifications?applyToAll=true`)
  }

  /** List repos for an author, used by the follow poller. */
  async listByAuthor(kind: RepoKind, author: string, limit = 20): Promise<RepoSummary[]> {
    const page = await this.searchRepos({ kind, author, sort: 'updated', limit })
    return page.items
  }

  /** Fetch a text file (size-capped) for in-app preview. Throws on binary content. */
  async getFileText(
    kind: RepoKind,
    repoId: string,
    path: string,
    revision = 'main',
    maxBytes = 512 * 1024
  ): Promise<FileTextResult> {
    const url = this.resolveUrl(kind, repoId, revision, path)
    const res = await this.fetchWithPolicy(url, {
      headers: {
        ...this.headers(url),
        Range: `bytes=0-${maxBytes - 1}`,
        // Byte ranges are only meaningful without transfer compression.
        'Accept-Encoding': 'identity'
      }
    })
    if (res.status !== 200 && res.status !== 206) this.throwHttpError(res, url)
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.includes(0)) throw new HubApiError('binary file', undefined, url)
    const size = totalSizeFrom(res, bytes.byteLength)
    return {
      content: new TextDecoder().decode(bytes),
      truncated: size > bytes.byteLength,
      size
    }
  }

  /** Parse the safetensors JSON header via ranged requests (never downloads tensors). */
  async getSafetensorsHeader(
    kind: RepoKind,
    repoId: string,
    path: string,
    revision = 'main'
  ): Promise<SafetensorsHeader> {
    const url = this.resolveUrl(kind, repoId, revision, path)
    const lenBytes = await this.fetchRange(url, 0, 7)
    if (lenBytes.byteLength < 8) {
      throw new HubApiError('safetensors: file too short for a header', undefined, url)
    }
    // First 8 bytes are the little-endian u64 length of the JSON header.
    const headerLen = new DataView(lenBytes.buffer, lenBytes.byteOffset, 8).getBigUint64(0, true)
    if (headerLen <= 0n || headerLen > BigInt(SAFETENSORS_MAX_HEADER_BYTES)) {
      throw new HubApiError(`safetensors: implausible header length ${headerLen}`, undefined, url)
    }
    const len = Number(headerLen)
    const jsonBytes = await this.fetchRange(url, 8, 8 + len - 1)
    const parsed = JSON.parse(new TextDecoder().decode(jsonBytes)) as Record<string, unknown>
    let metadata: Record<string, string> | undefined
    const tensors: SafetensorsTensor[] = []
    let totalParams = 0
    for (const [name, value] of Object.entries(parsed)) {
      if (name === '__metadata__') {
        metadata = value as Record<string, string>
        continue
      }
      const entry = value as { dtype?: string; shape?: unknown }
      const shape = Array.isArray(entry.shape)
        ? entry.shape.filter((dim): dim is number => typeof dim === 'number')
        : []
      tensors.push({ name, dtype: entry.dtype ?? '', shape })
      // A scalar (empty shape) holds one element.
      totalParams += shape.reduce((acc, dim) => acc * dim, 1)
    }
    tensors.sort((a, b) => a.name.localeCompare(b.name))
    return { tensors, metadata, totalParams }
  }

  /** Dataset viewer config/split list via the datasets-server API. */
  async getDatasetSplits(repoId: string): Promise<DatasetSplit[]> {
    const url = `${DATASETS_SERVER}/splits?dataset=${encodeURIComponent(repoId)}`
    const { body } = await this.getJson<{ splits?: Array<{ config?: string; split?: string }> }>(
      url
    )
    return (body.splits ?? []).map((s) => ({ config: s.config ?? '', split: s.split ?? '' }))
  }

  /** Paged dataset rows via the datasets-server API. */
  async getDatasetRows(
    repoId: string,
    config: string,
    split: string,
    offset = 0,
    length = 20
  ): Promise<DatasetRows> {
    const url = new URL(`${DATASETS_SERVER}/rows`)
    url.searchParams.set('dataset', repoId)
    url.searchParams.set('config', config)
    url.searchParams.set('split', split)
    url.searchParams.set('offset', String(offset))
    url.searchParams.set('length', String(length))
    const { body } = await this.getJson<{
      features?: Array<{ name?: string }>
      rows?: Array<{ row?: Record<string, unknown> }>
      num_rows_total?: number
    }>(url.toString())
    const columns = (body.features ?? []).map((f) => f.name ?? '')
    const rows = (body.rows ?? []).map((r) => {
      const record = r.row ?? {}
      return columns.map((col) => formatCell(record[col]))
    })
    return { columns, rows, total: body.num_rows_total }
  }

  /**
   * Single post lookup. The direct /api/posts/{author}/{slug} endpoint errors,
   * so filter the feed by slug and match the author case-insensitively.
   */
  async getPostDetail(author: string, slug: string): Promise<PostSummary> {
    const url = `${this.endpoint}/api/posts?slug=${encodeURIComponent(slug)}`
    const { body } = await this.getJson<{ socialPosts?: unknown[] }>(url, { ttl: 60_000 })
    const wanted = author.toLowerCase()
    const post = (body.socialPosts ?? [])
      .map((raw) => mapPost(raw as never, this.endpoint))
      .find((p) => p.slug === slug && p.author.toLowerCase() === wanted)
    if (!post) throw new HubApiError('post not found', 404, url)
    return post
  }

  /**
   * Public profile overview. Users and orgs share one namespace on the Hub but
   * live on different endpoints, so a 404 on /users falls back to /organizations
   * (org payloads carry `name` instead of `user`; both are handled by the mapper).
   */
  async getUserOverview(username: string): Promise<UserOverview> {
    const encoded = encodeURIComponent(username)
    try {
      const { body } = await this.getJson<unknown>(`${this.endpoint}/api/users/${encoded}/overview`)
      return mapUserOverview(body as never, this.endpoint)
    } catch (err) {
      if (!isNotFound(err)) throw err
      const { body } = await this.getJson<unknown>(
        `${this.endpoint}/api/organizations/${encoded}/overview`
      )
      return mapUserOverview(body as never, this.endpoint, true)
    }
  }

  /**
   * Organization members. The Hub returns the full list in one shot (no Link
   * pagination); we cap at 40 for the profile avatar strip.
   */
  async getOrgMembers(org: string, limit = 40): Promise<FollowedAccount[]> {
    const url = `${this.endpoint}/api/organizations/${encodeURIComponent(org)}/members`
    const { body } = await this.getJson<
      Array<{ user?: string; fullname?: string; avatarUrl?: string; type?: string }>
    >(url, { ttl: 5 * 60_000 })
    return body
      .filter((m) => m.user)
      .slice(0, limit)
      .map((m) => ({
        name: m.user ?? '',
        fullname: m.fullname,
        avatarUrl: m.avatarUrl ? new URL(m.avatarUrl, this.endpoint).toString() : undefined,
        isOrg: m.type === 'org'
      }))
  }

  /**
   * Accounts a user follows on the Hub. Live-verified: paginated via Link header
   * (500/page); drained up to 4 pages (2000 accounts) to bound the fan-out.
   */
  async getUserFollowing(username: string): Promise<FollowedAccount[]> {
    let url: string | undefined =
      `${this.endpoint}/api/users/${encodeURIComponent(username)}/following`
    const all: FollowedAccount[] = []
    let pages = 0
    while (url && pages < 4) {
      const page: {
        body: Array<{ user?: string; fullname?: string; avatarUrl?: string; type?: string }>
        nextUrl?: string
      } = await this.getJson(url, { ttl: 5 * 60_000 })
      for (const raw of page.body) {
        if (!raw.user) continue
        all.push({
          name: raw.user,
          fullname: raw.fullname,
          avatarUrl: raw.avatarUrl ? new URL(raw.avatarUrl, this.endpoint).toString() : undefined,
          isOrg: raw.type === 'org'
        })
      }
      url = page.nextUrl
      pages++
    }
    return all
  }

  /** User/org lookup for @mention autocompletion. Failures degrade to an empty list. */
  async searchUsers(query: string): Promise<UserSearchResult[]> {
    const url = new URL(`${this.endpoint}/api/quicksearch`)
    url.searchParams.set('q', query)
    url.searchParams.set('type', 'user')
    try {
      const { body } = await this.getJson<{
        users?: Array<{ user?: string; fullname?: string; avatarUrl?: string }>
      }>(url.toString(), { ttl: 60_000 })
      return (body.users ?? [])
        .filter((u) => u.user)
        .slice(0, 8)
        .map((u) => ({
          name: u.user ?? '',
          fullname: u.fullname,
          avatarUrl: u.avatarUrl ? new URL(u.avatarUrl, this.endpoint).toString() : undefined
        }))
    } catch {
      return []
    }
  }

  /** Org lookup for command palette / search-all. Failures degrade to []. */
  async searchOrgs(query: string): Promise<OrgSearchResult[]> {
    const url = new URL(`${this.endpoint}/api/quicksearch`)
    url.searchParams.set('q', query)
    url.searchParams.set('type', 'org')
    try {
      const { body } = await this.getJson<{
        orgs?: Array<{ name?: string; fullname?: string; avatarUrl?: string }>
      }>(url.toString(), { ttl: 60_000 })
      return (body.orgs ?? [])
        .filter((o) => o.name)
        .slice(0, 8)
        .map((o) => ({
          name: o.name ?? '',
          fullname: o.fullname,
          avatarUrl: o.avatarUrl ? new URL(o.avatarUrl, this.endpoint).toString() : undefined
        }))
    } catch {
      return []
    }
  }

  /** Paper lookup for command palette / search-all. Failures degrade to []. */
  async searchPapers(query: string): Promise<PaperSearchResult[]> {
    const url = new URL(`${this.endpoint}/api/quicksearch`)
    url.searchParams.set('q', query)
    url.searchParams.set('type', 'paper')
    try {
      const { body } = await this.getJson<{
        papers?: Array<{ _id?: string; id?: string }>
      }>(url.toString(), { ttl: 60_000 })
      return (body.papers ?? [])
        .filter((p) => p._id && p.id)
        .slice(0, 8)
        .map((p) => ({ id: p._id ?? '', title: p.id ?? '' }))
    } catch {
      return []
    }
  }

  /** Collection lookup for command palette / search-all. Failures degrade to []. */
  async searchCollections(query: string): Promise<CollectionSearchResult[]> {
    const url = new URL(`${this.endpoint}/api/quicksearch`)
    url.searchParams.set('q', query)
    url.searchParams.set('type', 'collection')
    try {
      const { body } = await this.getJson<{
        collections?: Array<{ _id?: string; title?: string; description?: string }>
      }>(url.toString(), { ttl: 60_000 })
      return (body.collections ?? [])
        .filter((c) => c._id && c.title)
        .slice(0, 8)
        .map((c) => ({
          slug: c._id ?? '',
          title: c.title ?? '',
          description: c.description
        }))
    } catch {
      return []
    }
  }

  /**
   * True when at least one inference provider serves the model (or the classic
   * Inference API reports it warm). Errors degrade to false so UI simply hides
   * the playground.
   */
  async isInferenceAvailable(repoId: string): Promise<boolean> {
    const url = new URL(`${this.endpoint}/api/models/${repoId}`)
    url.searchParams.append('expand[]', 'inference')
    url.searchParams.append('expand[]', 'inferenceProviderMapping')
    try {
      const { body } = await this.getJson<{
        inference?: string
        inferenceProviderMapping?: Record<string, unknown> | unknown[]
      }>(url.toString(), { ttl: 10 * 60_000 })
      const mapping = body.inferenceProviderMapping
      const providers = Array.isArray(mapping)
        ? mapping.length
        : mapping
          ? Object.keys(mapping).length
          : 0
      return providers > 0 || body.inference === 'warm'
    } catch {
      return false
    }
  }

  /** Collections owned by a user or org. */
  async listCollections(owner: string): Promise<CollectionSummary[]> {
    const url = new URL(`${this.endpoint}/api/collections`)
    url.searchParams.set('owner', owner)
    url.searchParams.set('limit', '100')
    const { body } = await this.getJson<unknown[]>(url.toString())
    return body.map((raw) => mapCollectionSummary(raw as never))
  }

  /** Full collection with items. The slug is "owner/title-slug-<24hex>". */
  async getCollection(slug: string): Promise<CollectionDetail> {
    const { body } = await this.getJson<unknown>(`${this.endpoint}/api/collections/${slug}`)
    return mapCollectionDetail(body as never)
  }

  async createCollection(input: {
    namespace: string
    title: string
    description?: string
    private: boolean
  }): Promise<CollectionDetail> {
    const res = await this.sendJson('POST', `${this.endpoint}/api/collections`, {
      title: input.title,
      namespace: input.namespace,
      description: input.description,
      private: input.private
    })
    return mapCollectionDetail((await res.json()) as never)
  }

  async updateCollection(
    slug: string,
    patch: {
      title?: string
      description?: string
      private?: boolean
      position?: number
      theme?: string
    }
  ): Promise<void> {
    await this.sendJson('PATCH', `${this.endpoint}/api/collections/${slug}`, patch)
  }

  async deleteCollection(slug: string): Promise<void> {
    await this.sendJson('DELETE', `${this.endpoint}/api/collections/${slug}`)
  }

  async addCollectionItem(
    slug: string,
    item: { type: 'model' | 'dataset' | 'space' | 'paper'; id: string },
    note?: string
  ): Promise<void> {
    await this.sendJson('POST', `${this.endpoint}/api/collections/${slug}/items`, { item, note })
  }

  async updateCollectionItem(
    slug: string,
    itemId: string,
    patch: { note?: string; position?: number }
  ): Promise<void> {
    await this.sendJson(
      'PATCH',
      `${this.endpoint}/api/collections/${slug}/items/${encodeURIComponent(itemId)}`,
      patch
    )
  }

  async removeCollectionItem(slug: string, itemId: string): Promise<void> {
    await this.sendJson(
      'DELETE',
      `${this.endpoint}/api/collections/${slug}/items/${encodeURIComponent(itemId)}`
    )
  }

  /**
   * Watch/unwatch users and orgs by their 24-hex internal id. Returns the
   * resulting watch list from the response body.
   *
   * Live-verified 2026-07-11: token-based ADD and DELETE of real user/org
   * targets both return HTTP 200 but are SILENTLY IGNORED (list unchanged).
   * Only a browser cookie session can mutate watches. Callers must check the
   * returned list. Do not send add and delete in the same call: the endpoint
   * 400s when both are non-empty. An empty add+delete also 400s.
   */
  async updateWatch(changes: {
    add?: WatchTarget[]
    delete?: WatchTarget[]
  }): Promise<WatchedEntry[]> {
    const res = await this.sendJson('PATCH', `${this.endpoint}/api/settings/watch`, {
      add: changes.add ?? [],
      delete: changes.delete ?? []
    })
    const body = (await res.json().catch(() => ({}))) as {
      watched?: Array<{ _id?: string; id?: string; name?: string; type?: string }>
    }
    return (body.watched ?? []).map((w) => ({
      internalId: w._id,
      name: w.name ?? w.id ?? '',
      type: w.type === 'org' ? ('org' as const) : ('user' as const)
    }))
  }

  /**
   * Current Hub watch list. There is no GET endpoint; a no-op DELETE of a
   * nonexistent id returns 200 with the full list (live-verified 2026-07-11).
   */
  async listWatched(): Promise<WatchedEntry[]> {
    return this.updateWatch({ delete: [{ id: '0'.repeat(24), type: 'user' }] })
  }

  /**
   * Attempt to watch/unwatch and report whether the Hub actually applied it.
   * Token sessions typically get `applied: false` — callers should fall back
   * to the website Watch control.
   */
  async setWatch(
    target: WatchTarget,
    watching: boolean
  ): Promise<{ applied: boolean; watched: WatchedEntry[] }> {
    const watched = await this.updateWatch(
      watching ? { add: [target] } : { delete: [target] }
    )
    const present = watched.some((w) => w.internalId === target.id)
    return { applied: present === watching, watched }
  }

  /** Repos the signed-in user administers, with storage usage. */
  async listMyRepos(): Promise<MyRepoEntry[]> {
    const { body } = await this.getJson<unknown[]>(`${this.endpoint}/api/settings/repositories`, {
      ttl: 10_000
    })
    return mapMyRepos(body as never[])
  }

  async updateRepoSettings(
    kind: RepoKind,
    repoId: string,
    patch: { private?: boolean; gated?: false | 'auto' | 'manual'; discussionsDisabled?: boolean }
  ): Promise<void> {
    await this.sendJson('PUT', `${this.endpoint}/api/${API_PATH[kind]}/${repoId}/settings`, patch)
  }

  async moveRepo(kind: RepoKind, fromRepo: string, toRepo: string): Promise<void> {
    await this.sendJson('POST', `${this.endpoint}/api/repos/move`, {
      fromRepo,
      toRepo,
      type: kind
    })
  }

  /**
   * Not in the public OpenAPI spec; runtime-verified (the same call
   * huggingface_hub's delete_repo makes: name is the repo name, organization
   * the namespace).
   */
  async deleteRepo(kind: RepoKind, repoId: string): Promise<void> {
    const slash = repoId.indexOf('/')
    const body: Record<string, unknown> = {
      type: kind,
      name: slash === -1 ? repoId : repoId.slice(slash + 1)
    }
    if (slash !== -1) body.organization = repoId.slice(0, slash)
    await this.sendJson('DELETE', `${this.endpoint}/api/repos/delete`, body)
  }

  /** The Hub only defines /duplicate for Spaces (huggingface_hub's duplicate_space). */
  async duplicateSpace(
    repoId: string,
    toRepo: string,
    options: { private?: boolean } = {}
  ): Promise<{ url?: string }> {
    const res = await this.sendJson(
      'POST',
      `${this.endpoint}/api/spaces/${repoId}/duplicate`,
      { repository: toRepo, private: options.private }
    )
    const body = (await res.json()) as { url?: string }
    return { url: body.url }
  }

  async createBranch(
    kind: RepoKind,
    repoId: string,
    branch: string,
    startingPoint?: string
  ): Promise<void> {
    await this.sendJson(
      'POST',
      `${this.endpoint}/api/${API_PATH[kind]}/${repoId}/branch/${encodeURIComponent(branch)}`,
      startingPoint === undefined ? {} : { startingPoint }
    )
  }

  async deleteBranch(kind: RepoKind, repoId: string, branch: string): Promise<void> {
    await this.sendJson(
      'DELETE',
      `${this.endpoint}/api/${API_PATH[kind]}/${repoId}/branch/${encodeURIComponent(branch)}`
    )
  }

  /** The revision to tag is the path segment; the tag name travels in the body. */
  async createTag(
    kind: RepoKind,
    repoId: string,
    tag: string,
    revision = 'main',
    message?: string
  ): Promise<void> {
    await this.sendJson(
      'POST',
      `${this.endpoint}/api/${API_PATH[kind]}/${repoId}/tag/${encodeURIComponent(revision)}`,
      { tag, message }
    )
  }

  async deleteTag(kind: RepoKind, repoId: string, tag: string): Promise<void> {
    await this.sendJson(
      'DELETE',
      `${this.endpoint}/api/${API_PATH[kind]}/${repoId}/tag/${encodeURIComponent(tag)}`
    )
  }

  /** Access requests on a gated repo, filtered by status. */
  async listAccessRequests(
    kind: GatedRepoKind,
    repoId: string,
    status: 'pending' | 'accepted' | 'rejected'
  ): Promise<AccessRequest[]> {
    const url = `${this.endpoint}/api/${API_PATH[kind]}/${repoId}/user-access-request/${status}`
    const { body } = await this.getJson<unknown[]>(url, { ttl: 5_000 })
    return body.map((raw) => mapAccessRequest(raw as never, this.endpoint))
  }

  async handleAccessRequest(
    kind: GatedRepoKind,
    repoId: string,
    user: string,
    status: 'accepted' | 'rejected' | 'pending',
    rejectionReason?: string
  ): Promise<void> {
    await this.sendJson(
      'POST',
      `${this.endpoint}/api/${API_PATH[kind]}/${repoId}/user-access-request/handle`,
      { user, status, rejectionReason }
    )
  }

  async grantAccess(kind: GatedRepoKind, repoId: string, user: string): Promise<void> {
    await this.sendJson(
      'POST',
      `${this.endpoint}/api/${API_PATH[kind]}/${repoId}/user-access-request/grant`,
      { user }
    )
  }

  async listSpaceSecrets(repoId: string): Promise<SpaceSecret[]> {
    const { body } = await this.getJson<unknown>(`${this.endpoint}/api/spaces/${repoId}/secrets`)
    return mapSpaceSecrets(body as never)
  }

  async setSpaceSecret(
    repoId: string,
    key: string,
    value: string,
    description?: string
  ): Promise<void> {
    await this.sendJson('POST', `${this.endpoint}/api/spaces/${repoId}/secrets`, {
      key,
      value,
      description
    })
  }

  async deleteSpaceSecret(repoId: string, key: string): Promise<void> {
    await this.sendJson('DELETE', `${this.endpoint}/api/spaces/${repoId}/secrets`, { key })
  }

  async listSpaceVariables(repoId: string): Promise<SpaceVariable[]> {
    const { body } = await this.getJson<unknown>(`${this.endpoint}/api/spaces/${repoId}/variables`)
    return mapSpaceVariables(body as never)
  }

  async setSpaceVariable(
    repoId: string,
    key: string,
    value: string,
    description?: string
  ): Promise<void> {
    await this.sendJson('POST', `${this.endpoint}/api/spaces/${repoId}/variables`, {
      key,
      value,
      description
    })
  }

  async deleteSpaceVariable(repoId: string, key: string): Promise<void> {
    await this.sendJson('DELETE', `${this.endpoint}/api/spaces/${repoId}/variables`, { key })
  }

  /**
   * Bounded snapshot of the Space's SSE log stream: reads at most
   * SPACE_LOGS_MAX_BYTES or for SPACE_LOGS_WINDOW_MS, whichever comes first,
   * then returns the concatenated `data:` payload lines. Never hangs: every
   * read races the deadline, and a timeout before headers yields empty text.
   */
  async getSpaceLogsSnapshot(repoId: string, logType: 'build' | 'run'): Promise<{ text: string }> {
    const url = `${this.endpoint}/api/spaces/${repoId}/logs/${logType}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), SPACE_LOGS_WINDOW_MS)
    const deadline = new Promise<{ done: true; value: undefined }>((resolve) => {
      controller.signal.addEventListener('abort', () => resolve({ done: true, value: undefined }))
    })
    try {
      const res = await this.fetchWithPolicy(url, {
        headers: { ...this.headers(url), Accept: 'text/event-stream' },
        signal: controller.signal
      })
      if (!res.ok) this.throwHttpError(res, url)
      const reader = res.body?.getReader()
      if (!reader) return { text: '' }
      const decoder = new TextDecoder()
      let raw = ''
      let received = 0
      try {
        while (received < SPACE_LOGS_MAX_BYTES) {
          const chunk = await Promise.race([reader.read(), deadline])
          if (chunk.done || !chunk.value) break
          received += chunk.value.byteLength
          raw += decoder.decode(chunk.value, { stream: true })
        }
      } finally {
        void reader.cancel().catch(() => undefined)
      }
      raw += decoder.decode()
      return { text: sseDataText(raw) }
    } catch (err) {
      // Timed out before the headers arrived: an empty snapshot beats an error.
      if (controller.signal.aborted) return { text: '' }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  /** Not in the public OpenAPI spec; runtime-verified (used by huggingface_hub's restart_space). */
  async restartSpace(repoId: string, factory = false): Promise<void> {
    const suffix = factory ? '?factory=true' : ''
    await this.sendJson('POST', `${this.endpoint}/api/spaces/${repoId}/restart${suffix}`)
  }

  /** Not in the public OpenAPI spec; runtime-verified (used by huggingface_hub's like/unlike). */
  async setLike(kind: RepoKind, repoId: string, liked: boolean): Promise<void> {
    await this.sendJson(
      liked ? 'POST' : 'DELETE',
      `${this.endpoint}/api/${API_PATH[kind]}/${repoId}/like`
    )
  }

  /**
   * Social follow/unfollow for a user or org — the same action as the Follow
   * button on huggingface.co profile pages. Not in the public OpenAPI spec;
   * runtime-verified 2026-07-11 (401 without auth; distinct from watch).
   */
  async setFollow(username: string, following: boolean, isOrg = false): Promise<void> {
    const encoded = encodeURIComponent(username)
    const base = isOrg
      ? `${this.endpoint}/api/organizations/${encoded}/follow`
      : `${this.endpoint}/api/users/${encoded}/follow`
    await this.sendJson(following ? 'POST' : 'DELETE', base)
  }

  /** Repos a user has liked. Entries are minimal ({name, type}); buckets/kernels are dropped. */
  async getUserLikes(username: string): Promise<RepoSummary[]> {
    const url = `${this.endpoint}/api/users/${encodeURIComponent(username)}/likes?limit=100`
    const { body } = await this.getJson<Array<{ repo?: { name?: string; type?: string } }>>(url)
    const items: RepoSummary[] = []
    for (const entry of body) {
      const repo = entry.repo
      const kind = repo?.type
      if (!repo?.name || (kind !== 'model' && kind !== 'dataset' && kind !== 'space')) continue
      items.push(mapRepoSummary({ ...repo, id: repo.name } as never, kind))
    }
    return items
  }

  /**
   * Community post comment. Live-verified 2026-07-11: Bearer access tokens
   * (classic write-role and fine-grained) get 401 "Invalid username or password"
   * — only a browser cookie session can post. Prefer linking out to the Hub UI;
   * this method remains for callers that somehow hold a cookie-backed client.
   */
  async commentOnPost(
    author: string,
    slug: string,
    comment: string,
    replyToCommentId?: string
  ): Promise<void> {
    const base = `${this.endpoint}/api/posts/${encodeURIComponent(author)}/${encodeURIComponent(slug)}`
    const url = replyToCommentId
      ? `${base}/comment/${encodeURIComponent(replyToCommentId)}/reply`
      : `${base}/comment`
    await this.sendJson('POST', url, { comment })
  }

  async commentOnPaper(
    paperId: string,
    comment: string,
    replyToCommentId?: string
  ): Promise<void> {
    const base = `${this.endpoint}/api/papers/${encodeURIComponent(paperId)}`
    const url = replyToCommentId
      ? `${base}/comment/${encodeURIComponent(replyToCommentId)}/reply`
      : `${base}/comment`
    await this.sendJson('POST', url, { comment })
  }

  async mergePullRequest(
    kind: RepoKind,
    repoId: string,
    num: number,
    comment?: string
  ): Promise<void> {
    await this.sendJson(
      'POST',
      `${this.endpoint}/api/${API_PATH[kind]}/${repoId}/discussions/${num}/merge`,
      { comment }
    )
  }

  async setDiscussionStatus(
    kind: RepoKind,
    repoId: string,
    num: number,
    status: 'open' | 'closed',
    comment?: string
  ): Promise<void> {
    await this.sendJson(
      'POST',
      `${this.endpoint}/api/${API_PATH[kind]}/${repoId}/discussions/${num}/status`,
      { status, comment }
    )
  }

  async setDiscussionTitle(
    kind: RepoKind,
    repoId: string,
    num: number,
    title: string
  ): Promise<void> {
    await this.sendJson(
      'POST',
      `${this.endpoint}/api/${API_PATH[kind]}/${repoId}/discussions/${num}/title`,
      { title }
    )
  }

  /** Current billing period usage for the signed-in user, flattened for display. */
  async getBillingUsage(): Promise<BillingUsage> {
    const { body } = await this.getJson<unknown>(`${this.endpoint}/api/settings/billing/usage`, {
      ttl: 60_000
    })
    return mapBillingUsage(body as never)
  }
}
