/** Maps raw Hub REST payloads into the shared domain types. */
import type {
  DiscussionDetail,
  DiscussionSummary,
  FileTreeEntry,
  PaperSummary,
  PostSummary,
  RepoDetail,
  RepoKind,
  RepoSummary,
  UserOverview,
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
  runtime?: {
    stage?: string
    hardware?: { current?: string | null }
    domains?: Array<{ domain?: string }>
  }
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

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function mapRepoSummary(raw: RawRepo, kind: RepoKind): RepoSummary {
  const id = raw.id ?? raw.modelId ?? ''
  const { author, name } = splitRepoId(id)
  // Gallery card fields are Space-specific: models/datasets keep them undefined
  // even though their payloads may also carry a cardData object.
  const card = kind === 'space' ? raw.cardData : undefined
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
    trendingScore: raw.trendingScore,
    emoji: optionalString(card?.emoji),
    colorFrom: optionalString(card?.colorFrom),
    colorTo: optionalString(card?.colorTo),
    shortDescription: optionalString(card?.short_description),
    runtimeStage: kind === 'space' ? raw.runtime?.stage : undefined,
    hardware: kind === 'space' ? (raw.runtime?.hardware?.current ?? undefined) : undefined
  }
}

export function mapRepoDetail(raw: RawRepo, kind: RepoKind): RepoDetail {
  return {
    ...mapRepoSummary(raw, kind),
    sha: raw.sha,
    spaceDomain: kind === 'space' ? raw.runtime?.domains?.[0]?.domain : undefined,
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
  changes?: { base?: string }
  diffUrl?: string
  events?: Array<{
    id?: string
    type?: string
    author?: { name?: string }
    createdAt?: string
    data?: { latest?: { raw?: string }; status?: string; oid?: string; subject?: string }
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
    baseRef: raw.changes?.base,
    diffUrl: raw.diffUrl,
    events: (raw.events ?? []).map((e, i) => ({
      id: e.id ?? String(i),
      type: e.type ?? 'comment',
      author: e.author?.name,
      createdAt: e.createdAt,
      content: e.data?.latest?.raw,
      status: e.data?.status,
      oid: e.data?.oid,
      subject: e.data?.subject
    }))
  }
}

interface RawPost {
  slug?: string
  author?: { name?: string; fullname?: string; avatarUrl?: string }
  rawContent?: string
  publishedAt?: string
  numComments?: number
  reactions?: Array<{ reaction?: string; count?: number; users?: string[] }>
  /** Relative path like "/posts/<author>/<slug>". */
  url?: string
}

export function mapPost(raw: RawPost, endpoint: string): PostSummary {
  const absolutize = (u: string | undefined): string | undefined =>
    u ? new URL(u, endpoint).toString() : undefined
  const author = raw.author?.name ?? ''
  const slug = raw.slug ?? ''
  // Reaction items carry both a count and a users array; trust count first and
  // degrade to users.length, then to "one reaction per item".
  const numReactions = (raw.reactions ?? []).reduce((acc, r) => {
    if (typeof r?.count === 'number') return acc + r.count
    if (Array.isArray(r?.users)) return acc + r.users.length
    return acc + 1
  }, 0)
  return {
    slug,
    author,
    authorFullname: raw.author?.fullname,
    authorAvatarUrl: absolutize(raw.author?.avatarUrl),
    content: raw.rawContent ?? '',
    publishedAt: raw.publishedAt,
    numComments: raw.numComments,
    numReactions,
    url: absolutize(raw.url) ?? `${endpoint}/posts/${author}/${slug}`
  }
}

interface RawUserOverview {
  name?: string
  isFollowing?: boolean
  user?: string
  fullname?: string
  avatarUrl?: string
  isPro?: boolean
  /** Free-form bio text. */
  details?: string
  numModels?: number
  numDatasets?: number
  numSpaces?: number
  numPapers?: number
  numFollowers?: number
  numFollowing?: number
  numLikes?: number
  /** Org handle arrives under `name` or `user` depending on the payload. */
  orgs?: Array<{ name?: string; user?: string; fullname?: string; avatarUrl?: string }>
  createdAt?: string
}

export function mapUserOverview(
  raw: RawUserOverview,
  endpoint: string,
  isOrg = false
): UserOverview {
  const absolutize = (u: string | undefined): string | undefined =>
    u ? new URL(u, endpoint).toString() : undefined
  return {
    name: raw.user ?? raw.name ?? '',
    fullname: raw.fullname,
    avatarUrl: absolutize(raw.avatarUrl),
    bio: raw.details,
    isPro: raw.isPro,
    numModels: raw.numModels ?? 0,
    numDatasets: raw.numDatasets ?? 0,
    numSpaces: raw.numSpaces ?? 0,
    numPapers: raw.numPapers ?? 0,
    numFollowers: raw.numFollowers ?? 0,
    numFollowing: raw.numFollowing ?? 0,
    numLikes: raw.numLikes ?? 0,
    orgs: (raw.orgs ?? []).map((o) => ({
      name: o.name ?? o.user ?? '',
      fullname: o.fullname,
      avatarUrl: absolutize(o.avatarUrl)
    })),
    createdAt: raw.createdAt,
    isFollowing: raw.isFollowing,
    isOrg
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
