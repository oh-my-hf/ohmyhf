/**
 * Phase D: follow/inbox poller. Periodically checks followed users, orgs, repos,
 * and Daily Papers, writes new activity into the inbox, and raises system
 * notifications. Runs entirely in the main process on a timer; each poll is a
 * handful of cached API calls.
 */
import { Notification } from 'electron'
import type { Follow, InboxItem, RepoKind } from '@oh-my-huggingface/shared'
import type { HubClient } from '@oh-my-huggingface/hub-api'
import type { Library } from './library'
import type { MainI18n } from './i18n'
import type { SettingsStore } from './settings'

const ROUTE_PREFIX: Record<RepoKind, string> = {
  model: '/models',
  dataset: '/datasets',
  space: '/spaces'
}

export class FollowsPoller {
  private timer: NodeJS.Timeout | null = null
  private polling = false

  constructor(
    private readonly library: Library,
    private readonly hub: HubClient,
    private readonly settings: SettingsStore,
    private readonly i18n: MainI18n,
    private readonly broadcastInbox: (items: InboxItem[]) => void,
    private readonly onNotificationClick: (route: string) => void
  ) {}

  start(): void {
    this.schedule()
    this.settings.onChange(() => this.schedule())
  }

  private schedule(): void {
    if (this.timer) clearInterval(this.timer)
    const minutes = this.settings.get().pollIntervalMinutes
    this.timer = setInterval(() => void this.poll(), minutes * 60 * 1000)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Returns the number of new inbox items. */
  async poll(): Promise<number> {
    if (this.polling) return 0
    this.polling = true
    let added = 0
    try {
      for (const follow of this.library.listFollows()) {
        try {
          added += await this.pollOne(follow)
        } catch (err) {
          // One broken follow must not kill the whole poll cycle.
          console.warn(`[follows] poll failed for ${follow.type}:${follow.target}`, err)
        }
      }
    } finally {
      this.polling = false
    }
    if (added > 0) {
      const items = this.library.listInbox()
      this.broadcastInbox(items)
      this.notify(added, items)
    }
    return added
  }

  private async pollOne(follow: Follow): Promise<number> {
    const now = new Date().toISOString()
    const state = this.library.getFollowState(follow.id)
    let added = 0

    if (follow.type === 'user' || follow.type === 'org') {
      const since = follow.lastCheckedAt
      for (const kind of ['model', 'dataset', 'space'] as const) {
        const repos = await this.hub.listByAuthor(kind, follow.target, 10)
        for (const repo of repos) {
          if (!since || !repo.updatedAt) continue
          if (repo.updatedAt <= since) continue
          const isNew = repo.createdAt ? repo.createdAt > since : false
          if (
            this.library.addInboxItem({
              kind: isNew ? 'new-repo' : 'repo-update',
              title: repo.id,
              body: isNew
                ? `New ${kind} by ${follow.target}`
                : `${follow.target} updated this ${kind}`,
              route: `${ROUTE_PREFIX[kind]}/${repo.id}`,
              dedupeKey: `${follow.id}:${repo.id}:${repo.updatedAt}`
            })
          ) {
            added++
          }
        }
      }
    } else if (follow.type === 'repo') {
      const [kind, repoId] = splitRepoTarget(follow.target)
      if (kind && repoId) {
        const detail = await this.hub.getRepoDetail(kind, repoId)
        const last = state.lastModified as string | undefined
        if (detail.lastModified && last && detail.lastModified > last) {
          if (
            this.library.addInboxItem({
              kind: 'repo-update',
              title: repoId,
              body: `Repository updated`,
              route: `${ROUTE_PREFIX[kind]}/${repoId}`,
              dedupeKey: `${follow.id}:${detail.lastModified}`
            })
          ) {
            added++
          }
        }
        state.lastModified = detail.lastModified ?? last
      }
    } else if (follow.type === 'papers') {
      const seen = new Set((state.seenIds as string[] | undefined) ?? [])
      const page = await this.hub.getDailyPapers()
      const isFirstRun = seen.size === 0
      for (const paper of page.items) {
        if (seen.has(paper.id)) continue
        seen.add(paper.id)
        if (isFirstRun) continue // Seed silently on the first poll.
        if (
          this.library.addInboxItem({
            kind: 'paper',
            title: paper.title,
            body: paper.summary.slice(0, 200),
            route: `/papers/${paper.id}`,
            dedupeKey: `paper:${paper.id}`
          })
        ) {
          added++
        }
      }
      state.seenIds = [...seen].slice(-500)
    }

    this.library.setFollowState(follow.id, state, now)
    return added
  }

  private notify(added: number, items: InboxItem[]): void {
    if (!this.settings.get().notificationsEnabled || !Notification.isSupported()) return
    const first = items[0]
    const single = added === 1 && first
    const notification = new Notification({
      title: single
        ? this.i18n.t('notifications.inboxSingle', { title: first.title })
        : this.i18n.t('notifications.inboxUpdates', { count: added }),
      body: single ? first.body : ''
    })
    notification.on('click', () => this.onNotificationClick(single ? first.route : '/inbox'))
    notification.show()
  }
}

function splitRepoTarget(target: string): [RepoKind | null, string | null] {
  const idx = target.indexOf(':')
  if (idx === -1) return [null, null]
  const kind = target.slice(0, idx)
  if (kind !== 'model' && kind !== 'dataset' && kind !== 'space') return [null, null]
  return [kind, target.slice(idx + 1)]
}
