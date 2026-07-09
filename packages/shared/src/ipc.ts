/**
 * The complete IPC surface, defined as a typed contract.
 * No string channels are used anywhere else: main registers handlers from this map,
 * preload exposes `invoke`/`on` typed against it, and the renderer consumes it.
 */
import type {
  AppInfo,
  AppSettings,
  AuthState,
  CacheReport,
  DiscussionDetail,
  DiscussionSummary,
  DownloadRequest,
  DownloadTask,
  ExportResult,
  ExportTarget,
  ExportTool,
  FavoriteItem,
  FileTreeEntry,
  Follow,
  FollowTargetType,
  HistoryItem,
  HubNotification,
  InboxItem,
  InferenceRequest,
  InferenceResult,
  Page,
  PaperSummary,
  RepoDetail,
  RepoKind,
  RepoSummary,
  SearchQuery,
  UploadRequest,
  UploadResult
} from './types'

/** Request/response map for `ipcRenderer.invoke`-style calls. */
export interface IpcInvokeContract {
  'system:getAppInfo': { req: void; res: AppInfo }
  'system:openExternal': { req: { url: string }; res: void }
  'system:showItemInFolder': { req: { path: string }; res: void }
  'system:pickFolder': { req: void; res: string | null }

  'settings:get': { req: void; res: AppSettings }
  'settings:set': { req: { patch: Partial<AppSettings> }; res: AppSettings }

  'hub:search': { req: { query: SearchQuery }; res: Page<RepoSummary> }
  'hub:papers': { req: { cursor?: string }; res: Page<PaperSummary> }
  'hub:repoDetail': { req: { kind: RepoKind; repoId: string }; res: RepoDetail }
  'hub:readme': { req: { kind: RepoKind; repoId: string; revision?: string }; res: string }
  'hub:fileTree': {
    req: { kind: RepoKind; repoId: string; revision?: string; path?: string }
    res: FileTreeEntry[]
  }
  'hub:discussions': {
    req: { kind: RepoKind; repoId: string }
    res: Page<DiscussionSummary>
  }
  'hub:discussionDetail': {
    req: { kind: RepoKind; repoId: string; num: number }
    res: DiscussionDetail
  }
  'hub:discussionComment': {
    req: { kind: RepoKind; repoId: string; num: number; comment: string }
    res: void
  }
  'hub:notifications': { req: void; res: Page<HubNotification> }

  'auth:getState': { req: void; res: AuthState }
  'auth:signIn': { req: void; res: AuthState }
  'auth:signOut': { req: void; res: AuthState }

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
    req: { tool: ExportTool; repoId: string; filePath: string }
    res: ExportResult
  }

  'upload:createRepo': { req: { request: UploadRequest }; res: UploadResult }

  'inference:run': { req: { request: InferenceRequest }; res: InferenceResult }
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
}

export type IpcEventChannel = keyof IpcEventContract
export type IpcEventPayload<C extends IpcEventChannel> = IpcEventContract[C]

export const IPC_INVOKE_CHANNELS: readonly IpcInvokeChannel[] = [
  'system:getAppInfo',
  'system:openExternal',
  'system:showItemInFolder',
  'system:pickFolder',
  'settings:get',
  'settings:set',
  'hub:search',
  'hub:papers',
  'hub:repoDetail',
  'hub:readme',
  'hub:fileTree',
  'hub:discussions',
  'hub:discussionDetail',
  'hub:discussionComment',
  'hub:notifications',
  'auth:getState',
  'auth:signIn',
  'auth:signOut',
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
  'inference:run'
] as const

export const IPC_EVENT_CHANNELS: readonly IpcEventChannel[] = [
  'evt:downloads',
  'evt:auth',
  'evt:inbox',
  'evt:navigate'
] as const

/** Shape of the API exposed on `window.omh` by the preload script. */
export interface RendererApi {
  invoke<C extends IpcInvokeChannel>(channel: C, req: IpcRequest<C>): Promise<IpcResponse<C>>
  /** Subscribe to a push event; returns an unsubscribe function. */
  on<C extends IpcEventChannel>(channel: C, listener: (payload: IpcEventPayload<C>) => void): () => void
}
