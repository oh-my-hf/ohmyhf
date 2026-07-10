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
import type { AppDatabase } from './db'
import type { DownloadManager } from './downloads'
import type { FollowsPoller } from './follows'
import type { MainI18n } from './i18n'
import type { Library } from './library'
import { clearLocalAppData } from './privacy'
import type { SettingsStore } from './settings'
import type { UpdateManager } from './updater'
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
  db: AppDatabase
  hub: HubClient
  auth: AuthManager
  settings: SettingsStore
  library: Library
  downloads: DownloadManager
  cache: CacheManager
  follows: FollowsPoller
  updater: UpdateManager
  i18n: MainI18n
  rebuildMenu: () => void
  broadcast: <C extends IpcEventChannel>(channel: C, payload: IpcEventPayload<C>) => void
  applyNetworkSettings: (
    next: { hubEndpoint: string | null; proxyUrl: string | null },
    prev: { hubEndpoint: string | null; proxyUrl: string | null }
  ) => Promise<void>
  applyDesktopSettings: (
    next: { launchAtLogin: boolean; closeToTray: boolean },
    prev: { launchAtLogin: boolean; closeToTray: boolean }
  ) => void
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

  // --- updater --------------------------------------------------------------
  handle('updater:getState', () => ctx.updater.getState())
  handle('updater:check', () => ctx.updater.checkForUpdates())
  handle('updater:download', () => ctx.updater.downloadUpdate())
  handle('updater:install', async () => {
    const state = ctx.updater.getState()
    const version =
      state.status === 'ready' ||
      (state.status === 'error' && state.operation === 'install' && state.availableVersion)
        ? state.availableVersion
        : null
    if (!version) return ctx.updater.installUpdate()

    const result = await dialog.showMessageBox({
      type: 'question',
      title: ctx.i18n.t('dialogs.updateInstallTitle'),
      message: ctx.i18n.t('dialogs.updateInstallMessage', { version }),
      detail: ctx.i18n.t('dialogs.updateInstallDetail'),
      buttons: [
        ctx.i18n.t('dialogs.updateInstallButton'),
        ctx.i18n.t('dialogs.updateInstallCancel')
      ],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    })
    if (result.response === 0) await ctx.updater.installUpdate()
  })

  // --- settings ---------------------------------------------------------------
  handle('settings:get', () => ctx.settings.get())
  handle('settings:set', async ({ patch }) => {
    const prev = ctx.settings.get()
    const next = ctx.settings.set(patch)
    const locale = next.locale === 'system' ? matchLocale(app.getLocale()) : next.locale
    if (SUPPORTED_LOCALES.includes(locale) && locale !== ctx.i18n.getLocale()) {
      ctx.i18n.setLocale(locale)
      ctx.rebuildMenu()
    }
    await ctx.applyNetworkSettings(
      { hubEndpoint: next.hubEndpoint, proxyUrl: next.proxyUrl },
      { hubEndpoint: prev.hubEndpoint, proxyUrl: prev.proxyUrl }
    )
    ctx.applyDesktopSettings(
      { launchAtLogin: next.launchAtLogin, closeToTray: next.closeToTray },
      { launchAtLogin: prev.launchAtLogin, closeToTray: prev.closeToTray }
    )
    return next
  })

  handle('privacy:clearLocalData', async (req) => {
    const signOut = req.signOut === true
    ctx.downloads.clearAll()
    clearLocalAppData(ctx.db, { signOut })
    if (signOut) {
      await ctx.auth.signOut()
    }
    return { cleared: true as const, signedOut: signOut }
  })

  handle('network:testConnection', async () => {
    try {
      await ctx.hub.searchRepos({ kind: 'model', sort: 'trending', limit: 1 })
      return { ok: true as const }
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  })

  // --- hub --------------------------------------------------------------------
  handle('hub:search', ({ query }) => ctx.hub.searchRepos(query))
  handle('hub:papers', (req) => ctx.hub.getDailyPapers(req?.cursor))
  handle('hub:paper', ({ paperId }) => ctx.hub.getPaper(paperId))
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
  handle('hub:recentActivity', (req) => ctx.hub.getRecentActivity(req?.cursor))
  handle('hub:postDetail', ({ author, slug }) => ctx.hub.getPostDetail(author, slug))
  handle('hub:userOverview', ({ username }) => ctx.hub.getUserOverview(username))
  handle('hub:userFollowing', ({ username }) => ctx.hub.getUserFollowing(username))
  handle('hub:orgMembers', ({ org, limit }) => ctx.hub.getOrgMembers(org, limit))
  handle('hub:discussionDetail', ({ kind, repoId, num }) =>
    ctx.hub.getDiscussion(kind, repoId, num)
  )
  handle('hub:discussionComment', ({ kind, repoId, num, comment }) =>
    ctx.hub.commentOnDiscussion(kind, repoId, num, comment)
  )
  handle('hub:notifications', (req) => ctx.hub.getNotifications(req?.page))
  handle('hub:notificationsMarkRead', ({ discussionIds, read }) =>
    ctx.hub.markNotificationsRead(discussionIds, read)
  )
  handle('hub:notificationsClear', () => ctx.hub.clearNotifications())
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

  // --- hub: collections ---------------------------------------------------------
  handle('hub:collections', ({ owner }) => ctx.hub.listCollections(owner))
  handle('hub:collection', ({ slug }) => ctx.hub.getCollection(slug))
  handle('hub:collectionCreate', (input) => ctx.hub.createCollection(input))
  handle('hub:collectionUpdate', ({ slug, patch }) => ctx.hub.updateCollection(slug, patch))
  handle('hub:collectionDelete', ({ slug }) => ctx.hub.deleteCollection(slug))
  handle('hub:collectionAddItem', ({ slug, item, note }) =>
    ctx.hub.addCollectionItem(slug, item, note)
  )
  handle('hub:collectionUpdateItem', ({ slug, itemId, note, position }) =>
    ctx.hub.updateCollectionItem(slug, itemId, { note, position })
  )
  handle('hub:collectionRemoveItem', ({ slug, itemId }) =>
    ctx.hub.removeCollectionItem(slug, itemId)
  )

  // --- hub: repo administration ---------------------------------------------------
  handle('hub:watchUpdate', (changes) => ctx.hub.updateWatch(changes))
  handle('hub:myRepos', () => ctx.hub.listMyRepos())
  handle('hub:repoSettingsUpdate', ({ kind, repoId, patch }) =>
    ctx.hub.updateRepoSettings(kind, repoId, patch)
  )
  handle('hub:repoMove', ({ kind, fromRepo, toRepo }) => ctx.hub.moveRepo(kind, fromRepo, toRepo))
  handle('hub:repoDelete', ({ kind, repoId }) => ctx.hub.deleteRepo(kind, repoId))
  handle('hub:repoDuplicate', ({ repoId, toRepo, private: isPrivate }) =>
    ctx.hub.duplicateSpace(repoId, toRepo, { private: isPrivate })
  )
  handle('hub:branchCreate', ({ kind, repoId, branch, startingPoint }) =>
    ctx.hub.createBranch(kind, repoId, branch, startingPoint)
  )
  handle('hub:branchDelete', ({ kind, repoId, branch }) =>
    ctx.hub.deleteBranch(kind, repoId, branch)
  )
  handle('hub:tagCreate', ({ kind, repoId, tag, revision, message }) =>
    ctx.hub.createTag(kind, repoId, tag, revision, message)
  )
  handle('hub:tagDelete', ({ kind, repoId, tag }) => ctx.hub.deleteTag(kind, repoId, tag))
  handle('hub:accessRequests', ({ kind, repoId, status }) =>
    ctx.hub.listAccessRequests(kind, repoId, status)
  )
  handle('hub:accessRequestHandle', ({ kind, repoId, user, status, rejectionReason }) =>
    ctx.hub.handleAccessRequest(kind, repoId, user, status, rejectionReason)
  )
  handle('hub:accessRequestGrant', ({ kind, repoId, user }) =>
    ctx.hub.grantAccess(kind, repoId, user)
  )

  // --- hub: space administration ----------------------------------------------------
  handle('hub:spaceSecrets', ({ repoId }) => ctx.hub.listSpaceSecrets(repoId))
  handle('hub:spaceSecretSet', ({ repoId, key, value, description }) =>
    ctx.hub.setSpaceSecret(repoId, key, value, description)
  )
  handle('hub:spaceSecretDelete', ({ repoId, key }) => ctx.hub.deleteSpaceSecret(repoId, key))
  handle('hub:spaceVariables', ({ repoId }) => ctx.hub.listSpaceVariables(repoId))
  handle('hub:spaceVariableSet', ({ repoId, key, value, description }) =>
    ctx.hub.setSpaceVariable(repoId, key, value, description)
  )
  handle('hub:spaceVariableDelete', ({ repoId, key }) => ctx.hub.deleteSpaceVariable(repoId, key))
  handle('hub:spaceLogs', ({ repoId, logType }) => ctx.hub.getSpaceLogsSnapshot(repoId, logType))
  handle('hub:spaceRestart', ({ repoId, factory }) => ctx.hub.restartSpace(repoId, factory))

  // --- hub: community & billing --------------------------------------------------------
  handle('hub:likeSet', ({ kind, repoId, liked }) => ctx.hub.setLike(kind, repoId, liked))
  handle('hub:userLikes', ({ username }) => ctx.hub.getUserLikes(username))
  handle('hub:postComment', ({ author, slug, comment, replyToCommentId }) =>
    ctx.hub.commentOnPost(author, slug, comment, replyToCommentId)
  )
  handle('hub:paperComment', ({ paperId, comment, replyToCommentId }) =>
    ctx.hub.commentOnPaper(paperId, comment, replyToCommentId)
  )
  handle('hub:prMerge', ({ kind, repoId, num, comment }) =>
    ctx.hub.mergePullRequest(kind, repoId, num, comment)
  )
  handle('hub:discussionStatusSet', ({ kind, repoId, num, status, comment }) =>
    ctx.hub.setDiscussionStatus(kind, repoId, num, status, comment)
  )
  handle('hub:discussionTitleSet', ({ kind, repoId, num, title }) =>
    ctx.hub.setDiscussionTitle(kind, repoId, num, title)
  )
  handle('hub:billingUsage', () => ctx.hub.getBillingUsage())

  // --- auth ---------------------------------------------------------------------
  handle('auth:getState', () => ctx.auth.getState())
  handle('auth:signIn', () => ctx.auth.signIn())
  handle('auth:cancelSignIn', () => ctx.auth.cancelSignIn())
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
