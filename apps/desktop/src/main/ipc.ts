/**
 * Registers every IPC handler from the typed contract in @oh-my-huggingface/shared.
 * Each payload is validated (zod) before any work happens; channels that accept no
 * payload reject anything non-null. No string channels appear outside the contract.
 */
import { app, dialog, ipcMain, shell } from 'electron'
import type {
  AppInfo,
  IpcEventChannel,
  IpcEventPayload,
  IpcInvokeChannel,
  IpcRequest,
  IpcResponse
} from '@oh-my-huggingface/shared'
import { SUPPORTED_LOCALES, ipcRequestSchemas } from '@oh-my-huggingface/shared'
import { defaultCacheDir } from '@oh-my-huggingface/hub-api'
import type { HubClient } from '@oh-my-huggingface/hub-api'
import type { AuthManager } from './auth'
import type { CacheManager } from './cache'
import type { DownloadManager } from './downloads'
import type { FollowsPoller } from './follows'
import type { MainI18n } from './i18n'
import type { Library } from './library'
import type { SettingsStore } from './settings'
import {
  cancelInference,
  createRepoAndUpload,
  detectExportTargets,
  runExport,
  runInference,
  runInferenceStream
} from './integrations'
import { matchLocale } from './i18n'

export interface AppContext {
  hub: HubClient
  auth: AuthManager
  settings: SettingsStore
  library: Library
  downloads: DownloadManager
  cache: CacheManager
  follows: FollowsPoller
  i18n: MainI18n
  rebuildMenu: () => void
  broadcast: <C extends IpcEventChannel>(channel: C, payload: IpcEventPayload<C>) => void
}

function handle<C extends IpcInvokeChannel>(
  channel: C,
  handler: (req: IpcRequest<C>) => Promise<IpcResponse<C>> | IpcResponse<C>
): void {
  ipcMain.handle(channel, async (_event, payload: unknown) => {
    const schema = ipcRequestSchemas[channel]
    if (schema) {
      const parsed = schema.safeParse(payload)
      if (!parsed.success) {
        throw new Error(`Invalid payload for ${channel}: ${parsed.error.message}`)
      }
      return handler(parsed.data as IpcRequest<C>)
    }
    if (payload !== undefined && payload !== null) {
      throw new Error(`Channel ${channel} accepts no payload`)
    }
    return handler(undefined as IpcRequest<C>)
  })
}

export function registerIpcHandlers(ctx: AppContext): void {
  // --- system ---------------------------------------------------------------
  handle('system:getAppInfo', (): AppInfo => {
    return {
      version: app.getVersion(),
      platform: process.platform as AppInfo['platform'],
      electronVersion: process.versions.electron ?? '',
      systemLocale: app.getLocale(),
      hfCacheDir: ctx.settings.get().hfCacheDir ?? defaultCacheDir()
    }
  })
  handle('system:openExternal', async ({ url }) => {
    await shell.openExternal(url)
  })
  handle('system:showItemInFolder', ({ path }) => {
    shell.showItemInFolder(path)
  })
  handle('system:pickFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  // --- settings ---------------------------------------------------------------
  handle('settings:get', () => ctx.settings.get())
  handle('settings:set', ({ patch }) => {
    const next = ctx.settings.set(patch)
    const locale =
      next.locale === 'system' ? matchLocale(app.getLocale()) : next.locale
    if (SUPPORTED_LOCALES.includes(locale) && locale !== ctx.i18n.getLocale()) {
      ctx.i18n.setLocale(locale)
      ctx.rebuildMenu()
    }
    return next
  })

  // --- hub --------------------------------------------------------------------
  handle('hub:search', ({ query }) => ctx.hub.searchRepos(query))
  handle('hub:papers', (req) => ctx.hub.getDailyPapers(req?.cursor))
  handle('hub:repoDetail', ({ kind, repoId }) => ctx.hub.getRepoDetail(kind, repoId))
  handle('hub:readme', ({ kind, repoId, revision }) => ctx.hub.getReadme(kind, repoId, revision))
  handle('hub:fileTree', ({ kind, repoId, revision, path }) =>
    ctx.hub.getFileTree(kind, repoId, revision, path)
  )
  handle('hub:discussions', ({ kind, repoId, type, status }) =>
    ctx.hub.listDiscussions(kind, repoId, { type, status })
  )
  handle('hub:discussionDiff', ({ kind, repoId, num }) =>
    ctx.hub.getDiscussionDiff(kind, repoId, num)
  )
  handle('hub:posts', (req) => ctx.hub.getPosts(req?.cursor))
  handle('hub:discussionDetail', ({ kind, repoId, num }) =>
    ctx.hub.getDiscussion(kind, repoId, num)
  )
  handle('hub:discussionComment', ({ kind, repoId, num, comment }) =>
    ctx.hub.commentOnDiscussion(kind, repoId, num, comment)
  )
  handle('hub:notifications', () => ctx.hub.getNotifications())
  handle('hub:fileText', ({ kind, repoId, path, revision, maxBytes }) =>
    ctx.hub.getFileText(kind, repoId, path, revision, maxBytes)
  )
  handle('hub:safetensorsHeader', ({ kind, repoId, path, revision }) =>
    ctx.hub.getSafetensorsHeader(kind, repoId, path, revision)
  )
  handle('hub:datasetSplits', ({ repoId }) => ctx.hub.getDatasetSplits(repoId))
  handle('hub:searchUsers', ({ query }) => ctx.hub.searchUsers(query))
  handle('hub:inferenceAvailable', ({ repoId }) => ctx.hub.isInferenceAvailable(repoId))
  handle('hub:datasetRows', ({ repoId, config, split, offset, length }) =>
    ctx.hub.getDatasetRows(repoId, config, split, offset, length)
  )

  // --- auth ---------------------------------------------------------------------
  handle('auth:getState', () => ctx.auth.getState())
  handle('auth:signIn', () => ctx.auth.signIn())
  handle('auth:signOut', () => ctx.auth.signOut())

  // --- local library --------------------------------------------------------------
  handle('favorites:list', () => ctx.library.listFavorites())
  handle('favorites:add', ({ summary }) => ctx.library.addFavorite(summary))
  handle('favorites:remove', ({ kind, repoId }) => ctx.library.removeFavorite(kind, repoId))
  handle('history:list', () => ctx.library.listHistory())
  handle('history:record', ({ summary }) => ctx.library.recordHistory(summary))
  handle('history:clear', () => ctx.library.clearHistory())

  // --- downloads -------------------------------------------------------------------
  handle('downloads:list', () => ctx.downloads.list())
  handle('downloads:start', ({ request }) => ctx.downloads.start(request))
  handle('downloads:pause', ({ id }) => ctx.downloads.pause(id))
  handle('downloads:resume', ({ id }) => ctx.downloads.resume(id))
  handle('downloads:cancel', ({ id }) => ctx.downloads.cancel(id))
  handle('downloads:remove', ({ id }) => ctx.downloads.remove(id))

  // --- cache -------------------------------------------------------------------------
  handle('cache:scan', () => ctx.cache.scan())
  handle('cache:deleteRevisions', ({ repoPath, commitHashes }) =>
    ctx.cache.deleteRevisions(repoPath, commitHashes)
  )

  // --- follows & inbox ------------------------------------------------------------------
  handle('follows:list', () => ctx.library.listFollows())
  handle('follows:add', ({ type, target }) => ctx.library.addFollow(type, target))
  handle('follows:remove', ({ id }) => ctx.library.removeFollow(id))
  handle('inbox:list', () => ctx.library.listInbox())
  handle('inbox:markRead', ({ ids }) => ctx.library.markInboxRead(ids))
  handle('inbox:clear', () => ctx.library.clearInbox())
  handle('inbox:pollNow', async () => ({ added: await ctx.follows.poll() }))

  // --- phase E ----------------------------------------------------------------------------
  handle('export:targets', () => detectExportTargets())
  handle('export:run', ({ tool, kind, repoId, filePath }) =>
    runExport(tool, kind, repoId, filePath, { cacheDir: ctx.cache.cacheDir() })
  )
  handle('upload:createRepo', ({ request }) => {
    const state = ctx.auth.getState()
    return createRepoAndUpload(request, {
      accessToken: ctx.auth.accessToken(),
      username: state.status === 'signedIn' ? state.user.name : undefined,
      broadcast: ctx.broadcast
    })
  })
  handle('inference:run', ({ request }) => runInference(request, ctx.auth.accessToken()))
  handle('inference:stream', ({ id, request }) =>
    runInferenceStream(id, request, {
      accessToken: ctx.auth.accessToken(),
      broadcast: ctx.broadcast
    })
  )
  handle('inference:cancel', ({ id }) => {
    cancelInference(id)
  })
}
