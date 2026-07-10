import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CloudDownload, FileText, GitBranch, Inbox, Plus, RefreshCw, User, X } from 'lucide-react'
import type { FollowTargetType, InboxItem } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { cn, formatRelativeTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { pushUndo, useToasts } from '@/components/ui/toaster'
import { HubNotificationsPanel } from '@/components/inbox/HubNotificationsPanel'
import { resolveLocale, useAppStore } from '@/stores/app'

const FOLLOW_ICON: Record<FollowTargetType, React.ComponentType<{ className?: string }>> = {
  user: User,
  org: User,
  repo: GitBranch,
  papers: FileText
}

type InboxTab = 'hub' | 'local'

function TabButton({
  active,
  onClick,
  label
}: {
  active: boolean
  onClick: () => void
  label: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition-colors duration-150',
        active ? 'border-border bg-bg text-ink-strong' : 'border-transparent text-ink-muted hover:text-ink'
      )}
    >
      {label}
    </button>
  )
}

export function InboxPage(): React.JSX.Element {
  const { t } = useTranslation(['inbox'])
  const auth = useAppStore((s) => s.auth)
  // The Hub inbox is the primary surface once an account is connected; the
  // local follows feed stays fully available in the second tab.
  const [tab, setTab] = useState<InboxTab>(auth.status === 'signedIn' ? 'hub' : 'local')

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 px-5 pt-5 pb-3">
        <h1 className="text-smd font-semibold text-ink-strong">{t('inbox:title')}</h1>
        <div className="flex items-center gap-0.5 rounded-lg border bg-panel p-0.5">
          <TabButton
            active={tab === 'hub'}
            onClick={() => setTab('hub')}
            label={t('inbox:tabs.hub')}
          />
          <TabButton
            active={tab === 'local'}
            onClick={() => setTab('local')}
            label={t('inbox:tabs.local')}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'hub' ? <HubNotificationsPanel /> : <LocalFollowsFeed />}
      </div>
    </div>
  )
}

function LocalFollowsFeed(): React.JSX.Element {
  const { t } = useTranslation(['inbox', 'common'])
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)
  const [target, setTarget] = useState('')

  const inbox = useQuery({ queryKey: ['inbox'], queryFn: () => invoke('inbox:list', undefined) })
  const follows = useQuery({
    queryKey: ['follows'],
    queryFn: () => invoke('follows:list', undefined)
  })

  const markRead = useMutation({
    mutationFn: (ids: string[]) => invoke('inbox:markRead', { ids }),
    onSuccess: (items) => queryClient.setQueryData(['inbox'], items)
  })
  const clear = useMutation({
    mutationFn: () => invoke('inbox:clear', undefined),
    onSuccess: (items) => queryClient.setQueryData(['inbox'], items)
  })
  const pollNow = useMutation({
    mutationFn: () => invoke('inbox:pollNow', undefined),
    onSuccess: ({ added }) => {
      push(t('inbox:checked', { count: added }), 'info')
      void queryClient.invalidateQueries({ queryKey: ['inbox'] })
    }
  })
  const addFollow = useMutation({
    mutationFn: (args: { type: FollowTargetType; target: string }) => invoke('follows:add', args),
    onSuccess: (list) => {
      queryClient.setQueryData(['follows'], list)
      setTarget('')
    }
  })
  const removeFollow = useMutation({
    mutationFn: (follow: { id: string; type: FollowTargetType; target: string }) =>
      invoke('follows:remove', { id: follow.id }),
    onSuccess: (list, follow) => {
      queryClient.setQueryData(['follows'], list)
      // The papers toggle is its own undo affordance; only rows get the toast.
      if (follow.type === 'papers') return
      pushUndo(t('inbox:follows.removed', { target: follow.target }), {
        label: t('common:undo'),
        onClick: () => {
          void invoke('follows:add', { type: follow.type, target: follow.target })
            .then((restored) => queryClient.setQueryData(['follows'], restored))
            .catch((err: Error) => push(err.message, 'error'))
        }
      })
    }
  })

  // Pull the REAL Hugging Face following list of the signed-in account into the
  // local follow store so the notification poller tracks those authors too.
  const auth = useAppStore((s) => s.auth)
  const me = auth.status === 'signedIn' ? auth.user.name : undefined
  const importFromHub = useMutation({
    mutationFn: async () => {
      if (!me) return 0
      const following = await invoke('hub:userFollowing', { username: me })
      const existing = new Set(
        (follows.data ?? [])
          .filter((f) => f.type === 'user' || f.type === 'org')
          .map((f) => f.target.toLowerCase())
      )
      let added = 0
      let list = follows.data ?? []
      for (const account of following) {
        if (existing.has(account.name.toLowerCase())) continue
        list = await invoke('follows:add', {
          type: account.isOrg ? 'org' : 'user',
          target: account.name
        })
        added++
      }
      queryClient.setQueryData(['follows'], list)
      return added
    },
    onSuccess: (added) => push(t('inbox:follows.imported', { count: added ?? 0 }), 'success'),
    onError: (err) => push(err.message, 'error')
  })

  const submitFollow = (): void => {
    const value = target.trim()
    if (!value) return
    if (/^(model|dataset|space):/.test(value)) {
      addFollow.mutate({ type: 'repo', target: value })
    } else {
      // Users and orgs share a namespace on the Hub; poll both the same way.
      addFollow.mutate({ type: 'user', target: value })
    }
  }

  const papersFollow = follows.data?.find((f) => f.type === 'papers')
  const unread = inbox.data?.filter((i) => !i.readAt) ?? []

  const openItem = (item: InboxItem): void => {
    markRead.mutate([item.id])
    navigate(item.route)
  }

  return (
    <div className="flex h-full min-h-0 min-w-0">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-5 pb-2">
          {unread.length > 0 && (
            <span className="nums inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] leading-none font-semibold text-brand-ink">
              {unread.length}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              loading={pollNow.isPending}
              onClick={() => pollNow.mutate()}
            >
              <RefreshCw className="size-3.5" aria-hidden />
              {pollNow.isPending ? t('inbox:checking') : t('inbox:checkNow')}
            </Button>
            {unread.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markRead.mutate(unread.map((i) => i.id))}
              >
                {t('inbox:markAllRead')}
              </Button>
            )}
            {(inbox.data?.length ?? 0) > 0 && (
              <Button variant="ghost" size="sm" onClick={() => clear.mutate()}>
                {t('inbox:clear')}
              </Button>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
          {inbox.data?.length === 0 && (
            <EmptyState icon={Inbox} title={t('inbox:empty.title')} body={t('inbox:empty.body')} />
          )}
          {inbox.data?.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openItem(item)}
              className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 hover:bg-panel"
            >
              <span
                className={cn(
                  'mt-[7px] size-1.5 shrink-0 rounded-full',
                  item.readAt ? 'bg-transparent' : 'bg-brand'
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <Badge variant="outline" className="min-w-14 justify-center">
                    {t(`inbox:kind.${item.kind}`)}
                  </Badge>
                  <span
                    className={cn(
                      'min-w-0 truncate text-[13px] font-medium',
                      item.readAt ? 'text-ink' : 'text-ink-strong'
                    )}
                  >
                    {item.title}
                  </span>
                </span>
                <span className="mt-0.5 line-clamp-2 block text-[12px] text-ink-muted">
                  {item.body}
                </span>
              </span>
              <span className="nums shrink-0 text-[11px] text-ink-faint">
                {formatRelativeTime(item.createdAt, locale)}
              </span>
            </button>
          ))}
        </div>
      </section>

      <aside className="flex w-72 shrink-0 flex-col gap-3 border-l border-border-card p-4">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink-strong">
          <Bell className="size-4 text-ink-faint" aria-hidden />
          {t('inbox:follows.title')}
        </h2>
        {me && (
          <Button
            variant="secondary"
            size="sm"
            loading={importFromHub.isPending}
            onClick={() => importFromHub.mutate()}
          >
            <CloudDownload className="size-3.5" aria-hidden />
            {t('inbox:follows.importFromHub')}
          </Button>
        )}
        <div className="flex gap-1.5">
          <Input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitFollow()}
            placeholder={t('inbox:follows.placeholder')}
          />
          <Button
            variant="secondary"
            size="icon"
            aria-label={t('inbox:follows.add')}
            disabled={target.trim() === ''}
            onClick={submitFollow}
          >
            <Plus className="size-4" aria-hidden />
          </Button>
        </div>
        <label className="flex items-center justify-between gap-2 text-[13px]">
          {t('inbox:follows.papers')}
          <Switch
            checked={Boolean(papersFollow)}
            onCheckedChange={(checked) => {
              if (checked) addFollow.mutate({ type: 'papers', target: 'daily' })
              else if (papersFollow) removeFollow.mutate(papersFollow)
            }}
          />
        </label>
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {follows.data?.filter((f) => f.type !== 'papers').length === 0 && (
            <p className="text-[12px] text-ink-faint">{t('inbox:follows.empty')}</p>
          )}
          {follows.data
            ?.filter((f) => f.type !== 'papers')
            .map((follow) => {
              const Icon = FOLLOW_ICON[follow.type]
              return (
                <div
                  key={follow.id}
                  className="flex h-6 shrink-0 items-center gap-1.5 rounded-lg border bg-linear-to-b from-btn-from to-btn-to pr-0.5 pl-2"
                >
                  <Icon className="size-3 shrink-0 text-ink-faint" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[12px]">{follow.target}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5 text-ink-faint"
                    aria-label={t('common:remove')}
                    onClick={() => removeFollow.mutate(follow)}
                  >
                    <X className="size-3" aria-hidden />
                  </Button>
                </div>
              )
            })}
        </div>
      </aside>
    </div>
  )
}
