import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, FileText, GitBranch, Inbox, Plus, RefreshCw, User, X } from 'lucide-react'
import type { FollowTargetType, InboxItem } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { cn, formatRelativeTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useToasts } from '@/components/ui/toaster'
import { resolveLocale, useAppStore } from '@/stores/app'

const FOLLOW_ICON: Record<FollowTargetType, React.ComponentType<{ className?: string }>> = {
  user: User,
  org: User,
  repo: GitBranch,
  papers: FileText
}

export function InboxPage(): React.JSX.Element {
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
    mutationFn: (id: string) => invoke('follows:remove', { id }),
    onSuccess: (list) => queryClient.setQueryData(['follows'], list)
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
    <div className="flex h-full min-w-0">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-5 pt-5 pb-2">
          <h1 className="text-[15px] font-semibold">{t('inbox:title')}</h1>
          {unread.length > 0 && (
            <Badge variant="primary" className="nums">
              {unread.length}
            </Badge>
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
              className={cn(
                'flex w-full items-start gap-2.5 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-panel',
                !item.readAt && 'bg-primary/5'
              )}
            >
              <span
                className={cn(
                  'mt-[7px] size-1.5 shrink-0 rounded-full',
                  item.readAt ? 'bg-transparent' : 'bg-primary'
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <Badge variant="outline" className="min-w-14 justify-center">
                    {t(`inbox:kind.${item.kind}`)}
                  </Badge>
                  <span className="min-w-0 truncate text-[13px] font-medium">{item.title}</span>
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

      <aside className="flex w-72 shrink-0 flex-col gap-3 border-l p-4">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold">
          <Bell className="size-4 text-ink-faint" aria-hidden />
          {t('inbox:follows.title')}
        </h2>
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
              else if (papersFollow) removeFollow.mutate(papersFollow.id)
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
                  className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-panel"
                >
                  <Icon className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{follow.target}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={t('common:remove')}
                    onClick={() => removeFollow.mutate(follow.id)}
                  >
                    <X className="size-3.5" aria-hidden />
                  </Button>
                </div>
              )
            })}
        </div>
      </aside>
    </div>
  )
}
