/** Maps raw Hub REST payloads into the shared domain types. */
import type {
  DiscussionDetail,
  DiscussionSummary,
  FileTreeEntry,
  PaperSummary,
  RepoDetail,
  RepoKind,
  RepoSummary,
  UserProfile
} from '@oh-my-huggingface/shared'

interface RawRepo {
  id?: string
  _id?: string
  modelId?: string
  author?: string
  likes?: number
  downloads?: number
  lastModified?: string
  createdAt?: string
  private?: boolean
  gated?: string | boolean
  tags?: string[]
  pipeline_tag?: string
  library_name?: string
  sdk?: string
  trendingScore?: number
  safetensors?: { total?: number }
  cardData?: Record<string, unknown>
  siblings?: Array<{ rfilename: string; size?: number }>
  sha?: string
  usedStorage?: number
  downloadsAllTime?: number
}

function splitRepoId(id: string): { author: string; name: string } {
  const slash = id.indexOf('/')
  if (slash === -1) return { author: '', name: id }
  return { author: id.slice(0, slash), name: id.slice(slash + 1) }
}

function licenseFromTags(tags: string[] | undefined): string | undefined {
  const tag = tags?.find((t) => t.startsWith('license:'))
  return tag?.slice('license:'.length)
}

export function mapRepoSummary(raw: RawRepo, kind: RepoKind): RepoSummary {
  const id = raw.id ?? raw.modelId ?? ''
  const { author, name } = splitRepoId(id)
  return {
    id,
    kind,
    author: raw.author ?? author,
    name,
    likes: raw.likes ?? 0,
    downloads: raw.downloads ?? 0,
    updatedAt: raw.lastModified,
    createdAt: raw.createdAt,
    private: raw.private ?? false,
    gated: raw.gated ?? false,
    tags: raw.tags ?? [],
    pipelineTag: raw.pipeline_tag,
    libraryName: raw.library_name,
    license: licenseFromTags(raw.tags),
    paramCount: raw.safetensors?.total,
    sdk: raw.sdk,
    trendingScore: raw.trendingScore
  }
}

export function mapRepoDetail(raw: RawRepo, kind: RepoKind): RepoDetail {
  return {
    ...mapRepoSummary(raw, kind),
    sha: raw.sha,
    lastModified: raw.lastModified,
    cardData: raw.cardData,
    siblings: raw.siblings,
    usedStorage: raw.usedStorage,
    downloadsAllTime: raw.downloadsAllTime
  }
}

interface RawTreeEntry {
  type: 'file' | 'directory'
  path: string
  size?: number
  oid?: string
  lfs?: { oid: string; size: number }
}

export function mapFileTree(raw: RawTreeEntry[]): FileTreeEntry[] {
  return raw.map((e) => ({
    type: e.type,
    path: e.path,
    size: e.lfs?.size ?? e.size ?? 0,
    oid: e.oid,
    lfs: e.lfs
  }))
}

interface RawDailyPaper {
  paper?: {
    id?: string
    title?: string
    summary?: string
    upvotes?: number
    publishedAt?: string
    authors?: Array<{ name?: string }>
    thumbnail?: string
    numComments?: number
  }
  title?: string
  publishedAt?: string
  thumbnail?: string
  numComments?: number
}

export function mapPaper(raw: RawDailyPaper): PaperSummary {
  const p = raw.paper ?? {}
  return {
    id: p.id ?? '',
    title: p.title ?? raw.title ?? '',
    summary: p.summary ?? '',
    publishedAt: p.publishedAt ?? raw.publishedAt,
    upvotes: p.upvotes ?? 0,
    authors: (p.authors ?? []).map((a) => a.name ?? '').filter(Boolean),
    thumbnail: p.thumbnail ?? raw.thumbnail,
    numComments: p.numComments ?? raw.numComments
  }
}

interface RawDiscussion {
  num?: number
  title?: string
  status?: string
  isPullRequest?: boolean
  author?: { name?: string }
  createdAt?: string
  numComments?: number
  events?: Array<{
    id?: string
    type?: string
    author?: { name?: string }
    createdAt?: string
    data?: { latest?: { raw?: string } }
  }>
}

export function mapDiscussionSummary(raw: RawDiscussion): DiscussionSummary {
  const status = raw.status
  return {
    num: raw.num ?? 0,
    title: raw.title ?? '',
    status: status === 'closed' || status === 'merged' || status === 'draft' ? status : 'open',
    isPullRequest: raw.isPullRequest ?? false,
    author: raw.author?.name,
    createdAt: raw.createdAt,
    numComments: raw.numComments
  }
}

export function mapDiscussionDetail(raw: RawDiscussion): DiscussionDetail {
  return {
    ...mapDiscussionSummary(raw),
    events: (raw.events ?? []).map((e, i) => ({
      id: e.id ?? String(i),
      type: e.type ?? 'comment',
      author: e.author?.name,
      createdAt: e.createdAt,
      content: e.data?.latest?.raw
    }))
  }
}

interface RawWhoAmI {
  name?: string
  fullname?: string
  email?: string
  avatarUrl?: string
  isPro?: boolean
  orgs?: Array<{ name?: string; fullname?: string; avatarUrl?: string }>
}

export function mapWhoAmI(raw: RawWhoAmI): UserProfile {
  return {
    name: raw.name ?? '',
    fullname: raw.fullname,
    email: raw.email,
    avatarUrl: raw.avatarUrl,
    isPro: raw.isPro,
    orgs: (raw.orgs ?? []).map((o) => ({
      name: o.name ?? '',
      fullname: o.fullname,
      avatarUrl: o.avatarUrl
    }))
  }
}
