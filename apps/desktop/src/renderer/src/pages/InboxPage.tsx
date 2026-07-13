import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  CloudDownload,
  FileText,
  GitBranch,
  Inbox,
  Plus,
  RefreshCw,
  User,
  X
} from 'lucide-react'
import type { FollowTargetType, InboxItem } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { cn, formatRelativeTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { pushUndo, useToasts } from '@/components/ui/toaster'
import { HubNotificationsPanel } from '@/components/inbox/HubNotificationsPanel'
import { QueryErrorState } from '@/components/errors/QueryErrorState'
import { useWatchSync } from '@/hooks/use-watch-sync'
import { resolveLocale, useAppStore } from '@/stores/app'
import { describeError } from '@/lib/errors'

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
        active
          ? 'border-border bg-bg text-ink-strong'
          : 'border-transparent text-ink-muted hover:text-ink'
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
    onSuccess: (items) => queryClient.setQueryData(['inbox'], items),
    onError: (err) => push(describeError(t, err), 'error')
  })
  const clear = useMutation({
    mutationFn: () => invoke('inbox:clear', undefined),
    onSuccess: (items) => queryClient.setQueryData(['inbox'], items),
    onError: (err) => push(describeError(t, err), 'error')
  })
  const pollNow = useMutation({
    mutationFn: () => invoke('inbox:pollNow', undefined),
    onSuccess: ({ added }) => {
      push(t('inbox:checked', { count: added }), 'info')
      void queryClient.invalidateQueries({ queryKey: ['inbox'] })
    },
    onError: (err) => push(describeError(t, err), 'error')
  })
  // Users and orgs get the Hub watch write-through (same as UserPage); repo
  // and papers follows stay local-only — the watch endpoint wants 24-hex ids
  // the app only resolves for accounts.
  const syncWatch = useWatchSync()
  const syncable = (type: FollowTargetType): boolean => type === 'user' || type === 'org'

  const addFollow = useMutation({
    mutationFn: (args: { type: FollowTargetType; target: string }) => invoke('follows:add', args),
    onSuccess: (list, args) => {
      queryClient.setQueryData(['follows'], list)
      if (syncable(args.type))
        syncWatch('add', [{ username: args.target, isOrg: args.type === 'org' }])
    },
    onError: (err) => push(describeError(t, err), 'error')
  })
  const removeFollow = useMutation({
    mutationFn: (follow: { id: string; type: FollowTargetType; target: string }) =>
      invoke('follows:remove', { id: follow.id }),
    onSuccess: (list, follow) => {
      queryClient.setQueryData(['follows'], list)
      if (syncable(follow.type))
        syncWatch('delete', [{ username: follow.target, isOrg: follow.type === 'org' }])
      // The papers toggle is its own undo affordance; only rows get the toast.
      if (follow.type === 'papers') return
      pushUndo(t('inbox:follows.removed', { target: follow.target }), {
        label: t('common:undo'),
        onClick: () => {
          void invoke('follows:add', { type: follow.type, target: follow.target })
            .then((restored) => {
              queryClient.setQueryData(['follows'], restored)
              if (syncable(follow.type))
                syncWatch('add', [{ username: follow.target, isOrg: follow.type === 'org' }])
            })
            .catch((err: Error) => push(describeError(t, err), 'error'))
        }
      })
    },
    onError: (err) => push(describeError(t, err), 'error')
  })

  // Pull the REAL Hugging Face following list of the signed-in account into the
  // local follow store so the notification poller tracks those authors too.
  // Deliberately NOT watch-synced: bulk-adding every social follow to the Hub
  // watch list would flood the user's Hub notifications; only explicit
  // per-account follow actions write through.
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
    onError: (err) => push(describeError(t, err), 'error')
  })

  const submitFollow = (): void => {
    const value = target.trim()
    if (!value) return
    // Clearing the draft belongs to THIS submit — the papers Switch shares the
    // mutation and must not wipe what the user is typing.
    const clearDraft = { onSuccess: () => setTarget('') }
    if (/^(model|dataset|space):/.test(value)) {
      addFollow.mutate({ type: 'repo', target: value }, clearDraft)
    } else {
      // Users and orgs share a namespace on the Hub; poll both the same way.
      addFollow.mutate({ type: 'user', target: value }, clearDraft)
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
            <span
              aria-label={t('inbox:unreadCount', { count: unread.length })}
              className="nums inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] leading-none font-semibold text-brand-ink"
            >
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
          {inbox.isPending ? (
            <div className="flex flex-col gap-1 p-1">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-14" />
              ))}
            </div>
          ) : inbox.isError ? (
            <QueryErrorState
              error={inbox.error}
              onRetry={() => void inbox.refetch()}
              title={t('inbox:local.loadError')}
              className="h-full"
            />
          ) : (
            <>
              {inbox.data.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title={t('inbox:empty.title')}
                  body={t('inbox:empty.body')}
                />
              ) : null}
              {inbox.data.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openItem(item)}
                  className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 outline-none hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
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
            </>
          )}
        </div>
      </section>

      <aside className="flex w-72 shrink-0 flex-col gap-3 border-l border-border-card p-4">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink-strong">
          <Bell className="size-4 text-ink-faint" aria-hidden />
          {t('inbox:follows.title')}
        </h2>
        {follows.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7" />
            <Skeleton className="h-8" />
            <Skeleton className="h-6" />
          </div>
        ) : follows.isError ? (
          <QueryErrorState
            error={follows.error}
            onRetry={() => void follows.refetch()}
            title={t('inbox:follows.loadError')}
            compact
            className="min-h-0 px-0"
          />
        ) : (
          <>
            {me ? (
              <Button
                variant="secondary"
                size="sm"
                loading={importFromHub.isPending}
                onClick={() => importFromHub.mutate()}
              >
                <CloudDownload className="size-3.5" aria-hidden />
                {t('inbox:follows.importFromHub')}
              </Button>
            ) : null}
            <div className="flex gap-1.5">
              <Input
                value={target}
                aria-label={t('inbox:follows.targetLabel')}
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
              {follows.data.filter((follow) => follow.type !== 'papers').length === 0 ? (
                <p className="text-[12px] text-ink-faint">{t('inbox:follows.empty')}</p>
              ) : null}
              {follows.data
                .filter((follow) => follow.type !== 'papers')
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
                        className="size-6 text-ink-faint"
                        aria-label={t('common:remove')}
                        onClick={() => removeFollow.mutate(follow)}
                      >
                        <X className="size-3" aria-hidden />
                      </Button>
                    </div>
                  )
                })}
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
