import { useTranslation } from 'react-i18next'
import { openExternal } from '@/lib/ipc'
import { useToasts } from '@/components/ui/toaster'
import { useAppStore } from '@/stores/app'

export interface WatchSyncTarget {
  username: string
  /** 24-hex Hub id; resolved via hub:userOverview when absent. */
  internalId?: string
  isOrg?: boolean
}

/**
 * Follow write-through to the Hub's watch list, shared by the Inbox
 * manage-follows dialog. The local follow is the primary feature and always wins.
 *
 * Live-verified 2026-07-11 against PATCH /api/settings/watch: token-based
 * ADD and DELETE of real user/org targets are SILENTLY IGNORED — HTTP 200,
 * but the list never changes (write-role and fine-grained tokens alike).
 * Only the browser cookie session can mutate watches. So we don't fire a
 * request we know is a no-op: we tell the user where the working Watch
 * button lives.
 */
export function useWatchSync(): (action: 'add' | 'delete', targets: WatchSyncTarget[]) => void {
  const { t } = useTranslation(['profile'])
  const push = useToasts((s) => s.push)
  const auth = useAppStore((s) => s.auth)
  const signedIn = auth.status === 'signedIn'

  return (_action, targets) => {
    if (!signedIn || targets.length === 0) return
    push(t('profile:watchSyncNotApplied'), 'info', {
      action: {
        label: t('profile:watchOnHub'),
        onClick: () => openExternal(`https://huggingface.co/${targets[0]!.username}`)
      }
    })
  }
}
