import { useTranslation } from 'react-i18next'
import { invoke, openExternal } from '@/lib/ipc'
import { useToasts } from '@/components/ui/toaster'
import { useAppStore } from '@/stores/app'

export interface WatchSyncTarget {
  username: string
  /** 24-hex Hub id; resolved via hub:userOverview when absent. */
  internalId?: string
  isOrg?: boolean
}

/**
 * Follow write-through to the Hub's watch list, shared by every follow entry
 * point (UserPage and the Inbox manage-follows dialog). The local follow is
 * the primary feature and always wins.
 *
 * Live-verified 2026-07-11 against PATCH /api/settings/watch: token-based
 * ADDS are SILENTLY IGNORED — HTTP 200, but the entry never materializes
 * (users and orgs alike; still absent on a re-read 8 s later; write-role
 * token — fine-grained and OAuth don't even pass authorization, 403). Only
 * the browser cookie session can add watches. So on follow we don't fire a
 * request we know is a no-op: we tell the user where the working Watch button
 * lives. Unwatch PATCHes are still sent best-effort and quietly — deletes are
 * unverified server-side, and a stale Hub watch is manageable on the Hub.
 */
export function useWatchSync(): (action: 'add' | 'delete', targets: WatchSyncTarget[]) => void {
  const { t } = useTranslation(['profile'])
  const push = useToasts((s) => s.push)
  const auth = useAppStore((s) => s.auth)
  const signedIn = auth.status === 'signedIn'

  return (action, targets) => {
    if (!signedIn || targets.length === 0) return
    if (action === 'add') {
      push(t('profile:watchSyncNotApplied'), 'info', {
        action: {
          label: t('profile:watchOnHub'),
          onClick: () => openExternal(`https://huggingface.co/${targets[0]!.username}`)
        }
      })
      return
    }
    void (async () => {
      const resolved: Array<{ id: string; type: 'user' | 'org' }> = []
      for (const target of targets) {
        let id = target.internalId
        let isOrg = target.isOrg
        if (id === undefined || id === '') {
          try {
            const overview = await invoke('hub:userOverview', { username: target.username })
            id = overview.internalId
            isOrg = overview.isOrg
          } catch {
            continue // profile lookup failed; nothing to unwatch
          }
        }
        if (id !== undefined && id !== '') {
          resolved.push({ id, type: isOrg === true ? 'org' : 'user' })
        }
      }
      if (resolved.length === 0) return
      try {
        await invoke('hub:watchUpdate', { delete: resolved })
      } catch {
        // Quiet by design: the local unfollow already succeeded, and no token
        // kind is guaranteed a working watch delete.
      }
    })()
  }
}
