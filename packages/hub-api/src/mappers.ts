/** Maps raw Hub REST payloads into the shared domain types. */
import type {
  AccessRequest,
  ActivityDiscussion,
  ActivityFeed,
  ActivityItem,
  BillingUsage,
  CollectionDetail,
  CollectionItem,
  CollectionSummary,
  DiscussionDetail,
  DiscussionSummary,
  FileTreeEntry,
  HubNotification,
  HubOrgPlan,
  MyRepoEntry,
  NotificationsPage,
  PaperSummary,
  PostComment,
  PostReaction,
  PostSummary,
  RepoDetail,
  RepoKind,
  RepoSummary,
  SpaceSecret,
  SpaceVariable,
  UserOverview,
  UserProfile
} from '@oh-my-huggingface/shared'

/** Plural URL segment per repo kind (kept local: client.ts imports this module). */
const REPO_URL_SEGMENT: Record<RepoKind, string> = {
  model: 'models',
  dataset: 'datasets',
  space: 'spaces'
}

/** Narrows a raw repo `type` to the kinds the app supports (drops bucket/kernel). */
function asRepoKind(type: string | undefined): RepoKind | undefined {
  return type === 'model' || type === 'dataset' || type === 'space' ? type : undefined
}

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

/** Direct /api/papers/{id} responses are the bare paper object (no {paper} wrapper). */
export function mapPaperDetail(raw: NonNullable<RawDailyPaper['paper']>): PaperSummary {
  return mapPaper({ paper: raw })
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
    data?: {
      latest?: { raw?: string }
      status?: string
      oid?: string
      subject?: string
      /** Same {reaction, users, count} rows as posts (live-verified 2026-07-11). */
      reactions?: RawReaction[]
    }
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
      subject: e.data?.subject,
      reactions: normalizeReactions(e.data?.reactions)
    }))
  }
}

interface RawReaction {
  reaction?: string
  count?: number
  users?: string[]
}

/**
 * Normalize Hub reaction rows to {emoji, count, users}; keep only entries with
 * an emoji so a malformed row can't produce an unclickable ghost pill.
 */
function normalizeReactions(raw: RawReaction[] | undefined): PostReaction[] {
  return (raw ?? []).flatMap((r) => {
    const emoji = r?.reaction
    if (!emoji) return []
    const users = Array.isArray(r?.users)
      ? r.users.filter((u): u is string => typeof u === 'string')
      : []
    const count = typeof r?.count === 'number' ? r.count : users.length
    return [{ emoji, count, users }]
  })
}

interface RawPost {
  slug?: string
  author?: { name?: string; fullname?: string; avatarUrl?: string; isPro?: boolean }
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
  const reactions = normalizeReactions(raw.reactions)
  const numReactions = reactions.reduce((acc, r) => acc + (r.count || 1), 0)
  return {
    slug,
    author,
    authorFullname: raw.author?.fullname,
    authorAvatarUrl: absolutize(raw.author?.avatarUrl),
    authorIsPro: raw.author?.isPro,
    content: raw.rawContent ?? '',
    publishedAt: raw.publishedAt,
    numComments: raw.numComments,
    numReactions,
    reactions,
    url: absolutize(raw.url) ?? `${endpoint}/posts/${author}/${slug}`
  }
}

interface RawPostComment {
  id?: string
  type?: string
  author?: { name?: string; fullname?: string; avatarUrl?: string; isPro?: boolean }
  createdAt?: string
  data?: {
    hidden?: boolean
    hiddenReason?: string
    hiddenBy?: string
    latest?: { raw?: string }
    reactions?: RawReaction[]
  }
  /** The Hub threads replies one level deep, nested on the parent comment. */
  replies?: RawPostComment[]
}

/** Decode the HTML-attribute escaping the Hub applies to embedded JSON islands. */
function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/**
 * Comments on a community post, parsed from the post page HTML. The Hub has
 * no JSON endpoint for post comments — the thread ships inside the
 * SocialPost component's data-props attribute (live-verified 2026-07-11:
 * socialPost.comments carries the same event shape as discussion comments).
 * Returns [] when the island is missing (page shape drift degrades to an
 * empty thread, never a crash).
 */
export function parsePostComments(html: string, endpoint: string): PostComment[] {
  const match =
    /data-target="SocialPost"[^>]*data-props="([^"]*)"/.exec(html) ??
    /data-props="([^"]*)"[^>]*data-target="SocialPost"/.exec(html)
  if (!match) return []
  let comments: RawPostComment[]
  try {
    const props = JSON.parse(decodeHtmlAttribute(match[1]!)) as {
      socialPost?: { comments?: RawPostComment[] }
    }
    comments = props.socialPost?.comments ?? []
  } catch {
    return []
  }
  const absolutize = (u: string | undefined): string | undefined =>
    u ? new URL(u, endpoint).toString() : undefined
  const mapOne = (c: RawPostComment): PostComment[] => {
    if (c.type !== 'comment' || !c.id) return []
    const hidden = c.data?.hidden === true
    const replies = (c.replies ?? []).flatMap(mapOne)
    return [
      {
        id: c.id,
        author: c.author?.name ?? '',
        authorFullname: c.author?.fullname,
        authorAvatarUrl: absolutize(c.author?.avatarUrl),
        authorIsPro: c.author?.isPro,
        createdAt: c.createdAt,
        // The Hub withholds hidden content; keep the row so the UI can show
        // the "this comment has been hidden" placeholder.
        content: hidden ? '' : (c.data?.latest?.raw ?? ''),
        reactions: normalizeReactions(c.data?.reactions),
        ...(replies.length > 0 ? { replies } : {}),
        ...(hidden
          ? { hidden: true, hiddenReason: c.data?.hiddenReason, hiddenBy: c.data?.hiddenBy }
          : {})
      }
    ]
  }
  return comments.flatMap(mapOne)
}

interface RawUserOverview {
  _id?: string
  name?: string
  isFollowing?: boolean
  user?: string
  fullname?: string
  avatarUrl?: string
  isPro?: boolean
  /** Org paid plan (`team` / `enterprise` / `plus` / `academia`). */
  plan?: string
  /** Free-form bio text. */
  details?: string
  numModels?: number
  numDatasets?: number
  numSpaces?: number
  numPapers?: number
  numFollowers?: number
  numFollowing?: number
  /** Present on organization overviews (member count). */
  numUsers?: number
  numLikes?: number
  /** Org handle arrives under `name` or `user` depending on the payload. */
  orgs?: Array<{
    name?: string
    user?: string
    fullname?: string
    avatarUrl?: string
    plan?: string
  }>
  createdAt?: string
}

const HUB_ORG_PLANS = new Set(['team', 'enterprise', 'plus', 'academia'])

/** Normalize Hub `plan` strings; unknown values are dropped. */
export function mapHubOrgPlan(raw: string | undefined): HubOrgPlan | undefined {
  if (raw === undefined || raw === '') return undefined
  const plan = raw.toLowerCase()
  return HUB_ORG_PLANS.has(plan) ? (plan as HubOrgPlan) : undefined
}

export function mapUserOverview(
  raw: RawUserOverview,
  endpoint: string,
  isOrg = false
): UserOverview {
  const absolutize = (u: string | undefined): string | undefined =>
    u ? new URL(u, endpoint).toString() : undefined
  return {
    internalId: raw._id,
    name: raw.user ?? raw.name ?? '',
    fullname: raw.fullname,
    avatarUrl: absolutize(raw.avatarUrl),
    bio: raw.details,
    isPro: raw.isPro,
    plan: mapHubOrgPlan(raw.plan),
    numModels: raw.numModels ?? 0,
    numDatasets: raw.numDatasets ?? 0,
    numSpaces: raw.numSpaces ?? 0,
    numPapers: raw.numPapers ?? 0,
    numFollowers: raw.numFollowers ?? 0,
    numFollowing: raw.numFollowing ?? 0,
    numUsers: raw.numUsers,
    numLikes: raw.numLikes ?? 0,
    orgs: (raw.orgs ?? []).map((o) => ({
      name: o.name ?? o.user ?? '',
      fullname: o.fullname,
      avatarUrl: absolutize(o.avatarUrl),
      plan: mapHubOrgPlan(o.plan)
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
  orgs?: Array<{ name?: string; fullname?: string; avatarUrl?: string; plan?: string }>
  /**
   * Present when authenticating with a User Access Token; mirrors and proxy
   * endpoints may omit it entirely, so every field is optional.
   */
  auth?: {
    type?: string
    accessToken?: { displayName?: string; role?: string }
  }
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
      avatarUrl: o.avatarUrl,
      plan: mapHubOrgPlan(o.plan)
    }))
  }
}

export interface WhoAmIDetailed {
  user: UserProfile
  tokenDisplayName?: string
  tokenRole?: string
}

/** Like mapWhoAmI, plus the token identity block when the Hub reports one. */
export function mapWhoAmIAuth(raw: RawWhoAmI): WhoAmIDetailed {
  const accessToken = raw.auth?.accessToken
  return {
    user: mapWhoAmI(raw),
    tokenDisplayName: accessToken?.displayName || undefined,
    tokenRole: accessToken?.role || undefined
  }
}

/** Owner arrives as an expanded object; older payloads may carry a bare handle. */
interface RawCollectionOwner {
  name?: string
  user?: string
}

interface RawCollectionItem {
  _id?: string
  type?: string
  id?: string
  title?: string
  /** Routable slug carried by type:'collection' items (id is the internal 24-hex id). */
  slug?: string
  /** Notes are pre-rendered; the raw text is what the app edits and displays. */
  note?: { text?: string; html?: string }
  position?: number
  downloads?: number
  likes?: number
  upvotes?: number
  emoji?: string
}

interface RawCollection {
  slug?: string
  title?: string
  description?: string
  owner?: RawCollectionOwner | string
  private?: boolean
  theme?: string
  upvotes?: number
  /** Detail responses only; reflects the authenticated caller. */
  isUpvotedByUser?: boolean
  lastUpdated?: string
  numberItems?: number
  items?: RawCollectionItem[]
}

export function mapCollectionSummary(raw: RawCollection): CollectionSummary {
  const owner = typeof raw.owner === 'string' ? raw.owner : (raw.owner?.name ?? raw.owner?.user)
  return {
    slug: raw.slug ?? '',
    title: raw.title ?? '',
    description: raw.description,
    owner: owner ?? '',
    private: raw.private ?? false,
    theme: raw.theme,
    // List payloads embed a (possibly truncated) items array instead of a count.
    itemCount: raw.numberItems ?? raw.items?.length,
    upvotes: raw.upvotes,
    isUpvoted: raw.isUpvotedByUser,
    updatedAt: raw.lastUpdated
  }
}

const COLLECTION_ITEM_TYPES: ReadonlySet<string> = new Set([
  'model',
  'dataset',
  'space',
  'paper',
  'collection'
])

/** Returns undefined for item types the app does not display (e.g. buckets). */
function mapCollectionItem(raw: RawCollectionItem): CollectionItem | undefined {
  if (!raw.type || !COLLECTION_ITEM_TYPES.has(raw.type)) return undefined
  return {
    itemId: raw._id ?? '',
    type: raw.type as CollectionItem['type'],
    id: raw.id ?? '',
    title: raw.title ?? raw.id,
    slug: raw.slug,
    note: raw.note?.text,
    position: raw.position,
    downloads: raw.downloads,
    // Papers and nested collections report upvotes instead of likes.
    likes: raw.likes ?? raw.upvotes,
    emoji: raw.emoji
  }
}

export function mapCollectionDetail(raw: RawCollection): CollectionDetail {
  return {
    ...mapCollectionSummary(raw),
    items: (raw.items ?? [])
      .map(mapCollectionItem)
      .filter((item): item is CollectionItem => item !== undefined)
  }
}

interface RawNotificationParticipant {
  user?: string
  avatar?: string
}

/** Discriminated by `type`; unknown variants degrade to kind 'other'. */
interface RawNotification {
  type?: string
  read?: boolean
  updatedAt?: string
  repo?: { name?: string; type?: string }
  discussion?: {
    num?: number
    title?: string
    status?: string
    id?: string
    isPullRequest?: boolean
    participating?: RawNotificationParticipant[]
  }
  paper?: { _id?: string; title?: string }
  paperDiscussion?: { id?: string; participating?: RawNotificationParticipant[] }
  post?: {
    id?: string
    slug?: string
    authorName?: string
    title?: string
    participating?: RawNotificationParticipant[]
  }
  blog?: { id?: string; title?: string; participating?: RawNotificationParticipant[] }
}

export function mapNotification(raw: RawNotification, endpoint: string): HubNotification {
  const absolutize = (u: string | undefined): string | undefined =>
    u ? new URL(u, endpoint).toString() : undefined
  const participants = (
    list: RawNotificationParticipant[] | undefined
  ): HubNotification['participants'] =>
    (list ?? [])
      .filter((p) => p.user)
      .map((p) => ({ user: p.user ?? '', avatar: absolutize(p.avatar) }))
  const base = { read: raw.read ?? false, updatedAt: raw.updatedAt }
  if (raw.type === 'repo' && raw.repo) {
    const repoKind = asRepoKind(raw.repo.type)
    const num = raw.discussion?.num
    const status = raw.discussion?.status
    return {
      ...base,
      kind: 'repo',
      title: raw.discussion?.title ?? raw.repo.name ?? '',
      discussionId: raw.discussion?.id,
      repoId: raw.repo.name,
      repoKind,
      discussionNum: num,
      discussionStatus:
        status === 'draft' || status === 'open' || status === 'closed' || status === 'merged'
          ? status
          : undefined,
      isPullRequest: raw.discussion?.isPullRequest,
      participants: participants(raw.discussion?.participating),
      route:
        repoKind && raw.repo.name && num !== undefined
          ? `/${REPO_URL_SEGMENT[repoKind]}/${raw.repo.name}/discussions/${num}`
          : undefined
    }
  }
  if (raw.type === 'paper' && raw.paper) {
    return {
      ...base,
      kind: 'paper',
      title: raw.paper.title ?? '',
      discussionId: raw.paperDiscussion?.id,
      participants: participants(raw.paperDiscussion?.participating),
      route: raw.paper._id ? `/papers/${raw.paper._id}` : undefined
    }
  }
  if (raw.type === 'post' && raw.post) {
    return {
      ...base,
      kind: 'post',
      title: raw.post.title ?? '',
      discussionId: raw.post.id,
      participants: participants(raw.post.participating),
      route:
        raw.post.authorName && raw.post.slug
          ? `/posts/${raw.post.authorName}/${raw.post.slug}`
          : undefined
    }
  }
  // Unknown variants (community_blog, org invites, …) still render as inbox rows.
  return {
    ...base,
    kind: 'other',
    title: raw.blog?.title ?? '',
    discussionId: raw.blog?.id,
    participants: participants(raw.blog?.participating)
  }
}

interface RawNotificationsPage {
  notifications?: RawNotification[]
  count?: { view?: number; unread?: number; all?: number }
}

export function mapNotificationsPage(raw: RawNotificationsPage, endpoint: string): NotificationsPage {
  const items = (raw.notifications ?? []).map((n) => mapNotification(n, endpoint))
  // `view` counts the entries matching the current filters; `all` is the fallback.
  return { count: raw.count?.view ?? raw.count?.all ?? items.length, items }
}

interface RawMyRepo {
  id?: string
  type?: string
  updatedAt?: string
  visibility?: string
  storage?: number
  storagePercent?: number
}

/** Keeps model/dataset/space entries only; buckets and kernels are dropped. */
export function mapMyRepos(raw: RawMyRepo[]): MyRepoEntry[] {
  const entries: MyRepoEntry[] = []
  for (const r of raw) {
    const kind = asRepoKind(r.type)
    if (!kind || !r.id) continue
    entries.push({
      id: r.id,
      kind,
      visibility: r.visibility === 'private' || r.visibility === 'protected' ? r.visibility : 'public',
      updatedAt: r.updatedAt ?? '',
      storage: r.storage ?? 0,
      storagePercent: r.storagePercent ?? 0
    })
  }
  return entries
}

interface RawAccessRequest {
  /** The requesting user's handle arrives under `user.user`. */
  user?: { user?: string; fullname?: string; avatarUrl?: string }
  timestamp?: string
  fields?: Record<string, string>
}

export function mapAccessRequest(raw: RawAccessRequest, endpoint: string): AccessRequest {
  return {
    user: {
      name: raw.user?.user ?? '',
      fullname: raw.user?.fullname,
      avatarUrl: raw.user?.avatarUrl ? new URL(raw.user.avatarUrl, endpoint).toString() : undefined
    },
    timestamp: raw.timestamp,
    fields: raw.fields
  }
}

interface RawSpaceEnvEntry {
  key?: string
  value?: string
  description?: string
  updatedAt?: string
}

/** The secrets endpoint returns an object map keyed by secret key. */
export function mapSpaceSecrets(raw: Record<string, RawSpaceEnvEntry>): SpaceSecret[] {
  return Object.entries(raw ?? {}).map(([key, entry]) => ({
    key: entry?.key ?? key,
    description: entry?.description,
    updatedAt: entry?.updatedAt
  }))
}

/** The variables endpoint returns an object map keyed by variable key. */
export function mapSpaceVariables(raw: Record<string, RawSpaceEnvEntry>): SpaceVariable[] {
  return Object.entries(raw ?? {}).map(([key, entry]) => ({
    key: entry?.key ?? key,
    value: entry?.value,
    description: entry?.description,
    updatedAt: entry?.updatedAt
  }))
}

interface RawBillingUsageItem {
  label?: string | null
  product?: string
  productPrettyName?: string
  quantity?: number
  unitLabel?: string
  totalCostMicroUSD?: number
}

interface RawBillingUsage {
  period?: { periodStart?: string; periodEnd?: string }
  usage?: Record<string, RawBillingUsageItem[] | undefined>
}

/** Tolerant of shape drift: flattens the per-product usage map into display rows. */
export function mapBillingUsage(raw: RawBillingUsage): BillingUsage {
  const rows: BillingUsage['rows'] = []
  for (const [group, items] of Object.entries(raw.usage ?? {})) {
    if (!Array.isArray(items)) continue
    for (const item of items) {
      const detailParts: string[] = []
      if (item.label && item.productPrettyName) detailParts.push(item.productPrettyName)
      if (typeof item.quantity === 'number' && item.unitLabel) {
        detailParts.push(`${item.quantity} ${item.unitLabel}`)
      }
      rows.push({
        label: item.label ?? item.productPrettyName ?? item.product ?? group,
        detail: detailParts.length > 0 ? detailParts.join(' · ') : undefined,
        // The API reports micro-USD; the UI displays cents (1 cent = 10,000 µUSD).
        amountCents:
          typeof item.totalCostMicroUSD === 'number'
            ? Math.round(item.totalCostMicroUSD / 10_000)
            : undefined
      })
    }
  }
  return { periodStart: raw.period?.periodStart, periodEnd: raw.period?.periodEnd, rows }
}

interface RawActivityRepo {
  id?: string
  author?: string
  repoType?: RepoKind
  likes?: number
  downloads?: number
  private?: boolean
  gated?: string | boolean
  lastModified?: string
}

interface RawActivityItem {
  time?: string
  user?: string
  userAvatarUrl?: string
  orgAvatarUrl?: string
  isPro?: boolean
  type?: string
  repoData?: RawActivityRepo
  repoId?: string
  repoType?: RepoKind
  socialPost?: unknown
  discussionData?: {
    num?: number
    title?: string
    status?: string
    isPullRequest?: boolean
    numComments?: number
  }
}

function mapActivityRepo(raw: RawActivityRepo, repoType: RepoKind): RepoSummary {
  const id = raw.id ?? ''
  const slash = id.indexOf('/')
  return {
    id,
    kind: raw.repoType ?? repoType,
    author: raw.author ?? (slash >= 0 ? id.slice(0, slash) : id),
    name: slash >= 0 ? id.slice(slash + 1) : id,
    likes: raw.likes ?? 0,
    downloads: raw.downloads ?? 0,
    updatedAt: raw.lastModified,
    private: raw.private ?? false,
    gated: raw.gated ?? false,
    tags: []
  }
}

/**
 * Personalized following feed (`/api/recent-activity`). Maps the actor + verb +
 * target for the kinds the app renders (repo like/update/publish, social posts,
 * discussions); silently drops collection/upvote/paper-daily items for now.
 */
export function mapActivityFeed(
  raw: { recentActivity?: RawActivityItem[]; cursor?: string },
  endpoint: string
): ActivityFeed {
  const abs = (u: string | undefined): string | undefined =>
    u ? new URL(u, endpoint).toString() : undefined
  const items: ActivityItem[] = []
  for (const a of raw.recentActivity ?? []) {
    const actor = a.user ?? ''
    const actorAvatarUrl = abs(a.userAvatarUrl ?? a.orgAvatarUrl)
    const actorIsPro = a.isPro
    const repoType = a.repoType ?? 'model'
    if ((a.type === 'like' || a.type === 'update' || a.type === 'publish') && a.repoData?.id) {
      items.push({
        kind: a.type,
        time: a.time,
        actor,
        actorAvatarUrl,
        actorIsPro,
        repo: mapActivityRepo(a.repoData, repoType)
      })
    } else if (a.type === 'social-post' && a.socialPost) {
      items.push({
        kind: 'social-post',
        time: a.time,
        actor,
        actorAvatarUrl,
        actorIsPro,
        post: mapPost(a.socialPost as never, endpoint)
      })
    } else if (a.type === 'discussion' && a.discussionData && a.repoId && typeof a.discussionData.num === 'number') {
      const d: ActivityDiscussion = {
        repoId: a.repoId,
        repoKind: repoType,
        num: a.discussionData.num,
        title: a.discussionData.title ?? '',
        isPullRequest: a.discussionData.isPullRequest ?? false,
        status: a.discussionData.status,
        numComments: a.discussionData.numComments
      }
      items.push({ kind: 'discussion', time: a.time, actor, actorAvatarUrl, actorIsPro, discussion: d })
    }
  }
  return { items, cursor: raw.cursor }
}
