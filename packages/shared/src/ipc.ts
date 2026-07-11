/**
 * The complete IPC surface, defined as a typed contract.
 * No string channels are used anywhere else: main registers handlers from this map,
 * preload exposes `invoke`/`on` typed against it, and the renderer consumes it.
 */
import type {
  AccessRequest,
  ActivityFeed,
  AppInfo,
  AppSettings,
  AuthState,
  BillingUsage,
  TokenSignInResult,
  CacheReport,
  CollectionDetail,
  CollectionSummary,
  DatasetRows,
  DatasetSplit,
  DiscussionDetail,
  DiscussionStatusFilter,
  DiscussionSummary,
  DiscussionType,
  CanPostResult,
  DownloadRequest,
  DownloadTask,
  ExportResult,
  HubSessionConnectResult,
  PostComment,
  ExportTarget,
  ExportTool,
  FavoriteItem,
  FileTextResult,
  FileTreeEntry,
  FollowedAccount,
  Follow,
  FollowTargetType,
  HistoryItem,
  InboxItem,
  InferenceRequest,
  InferenceResult,
  InferenceStreamEvent,
  MyRepoEntry,
  NotificationsPage,
  Page,
  PaperSummary,
  PostSummary,
  RepoDetail,
  RepoKind,
  RepoSummary,
  SafetensorsHeader,
  SearchQuery,
  SpaceSecret,
  SpaceVariable,
  UploadProgress,
  UploadRequest,
  UploadResult,
  WatchedEntry,
  AppUpdateState,
  UserOverview,
  UserSearchResult,
  OrgSearchResult,
  PaperSearchResult,
  CollectionSearchResult
} from './types'

/** Request/response map for `ipcRenderer.invoke`-style calls. */
export interface IpcInvokeContract {
  'system:getAppInfo': { req: void; res: AppInfo }
  'system:openExternal': { req: { url: string }; res: void }
  'system:showItemInFolder': { req: { path: string }; res: void }
  'system:pickFolder': { req: void; res: string | null }

  'updater:getState': { req: void; res: AppUpdateState }
  'updater:check': { req: void; res: AppUpdateState }
  'updater:download': { req: void; res: AppUpdateState }
  'updater:install': { req: void; res: void }

  'settings:get': { req: void; res: AppSettings }
  'settings:set': { req: { patch: Partial<AppSettings> }; res: AppSettings }

  /** Wipe selected app SQLite library tables; optional Hub sign-out. Never deletes HF cache files. */
  'privacy:clearLocalData': {
    req: {
      favorites?: boolean
      history?: boolean
      downloads?: boolean
      follows?: boolean
      inbox?: boolean
      otherKv?: boolean
      signOut?: boolean
    }
    res: { cleared: true; signedOut: boolean }
  }

  /** Save current AppSettings to a JSON file via native save dialog. */
  'settings:export': {
    req: void
    res: { canceled: true } | { canceled: false; path: string }
  }

  /** Load AppSettings from a JSON file; preserves local hfCacheDir. */
  'settings:import': {
    req: void
    res: { canceled: true } | { canceled: false; settings: AppSettings }
  }

  /** Lightweight Hub reachability check using the current endpoint/proxy. */
  'network:testConnection': {
    req: void
    res: { ok: true } | { ok: false; error: string }
  }

  'hub:search': { req: { query: SearchQuery }; res: Page<RepoSummary> }
  'hub:papers': { req: { cursor?: string }; res: Page<PaperSummary> }
  /** Single paper lookup for deep links outside the daily feed. */
  'hub:paper': { req: { paperId: string }; res: PaperSummary }
  'hub:repoDetail': { req: { kind: RepoKind; repoId: string }; res: RepoDetail }
  'hub:readme': { req: { kind: RepoKind; repoId: string; revision?: string }; res: string }
  'hub:fileTree': {
    req: { kind: RepoKind; repoId: string; revision?: string; path?: string }
    res: FileTreeEntry[]
  }
  'hub:discussions': {
    req: {
      kind: RepoKind
      repoId: string
      type?: DiscussionType
      status?: DiscussionStatusFilter
    }
    res: Page<DiscussionSummary>
  }
  /** Raw unified diff of a pull request ('' when unavailable). */
  'hub:discussionDiff': {
    req: { kind: RepoKind; repoId: string; num: number }
    res: string
  }
  'hub:posts': { req: { cursor?: string }; res: Page<PostSummary> }
  'hub:recentActivity': { req: { cursor?: string }; res: ActivityFeed }
  'hub:postDetail': { req: { author: string; slug: string }; res: PostSummary }
  'hub:userOverview': { req: { username: string }; res: UserOverview }
  /** Accounts the given user follows on the Hub (drained pagination, capped). */
  'hub:userFollowing': { req: { username: string }; res: FollowedAccount[] }
  /** Organization members (capped avatar strip for the profile page). */
  'hub:orgMembers': { req: { org: string; limit?: number }; res: FollowedAccount[] }
  'hub:discussionDetail': {
    req: { kind: RepoKind; repoId: string; num: number }
    res: DiscussionDetail
  }
  'hub:discussionComment': {
    req: { kind: RepoKind; repoId: string; num: number; comment: string }
    res: void
  }
  'hub:notifications': { req: { page?: number }; res: NotificationsPage }
  /** Empty discussionIds = mark everything as read/unread. */
  'hub:notificationsMarkRead': { req: { discussionIds: string[]; read: boolean }; res: void }
  'hub:notificationsClear': { req: void; res: void }
  /**
   * Watch/unwatch users and orgs by their account HANDLE (username/org name).
   * Returns the resulting watch list so callers can VERIFY an add took effect
   * — the Hub silently ignores mutations that lack a web session (and any that
   * pass the internal id instead of the handle).
   */
  'hub:watchUpdate': {
    req: {
      add?: { id: string; type: 'user' | 'org' }[]
      delete?: { id: string; type: 'user' | 'org' }[]
    }
    res: WatchedEntry[]
  }
  /** Current Hub watch list (read via a no-op watch PATCH). */
  'hub:watchList': { req: void; res: WatchedEntry[] }
  /**
   * Attempt watch/unwatch (by account handle) and report whether the Hub
   * applied it. Sessions without a web cookie get applied=false — UI should
   * open the website Watch control as a fallback.
   */
  'hub:watchSet': {
    req: { id: string; type: 'user' | 'org'; watching: boolean }
    res: { applied: boolean; watched: WatchedEntry[] }
  }
  'hub:fileText': {
    req: { kind: RepoKind; repoId: string; path: string; revision?: string; maxBytes?: number }
    res: FileTextResult
  }
  'hub:safetensorsHeader': {
    req: { kind: RepoKind; repoId: string; path: string; revision?: string }
    res: SafetensorsHeader
  }
  'hub:datasetSplits': { req: { repoId: string }; res: DatasetSplit[] }
  'hub:searchUsers': { req: { query: string }; res: UserSearchResult[] }
  'hub:searchOrgs': { req: { query: string }; res: OrgSearchResult[] }
  'hub:searchPapers': { req: { query: string }; res: PaperSearchResult[] }
  'hub:searchCollections': { req: { query: string }; res: CollectionSearchResult[] }
  /** Whether at least one inference provider serves this model. */
  'hub:inferenceAvailable': { req: { repoId: string }; res: boolean }
  'hub:datasetRows': {
    req: { repoId: string; config: string; split: string; offset?: number; length?: number }
    res: DatasetRows
  }

  'hub:collections': { req: { owner: string }; res: CollectionSummary[] }
  'hub:collection': { req: { slug: string }; res: CollectionDetail }
  'hub:collectionCreate': {
    req: { namespace: string; title: string; description?: string; private: boolean }
    res: CollectionDetail
  }
  'hub:collectionUpdate': {
    req: {
      slug: string
      patch: {
        title?: string
        description?: string
        private?: boolean
        position?: number
        theme?: string
      }
    }
    res: void
  }
  /** Destructive: confirmSlug must equal slug (enforced by the zod schema). */
  'hub:collectionDelete': { req: { slug: string; confirmSlug: string }; res: void }
  'hub:collectionAddItem': {
    req: {
      slug: string
      item: { type: 'model' | 'dataset' | 'space' | 'paper'; id: string }
      note?: string
    }
    res: void
  }
  'hub:collectionUpdateItem': {
    req: { slug: string; itemId: string; note?: string; position?: number }
    res: void
  }
  'hub:collectionRemoveItem': { req: { slug: string; itemId: string }; res: void }

  'hub:myRepos': { req: void; res: MyRepoEntry[] }
  'hub:repoSettingsUpdate': {
    req: {
      kind: RepoKind
      repoId: string
      patch: { private?: boolean; gated?: false | 'auto' | 'manual'; discussionsDisabled?: boolean }
    }
    res: void
  }
  'hub:repoMove': { req: { kind: RepoKind; fromRepo: string; toRepo: string }; res: void }
  /** Destructive: confirmName must equal repoId (enforced by the zod schema). */
  'hub:repoDelete': { req: { kind: RepoKind; repoId: string; confirmName: string }; res: void }
  /** Spaces only: the Hub /duplicate endpoint exists solely for repoType=spaces. */
  'hub:repoDuplicate': {
    req: { repoId: string; toRepo: string; private?: boolean }
    res: { url?: string }
  }
  'hub:branchCreate': {
    req: { kind: RepoKind; repoId: string; branch: string; startingPoint?: string }
    res: void
  }
  'hub:branchDelete': { req: { kind: RepoKind; repoId: string; branch: string }; res: void }
  'hub:tagCreate': {
    req: { kind: RepoKind; repoId: string; tag: string; revision?: string; message?: string }
    res: void
  }
  'hub:tagDelete': { req: { kind: RepoKind; repoId: string; tag: string }; res: void }

  /** Gated-repo access requests (models and datasets only). */
  'hub:accessRequests': {
    req: {
      kind: 'model' | 'dataset'
      repoId: string
      status: 'pending' | 'accepted' | 'rejected'
    }
    res: AccessRequest[]
  }
  'hub:accessRequestHandle': {
    req: {
      kind: 'model' | 'dataset'
      repoId: string
      user: string
      status: 'accepted' | 'rejected' | 'pending'
      rejectionReason?: string
    }
    res: void
  }
  'hub:accessRequestGrant': {
    req: { kind: 'model' | 'dataset'; repoId: string; user: string }
    res: void
  }

  'hub:spaceSecrets': { req: { repoId: string }; res: SpaceSecret[] }
  'hub:spaceSecretSet': {
    req: { repoId: string; key: string; value: string; description?: string }
    res: void
  }
  'hub:spaceSecretDelete': { req: { repoId: string; key: string }; res: void }
  'hub:spaceVariables': { req: { repoId: string }; res: SpaceVariable[] }
  'hub:spaceVariableSet': {
    req: { repoId: string; key: string; value: string; description?: string }
    res: void
  }
  'hub:spaceVariableDelete': { req: { repoId: string; key: string }; res: void }
  /** Bounded snapshot of the Space's SSE log stream (never hangs). */
  'hub:spaceLogs': { req: { repoId: string; logType: 'build' | 'run' }; res: { text: string } }
  'hub:spaceRestart': { req: { repoId: string; factory?: boolean }; res: void }

  'hub:likeSet': { req: { kind: RepoKind; repoId: string; liked: boolean }; res: void }
  /** Social follow/unfollow on the Hub (same as the website Follow button). */
  'hub:followSet': {
    req: { username: string; following: boolean; isOrg?: boolean }
    res: void
  }
  'hub:userLikes': { req: { username: string }; res: RepoSummary[] }
  'hub:postComment': {
    req: { author: string; slug: string; comment: string; replyToCommentId?: string }
    res: void
  }
  /** Toggle an emoji reaction on a community post (needs a Hub web session). */
  'hub:postReactionSet': {
    req: { author: string; slug: string; reaction: string; active: boolean }
    res: void
  }
  /** Comments on a community post (parsed from the Hub post page; public read). */
  'hub:postComments': { req: { author: string; slug: string }; res: PostComment[] }
  /**
   * Hide a comment on a post — irreversible. `reason` is a verbatim label from
   * HUB_HIDE_REASONS (optional). Needs a Hub web session and moderation rights.
   */
  'hub:postCommentHide': {
    req: { author: string; slug: string; commentId: string; reason?: string }
    res: void
  }
  /**
   * Upload a comment attachment (image/audio/video) to the Hub CDN; returns its
   * URL to embed in the comment markdown. Needs a Hub web session.
   */
  'hub:commentAssetUpload': {
    req: { filename: string; contentType: string; data: Uint8Array }
    res: { url: string }
  }
  /** Toggle an emoji reaction on a post comment (needs a Hub web session). */
  'hub:postCommentReactionSet': {
    req: { author: string; slug: string; commentId: string; reaction: string; active: boolean }
    res: void
  }
  /** Whether the connected web session may create posts (Hub beta gate). */
  'hub:postCanCreate': { req: void; res: CanPostResult }
  /** Create a community post (needs a Hub web session with posting access). */
  'hub:postCreate': { req: { content: string }; res: { slug?: string } }
  /** Toggle a Daily Papers upvote (needs a Hub web session). */
  'hub:paperUpvoteSet': { req: { paperId: string; upvoted: boolean }; res: void }
  /** Toggle a collection upvote (needs a Hub web session). */
  'hub:collectionUpvoteSet': { req: { slug: string; upvoted: boolean }; res: void }
  /** Toggle an emoji reaction on a discussion comment (needs a Hub web session). */
  'hub:discussionReactionSet': {
    req: {
      kind: RepoKind
      repoId: string
      num: number
      commentId: string
      reaction: string
      active: boolean
    }
    res: void
  }
  'hub:paperComment': {
    req: { paperId: string; comment: string; replyToCommentId?: string }
    res: void
  }
  'hub:prMerge': {
    req: { kind: RepoKind; repoId: string; num: number; comment?: string }
    res: void
  }
  'hub:discussionStatusSet': {
    req: {
      kind: RepoKind
      repoId: string
      num: number
      status: 'open' | 'closed'
      comment?: string
    }
    res: void
  }
  'hub:discussionTitleSet': {
    req: { kind: RepoKind; repoId: string; num: number; title: string }
    res: void
  }
  'hub:billingUsage': { req: void; res: BillingUsage }

  'auth:getState': { req: void; res: AuthState }
  /** Validate + install a pasted User Access Token. */
  'auth:signInWithToken': { req: { token: string }; res: TokenSignInResult }
  'auth:signOut': { req: void; res: AuthState }
  /** Open the Hub login window and capture a web-session cookie (supplemental credential). */
  'auth:connectHubSession': { req: void; res: HubSessionConnectResult }
  /** Drop the web-session cookie; the token session stays signed in. */
  'auth:disconnectHubSession': { req: void; res: AuthState }

  'favorites:list': { req: void; res: FavoriteItem[] }
  'favorites:add': { req: { summary: RepoSummary }; res: FavoriteItem[] }
  'favorites:remove': { req: { kind: RepoKind; repoId: string }; res: FavoriteItem[] }

  'history:list': { req: void; res: HistoryItem[] }
  'history:record': { req: { summary: RepoSummary }; res: void }
  'history:clear': { req: void; res: void }

  'downloads:list': { req: void; res: DownloadTask[] }
  'downloads:start': { req: { request: DownloadRequest }; res: DownloadTask[] }
  'downloads:pause': { req: { id: string }; res: DownloadTask[] }
  'downloads:resume': { req: { id: string }; res: DownloadTask[] }
  'downloads:cancel': { req: { id: string }; res: DownloadTask[] }
  'downloads:remove': { req: { id: string }; res: DownloadTask[] }
  'downloads:pauseAll': { req: void; res: DownloadTask[] }
  'downloads:resumeAll': { req: void; res: DownloadTask[] }
  'downloads:clearCompleted': { req: void; res: DownloadTask[] }

  'cache:scan': { req: void; res: CacheReport }
  'cache:deleteRevisions': {
    req: { repoPath: string; commitHashes: string[] }
    res: CacheReport
  }

  'follows:list': { req: void; res: Follow[] }
  'follows:add': { req: { type: FollowTargetType; target: string }; res: Follow[] }
  'follows:remove': { req: { id: string }; res: Follow[] }

  'inbox:list': { req: void; res: InboxItem[] }
  'inbox:markRead': { req: { ids: string[] }; res: InboxItem[] }
  'inbox:clear': { req: void; res: InboxItem[] }
  'inbox:pollNow': { req: void; res: { added: number } }

  'export:targets': { req: void; res: ExportTarget[] }
  'export:run': {
    req: { tool: ExportTool; kind: RepoKind; repoId: string; filePath: string }
    res: ExportResult
  }

  'upload:createRepo': { req: { request: UploadRequest }; res: UploadResult }

  'inference:run': { req: { request: InferenceRequest }; res: InferenceResult }
  /** Streams deltas through the `evt:inference` channel, correlated by id. */
  'inference:stream': { req: { id: string; request: InferenceRequest }; res: void }
  'inference:cancel': { req: { id: string }; res: void }
}

export type IpcInvokeChannel = keyof IpcInvokeContract
export type IpcRequest<C extends IpcInvokeChannel> = IpcInvokeContract[C]['req']
export type IpcResponse<C extends IpcInvokeChannel> = IpcInvokeContract[C]['res']

/** Push events, main → renderer. */
export interface IpcEventContract {
  'evt:downloads': DownloadTask[]
  'evt:auth': AuthState
  'evt:inbox': InboxItem[]
  /** Ask the renderer to navigate to an in-app route (menu items, notification clicks). */
  'evt:navigate': string
  'evt:upload': UploadProgress
  'evt:inference': InferenceStreamEvent
  'evt:updater': AppUpdateState
}

export type IpcEventChannel = keyof IpcEventContract
export type IpcEventPayload<C extends IpcEventChannel> = IpcEventContract[C]

export const IPC_INVOKE_CHANNELS = [
  'system:getAppInfo',
  'system:openExternal',
  'system:showItemInFolder',
  'system:pickFolder',
  'updater:getState',
  'updater:check',
  'updater:download',
  'updater:install',
  'settings:get',
  'settings:set',
  'settings:export',
  'settings:import',
  'privacy:clearLocalData',
  'network:testConnection',
  'hub:search',
  'hub:papers',
  'hub:paper',
  'hub:repoDetail',
  'hub:readme',
  'hub:fileTree',
  'hub:discussions',
  'hub:discussionDiff',
  'hub:posts',
  'hub:recentActivity',
  'hub:postDetail',
  'hub:userOverview',
  'hub:userFollowing',
  'hub:orgMembers',
  'hub:discussionDetail',
  'hub:discussionComment',
  'hub:notifications',
  'hub:notificationsMarkRead',
  'hub:notificationsClear',
  'hub:watchUpdate',
  'hub:watchList',
  'hub:watchSet',
  'hub:fileText',
  'hub:safetensorsHeader',
  'hub:datasetSplits',
  'hub:datasetRows',
  'hub:searchUsers',
  'hub:searchOrgs',
  'hub:searchPapers',
  'hub:searchCollections',
  'hub:inferenceAvailable',
  'hub:collections',
  'hub:collection',
  'hub:collectionCreate',
  'hub:collectionUpdate',
  'hub:collectionDelete',
  'hub:collectionAddItem',
  'hub:collectionUpdateItem',
  'hub:collectionRemoveItem',
  'hub:myRepos',
  'hub:repoSettingsUpdate',
  'hub:repoMove',
  'hub:repoDelete',
  'hub:repoDuplicate',
  'hub:branchCreate',
  'hub:branchDelete',
  'hub:tagCreate',
  'hub:tagDelete',
  'hub:accessRequests',
  'hub:accessRequestHandle',
  'hub:accessRequestGrant',
  'hub:spaceSecrets',
  'hub:spaceSecretSet',
  'hub:spaceSecretDelete',
  'hub:spaceVariables',
  'hub:spaceVariableSet',
  'hub:spaceVariableDelete',
  'hub:spaceLogs',
  'hub:spaceRestart',
  'hub:likeSet',
  'hub:followSet',
  'hub:userLikes',
  'hub:postComment',
  'hub:postComments',
  'hub:postCommentHide',
  'hub:commentAssetUpload',
  'hub:postCommentReactionSet',
  'hub:postCanCreate',
  'hub:postCreate',
  'hub:postReactionSet',
  'hub:paperUpvoteSet',
  'hub:collectionUpvoteSet',
  'hub:discussionReactionSet',
  'hub:paperComment',
  'hub:prMerge',
  'hub:discussionStatusSet',
  'hub:discussionTitleSet',
  'hub:billingUsage',
  'auth:getState',
  'auth:signInWithToken',
  'auth:signOut',
  'auth:connectHubSession',
  'auth:disconnectHubSession',
  'favorites:list',
  'favorites:add',
  'favorites:remove',
  'history:list',
  'history:record',
  'history:clear',
  'downloads:list',
  'downloads:start',
  'downloads:pause',
  'downloads:resume',
  'downloads:cancel',
  'downloads:remove',
  'downloads:pauseAll',
  'downloads:resumeAll',
  'downloads:clearCompleted',
  'cache:scan',
  'cache:deleteRevisions',
  'follows:list',
  'follows:add',
  'follows:remove',
  'inbox:list',
  'inbox:markRead',
  'inbox:clear',
  'inbox:pollNow',
  'export:targets',
  'export:run',
  'upload:createRepo',
  'inference:run',
  'inference:stream',
  'inference:cancel'
] as const satisfies readonly IpcInvokeChannel[]

// Compile-time drift guard: every channel in the IpcInvokeChannels type map must
// be listed in IPC_INVOKE_CHANNELS, or the preload allowlist rejects it at runtime
// with "Unknown IPC channel". This errors if the array and the type ever diverge —
// the assignment fails to compile, naming the missing channel(s).
type MissingInvokeChannels = Exclude<IpcInvokeChannel, (typeof IPC_INVOKE_CHANNELS)[number]>
const _invokeChannelsExhaustive: [MissingInvokeChannels] extends [never]
  ? true
  : MissingInvokeChannels = true
void _invokeChannelsExhaustive

export const IPC_EVENT_CHANNELS: readonly IpcEventChannel[] = [
  'evt:downloads',
  'evt:auth',
  'evt:inbox',
  'evt:navigate',
  'evt:upload',
  'evt:inference',
  'evt:updater'
] as const

/** Shape of the API exposed on `window.omh` by the preload script. */
export interface RendererApi {
  invoke<C extends IpcInvokeChannel>(channel: C, req: IpcRequest<C>): Promise<IpcResponse<C>>
  /** Subscribe to a push event; returns an unsubscribe function. */
  on<C extends IpcEventChannel>(
    channel: C,
    listener: (payload: IpcEventPayload<C>) => void
  ): () => void
}
