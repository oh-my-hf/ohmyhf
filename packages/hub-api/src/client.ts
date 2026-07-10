import type {
  DatasetRows,
  DatasetSplit,
  DiscussionDetail,
  DiscussionSummary,
  FileTextResult,
  FileTreeEntry,
  HubNotification,
  Page,
  PaperSummary,
  RepoDetail,
  RepoKind,
  RepoSummary,
  SafetensorsHeader,
  SafetensorsTensor,
  SearchQuery,
  UserProfile,
  UserSearchResult
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
  space: ['likes', 'lastModified', 'createdAt', 'tags', 'private', 'sdk', 'trendingScore']
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
    // Retry only on 429 (request was rejected); a 503 POST may have side effects.
    const res = await this.fetchWithPolicy(
      url,
      {
        method: 'POST',
        headers: { ...this.headers(url), 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment })
      },
      { retryStatuses: [429] }
    )
    if (!res.ok) {
      const detail = res.status === 429 ? ' (rate limited)' : ''
      throw new HubApiError(
        `POST ${url} failed: ${res.status} ${res.statusText}${detail}`,
        res.status,
        url
      )
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
}
