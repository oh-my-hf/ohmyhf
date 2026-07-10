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

export interface OrgSummary {
  name: string
  fullname?: string
  avatarUrl?: string
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
  | { status: 'signedIn'; user: UserProfile }

export interface HubNotification {
  id: string
  title: string
  url?: string
  read: boolean
  createdAt?: string
  repoId?: string
}

export type DownloadStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'error'
  | 'canceled'

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
  /** Absolute huggingface.co URL. */
  url: string
}

export type ThemeSetting = 'system' | 'light' | 'dark'

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
}

export const DEFAULT_SETTINGS: AppSettings = {
  locale: 'system',
  theme: 'system',
  downloadConcurrency: 3,
  speedLimitBps: null,
  hfCacheDir: null,
  notificationsEnabled: true,
  pollIntervalMinutes: 30
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

export interface DatasetRows {
  columns: string[]
  /** Cell values pre-stringified and truncated for display. */
  rows: string[][]
  total?: number
}
