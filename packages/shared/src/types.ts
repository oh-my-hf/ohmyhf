/** Domain types shared between the main process, preload, and renderer. */

export const SUPPORTED_LOCALES = ['en', 'zh-CN'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

export type RepoKind = 'model' | 'dataset' | 'space'

export interface RepoSummary {
  id: string
  kind: RepoKind
  author: string
  name: string
  likes: number
  downloads: number
  /** ISO timestamp of last modification, when the API provides it. */
  updatedAt?: string
  createdAt?: string
  private: boolean
  gated: string | boolean
  tags: string[]
  /** Models only: task, e.g. "text-generation". */
  pipelineTag?: string
  /** Models only: e.g. "transformers". */
  libraryName?: string
  license?: string
  /** Total parameter count when the API exposes safetensors metadata. */
  paramCount?: number
  /** Spaces only: sdk, e.g. "gradio". */
  sdk?: string
  trendingScore?: number
  /** Spaces only: card emoji + gradient + runtime stage for gallery rendering. */
  emoji?: string
  colorFrom?: string
  colorTo?: string
  shortDescription?: string
  runtimeStage?: string
  /** Spaces only: current hardware id, e.g. "cpu-basic", "zero-a10g". */
  hardware?: string
}

export interface RepoDetail extends RepoSummary {
  sha?: string
  /** Spaces only: the *.hf.space host serving the app (for in-app embedding). */
  spaceDomain?: string
  lastModified?: string
  cardData?: Record<string, unknown>
  siblings?: Array<{ rfilename: string; size?: number }>
  spaces?: string[]
  usedStorage?: number
  downloadsAllTime?: number
}

export interface FileTreeEntry {
  type: 'file' | 'directory'
  path: string
  size: number
  oid?: string
  lfs?: { oid: string; size: number }
}

export interface PaperSummary {
  id: string
  title: string
  summary: string
  publishedAt?: string
  upvotes: number
  authors: string[]
  thumbnail?: string
  numComments?: number
}

export type RepoSort = 'trending' | 'downloads' | 'likes' | 'updated' | 'created'

export interface SearchQuery {
  kind: RepoKind
  search?: string
  author?: string
  /** Raw tag filters, e.g. "license:mit", "gguf". */
  tags?: string[]
  pipelineTag?: string
  library?: string
  license?: string
  sort: RepoSort
  /** Filter to models served by a specific inference provider (models only). */
  inferenceProvider?: string
  limit?: number
  /** Opaque pagination cursor (full URL of the next page). */
  cursor?: string
}

export interface Page<T> {
  items: T[]
  nextCursor?: string
}

/**
 * Paid org plan from Hub overview / whoami (`plan` field).
 * `plus` is Enterprise Plus; `academia` is the academic org tier.
 */
export type HubOrgPlan = 'team' | 'enterprise' | 'plus' | 'academia'

export interface OrgSummary {
  name: string
  fullname?: string
  avatarUrl?: string
  /** Present when the Hub payload includes a paid org plan. */
  plan?: HubOrgPlan
}

export interface UserProfile {
  name: string
  fullname?: string
  email?: string
  avatarUrl?: string
  isPro?: boolean
  orgs: OrgSummary[]
}

export type AuthState =
  | { status: 'signedOut' }
  | { status: 'signingIn' }
  /** scopes = OAuth scopes granted to the stored token; UI gates features on them. */
  | { status: 'signedIn'; user: UserProfile; scopes?: string[] }

export interface HubNotification {
  /** discussion id used by mark-as-read, when the notification is discussion-backed */
  discussionId?: string
  kind: 'repo' | 'paper' | 'post' | 'org' | 'other'
  read: boolean
  updatedAt?: string
  title: string
  /** in-app route, e.g. /models/{id}/discussions/{num} or /posts/{author}/{slug} */
  route?: string
  repoId?: string
  repoKind?: RepoKind
  discussionNum?: number
  discussionStatus?: 'draft' | 'open' | 'closed' | 'merged'
  isPullRequest?: boolean
  participants?: { user: string; avatar?: string }[]
}

export interface NotificationsPage {
  count: number
  items: HubNotification[]
}

export type DownloadStatus = 'queued' | 'running' | 'paused' | 'completed' | 'error' | 'canceled'

export interface DownloadFileState {
  path: string
  size: number
  receivedBytes: number
  status: DownloadStatus
  /** sha256 expected for LFS files (from the HF etag). */
  sha256?: string
  verified?: boolean
  error?: string
}

export interface DownloadTask {
  id: string
  repoId: string
  kind: RepoKind
  revision: string
  status: DownloadStatus
  totalBytes: number
  receivedBytes: number
  /** Rolling average, bytes per second. */
  speedBps: number
  files: DownloadFileState[]
  error?: string
  createdAt: string
  completedAt?: string
}

export interface DownloadRequest {
  repoId: string
  kind: RepoKind
  revision?: string
  /** File paths to fetch; omit to download the whole snapshot. */
  files?: string[]
}

export interface CachedRevision {
  commitHash: string
  sizeOnDisk: number
  fileCount: number
  refs: string[]
  lastModified?: string
}

export interface CachedRepo {
  id: string
  kind: RepoKind
  path: string
  sizeOnDisk: number
  revisions: CachedRevision[]
  lastModified?: string
}

export interface CacheReport {
  root: string
  totalSize: number
  repos: CachedRepo[]
  scannedAt: string
}

export interface FavoriteItem {
  repoId: string
  kind: RepoKind
  addedAt: string
  summary: RepoSummary
}

export interface HistoryItem {
  repoId: string
  kind: RepoKind
  viewedAt: string
  summary: RepoSummary
}

export type FollowTargetType = 'user' | 'org' | 'repo' | 'papers'

export interface Follow {
  id: string
  type: FollowTargetType
  /** username, org name, or "kind:repoId"; empty for 'papers'. */
  target: string
  createdAt: string
  lastCheckedAt?: string
}

export type InboxItemKind = 'repo-update' | 'new-repo' | 'paper'

export interface InboxItem {
  id: string
  kind: InboxItemKind
  title: string
  body: string
  /** In-app route to open when clicked, e.g. "/models/meta-llama/Llama-3-8B". */
  route: string
  createdAt: string
  readAt?: string
}

export interface DiscussionSummary {
  num: number
  title: string
  status: 'open' | 'closed' | 'merged' | 'draft'
  isPullRequest: boolean
  author?: string
  createdAt?: string
  numComments?: number
}

export interface DiscussionEvent {
  id: string
  type: string
  author?: string
  createdAt?: string
  /** Markdown content for comments. */
  content?: string
  /** status-change events: the new status. */
  status?: string
  /** commit events. */
  oid?: string
  subject?: string
}

export interface DiscussionDetail extends DiscussionSummary {
  events: DiscussionEvent[]
  /** Pull requests only. */
  baseRef?: string
  diffUrl?: string
}

export type DiscussionType = 'discussion' | 'pull_request'
export type DiscussionStatusFilter = 'open' | 'closed'

/** One emoji reaction on a post, with who reacted (to derive the current user's state). */
export interface PostReaction {
  emoji: string
  count: number
  /** Usernames that reacted with this emoji; used to highlight the caller's own reaction. */
  users: string[]
}

export interface PostSummary {
  slug: string
  author: string
  authorFullname?: string
  authorAvatarUrl?: string
  /** Raw markdown-ish text of the post. */
  content: string
  publishedAt?: string
  numComments?: number
  numReactions?: number
  /** Per-emoji reaction breakdown (empty when the post has no reactions). */
  reactions: PostReaction[]
  /** Absolute huggingface.co URL. */
  url: string
}

export interface UserOverview {
  /** 24-hex `_id` from the overview response — required for watch updates. */
  internalId?: string
  name: string
  fullname?: string
  avatarUrl?: string
  bio?: string
  /** Personal PRO subscription (users only). */
  isPro?: boolean
  /** Org plan when this overview is an organization (`team` / `enterprise` / `plus` / …). */
  plan?: HubOrgPlan
  numModels: number
  numDatasets: number
  numSpaces: number
  numPapers?: number
  numFollowers: number
  numFollowing: number
  /** Org member count (`numUsers` on the organizations overview). */
  numUsers?: number
  numLikes?: number
  orgs: OrgSummary[]
  createdAt?: string
  /** Whether the signed-in account follows this user on the Hub. */
  isFollowing?: boolean
  isOrg?: boolean
}

export interface FollowedAccount {
  name: string
  fullname?: string
  avatarUrl?: string
  isOrg?: boolean
}

/** A discussion/PR surfaced in the activity feed. */
export interface ActivityDiscussion {
  repoId: string
  repoKind: RepoKind
  num: number
  title: string
  isPullRequest: boolean
  status?: string
  numComments?: number
}

/**
 * One item in the personalized "following" activity feed
 * (`/api/recent-activity`). Discriminated by `kind`; each carries the actor and
 * a type-specific payload. Kinds the app doesn't render yet (collection, upvote,
 * paper-daily) are dropped by the mapper.
 */
export type ActivityItem =
  | { kind: 'like' | 'update' | 'publish' | 'new-repo'; time?: string; actor: string; actorAvatarUrl?: string; repo: RepoSummary }
  | { kind: 'social-post'; time?: string; actor: string; actorAvatarUrl?: string; post: PostSummary }
  | { kind: 'discussion'; time?: string; actor: string; actorAvatarUrl?: string; discussion: ActivityDiscussion }

export interface ActivityFeed {
  items: ActivityItem[]
  /** Opaque cursor for the next page, when the Hub returns one. */
  cursor?: string
}

export type ThemeSetting = 'system' | 'light' | 'dark'

export type DefaultHome = 'home' | 'models' | 'datasets' | 'spaces' | 'papers'

export interface AppSettings {
  locale: 'system' | Locale
  theme: ThemeSetting
  downloadConcurrency: number
  /** null = unlimited */
  speedLimitBps: number | null
  /** null = platform default HF cache dir */
  hfCacheDir: string | null
  notificationsEnabled: boolean
  pollIntervalMinutes: number
  /** UI zoom percentage (100 = default). */
  uiScale: number
  /** null = https://huggingface.co */
  hubEndpoint: string | null
  /** null = no app-level HTTP(S) proxy override */
  proxyUrl: string | null
  /** Open the app automatically when the user logs into the OS. */
  launchAtLogin: boolean
  /** Hide to the system tray instead of quitting when the window is closed. */
  closeToTray: boolean
  /** Landing route when opening the app at `/`. */
  defaultHome: DefaultHome
  /** Default browse sort for models/datasets/spaces. */
  defaultRepoSort: RepoSort
}

export const DEFAULT_SETTINGS: AppSettings = {
  locale: 'system',
  theme: 'system',
  downloadConcurrency: 3,
  speedLimitBps: null,
  hfCacheDir: null,
  notificationsEnabled: true,
  pollIntervalMinutes: 30,
  uiScale: 100,
  hubEndpoint: null,
  proxyUrl: null,
  launchAtLogin: false,
  closeToTray: false,
  defaultHome: 'home',
  defaultRepoSort: 'trending'
}

/** Subset of process.platform values the app runs on (kept Node-types-free for the renderer). */
export type Platform = 'darwin' | 'win32' | 'linux' | 'freebsd' | 'openbsd' | 'aix' | 'sunos'

export interface AppInfo {
  version: string
  platform: Platform
  electronVersion: string
  systemLocale: string
  hfCacheDir: string
}

export type AppUpdateErrorCode =
  'network' | 'configuration' | 'verification' | 'permission' | 'unknown'

export type AppUpdateOperation = 'check' | 'download' | 'install'

interface AppUpdateStateBase {
  currentVersion: string
}

/** Public updater state. Paths, feed URLs, and raw provider errors never cross IPC. */
export type AppUpdateState =
  | (AppUpdateStateBase & { status: 'unsupported' | 'idle' | 'checking' | 'up-to-date' })
  | (AppUpdateStateBase & {
      status: 'available' | 'manual' | 'ready'
      availableVersion: string
    })
  | (AppUpdateStateBase & {
      status: 'downloading'
      availableVersion: string
      percent: number
      transferred: number
      total: number
      bytesPerSecond: number
    })
  | (AppUpdateStateBase & {
      status: 'error'
      operation: AppUpdateOperation
      error: AppUpdateErrorCode
      availableVersion?: string
    })

export type ExportTool = 'ollama' | 'lmstudio' | 'comfyui'

export interface ExportTarget {
  tool: ExportTool
  detected: boolean
  path?: string
}

/** messageKey resolves in the renderer's `integrations` i18n namespace. */
export interface ExportResult {
  ok: boolean
  messageKey: string
  params?: Record<string, string>
}

export interface InferenceRequest {
  model: string
  input: string
}

export interface InferenceResult {
  ok: boolean
  output?: string
  error?: string
}

export interface InferenceStreamEvent {
  id: string
  delta?: string
  done?: boolean
  error?: string
}

export interface UploadRequest {
  kind: RepoKind
  name: string
  private: boolean
  folderPath: string
}

export interface UploadResult {
  ok: boolean
  repoUrl?: string
  messageKey: string
  params?: Record<string, string>
}

export interface UploadProgress {
  phase: 'preparing' | 'hashing' | 'uploading' | 'done' | 'error'
  /** 0..1 overall */
  progress: number
  path?: string
  messageKey?: string
  params?: Record<string, string>
}

export interface FileTextResult {
  content: string
  truncated: boolean
  size: number
}

export interface SafetensorsTensor {
  name: string
  dtype: string
  shape: number[]
}

export interface SafetensorsHeader {
  tensors: SafetensorsTensor[]
  metadata?: Record<string, string>
  totalParams: number
}

export interface DatasetSplit {
  config: string
  split: string
}

export interface UserSearchResult {
  name: string
  fullname?: string
  avatarUrl?: string
}

/** Org hit from `/api/quicksearch?type=org` (Hub uses `name`, not `user`). */
export interface OrgSearchResult {
  name: string
  fullname?: string
  avatarUrl?: string
}

/** Paper hit from `/api/quicksearch?type=paper` (`_id` → `id`). */
export interface PaperSearchResult {
  id: string
  title: string
}

/** Collection hit from `/api/quicksearch?type=collection` (`_id` is the routable slug). */
export interface CollectionSearchResult {
  slug: string
  title: string
  description?: string
}

export interface DatasetRows {
  columns: string[]
  /** Cell values pre-stringified and truncated for display. */
  rows: string[][]
  total?: number
}

export interface CollectionSummary {
  /** "owner/title-slug-<24hex>" — the API path segment. */
  slug: string
  title: string
  description?: string
  owner: string
  private: boolean
  theme?: string
  itemCount?: number
  upvotes?: number
  updatedAt?: string
}

export interface CollectionItem {
  /** `_id` used for item PATCH/DELETE. */
  itemId: string
  type: 'model' | 'dataset' | 'space' | 'paper' | 'collection'
  /** Repo id / paper id. */
  id: string
  /** Paper title or repo id. */
  title?: string
  /** Routable slug for type:'collection' items — the id field is the internal 24-hex id. */
  slug?: string
  note?: string
  position?: number
  /** Light display metadata when present in the API response: */
  downloads?: number
  likes?: number
  emoji?: string
}

export interface CollectionDetail extends CollectionSummary {
  items: CollectionItem[]
}

export interface MyRepoEntry {
  id: string
  /** Filter API `type` to model|dataset|space; drop bucket/kernel. */
  kind: RepoKind
  visibility: 'public' | 'private' | 'protected'
  updatedAt: string
  storage: number
  storagePercent: number
}

export interface AccessRequestUser {
  name: string
  fullname?: string
  avatarUrl?: string
}

export interface AccessRequest {
  user: AccessRequestUser
  timestamp?: string
  /** Extra gate-form fields if present. */
  fields?: Record<string, string>
}

export interface SpaceSecret {
  key: string
  description?: string
  updatedAt?: string
}

export interface SpaceVariable {
  key: string
  value?: string
  description?: string
  updatedAt?: string
}

export interface BillingUsage {
  periodStart?: string
  periodEnd?: string
  /** Tolerant of shape drift: generic labeled rows for display. */
  rows: { label: string; detail?: string; amountCents?: number }[]
}
