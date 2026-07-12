import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  BellOff,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileText,
  GitBranch,
  GitPullRequest,
  LogIn,
  MessageSquare,
  ShieldAlert
} from 'lucide-react'
import type { HubNotification } from '@oh-my-huggingface/shared'
import { isAuthError } from '@/lib/errors'
import { invoke, openExternal } from '@/lib/ipc'
import { cn, formatRelativeTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useToasts } from '@/components/ui/toaster'
import { resolveLocale, useAppStore } from '@/stores/app'

/** The Hub serves a fixed 20 notifications per page (see HubClient.getNotifications). */
const PAGE_SIZE = 20

/**
 * Hub notification inbox. Requires a User Access Token with permission to
 * read /api/notifications; insufficient tokens surface the unauthorized empty
 * state with a link to Hub settings and the web inbox.
 */
const HUB_NOTIFICATIONS_URL = 'https://huggingface.co/notifications'

const KIND_ICON: Record<HubNotification['kind'], React.ComponentType<{ className?: string }>> = {
  repo: GitBranch,
  paper: FileText,
  post: MessageSquare,
  org: Building2,
  other: Bell
}

const STATUS_VARIANT = {
  open: 'success',
  closed: 'error',
  merged: 'select',
  draft: 'neutral'
} as const

export function HubNotificationsPanel(): React.JSX.Element {
  const { t } = useTranslation(['inbox', 'common', 'detail'])
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)
  const auth = useAppStore((s) => s.auth)
  const openSettings = useAppStore((s) => s.openSettings)
  const signedIn = auth.status === 'signedIn'
  const [page, setPage] = useState(0)
  const [confirmClear, setConfirmClear] = useState(false)

  const notifications = useQuery({
    queryKey: ['hub-notifications', page],
    queryFn: () => invoke('hub:notifications', { page }),
    enabled: signedIn,
    placeholderData: keepPreviousData,
    // A 401/403 is a capability gap, not a transient failure — do not hammer the API.
    retry: (failureCount, error) => failureCount < 2 && !isAuthError(error.message)
  })

  const markRead = useMutation({
    // An empty id list marks every notification as read on the Hub.
    mutationFn: (discussionIds: string[]) =>
      invoke('hub:notificationsMarkRead', { discussionIds, read: true }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['hub-notifications'] }),
    onError: (err) => push(err.message, 'error')
  })
  const clearAll = useMutation({
    mutationFn: () => invoke('hub:notificationsClear', undefined),
    onSuccess: () => {
      setConfirmClear(false)
      setPage(0)
      void queryClient.invalidateQueries({ queryKey: ['hub-notifications'] })
    },
    onError: (err) => push(err.message, 'error')
  })

  const openItem = (item: HubNotification): void => {
    // Items without a discussion-backed id CANNOT be marked read individually:
    // the Hub exposes no per-notification id and mark-as-read accepts only
    // discussion ids (openapi-verified 2026-07-12; see
    // HubClient.markNotificationsRead). They stay unread until "mark all
    // read", whose applyToAll form covers them.
    if (!item.read && item.discussionId !== undefined) markRead.mutate([item.discussionId])
    if (item.route !== undefined) navigate(item.route)
  }

  if (!signedIn) {
    return (
      <EmptyState
        icon={LogIn}
        title={t('inbox:hub.signIn.title')}
        body={t('inbox:hub.signIn.body')}
        action={
          <Button variant="cta" size="sm" onClick={() => openSettings('account')}>
            {t('inbox:hub.signIn.action')}
          </Button>
        }
      />
    )
  }

  if (notifications.isError) {
    // The Hub refusing this token is a capability gap (old session, missing
    // grant), not a transient error — teach the fix instead of toasting.
    if (isAuthError(notifications.error.message)) {
      return (
        <EmptyState
          icon={ShieldAlert}
          title={t('inbox:hub.unauthorized.title')}
          body={t('inbox:hub.unauthorized.body')}
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="cta" size="sm" onClick={() => openSettings('account')}>
                {t('inbox:hub.unauthorized.tokenAction')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openExternal(HUB_NOTIFICATIONS_URL)}
              >
                {t('inbox:hub.unauthorized.action')}
              </Button>
            </div>
          }
        />
      )
    }
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <p className="max-w-sm text-[12.5px] text-ink-muted">{notifications.error.message}</p>
        <Button size="sm" onClick={() => void notifications.refetch()}>
          {t('common:retry')}
        </Button>
      </div>
    )
  }

  const items = notifications.data?.items ?? []
  const total = notifications.data?.count ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const unreadOnPage = items.filter((item) => !item.read).length

  return (
    <div className="flex h-full min-h-0 flex-col">
      {items.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 px-5 pb-2">
          {unreadOnPage > 0 && (
            <span className="nums inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] leading-none font-semibold text-brand-ink">
              {unreadOnPage}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              loading={markRead.isPending}
              onClick={() => markRead.mutate([])}
            >
              {t('inbox:markAllRead')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>
              {t('inbox:hub.clearAll')}
            </Button>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        {notifications.isPending && (
          <div className="flex flex-col gap-1 p-1">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        )}
        {notifications.data !== undefined && items.length === 0 && (
          <EmptyState
            icon={BellOff}
            title={t('inbox:hub.empty.title')}
            body={t('inbox:hub.empty.body')}
          />
        )}
        {items.map((item, index) => {
          const Icon = item.isPullRequest === true ? GitPullRequest : KIND_ICON[item.kind]
          const status = item.discussionStatus
          return (
            <button
              key={item.discussionId ?? `${item.kind}-${index}`}
              type="button"
              onClick={() => openItem(item)}
              className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 outline-none hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            >
              <span
                className={cn(
                  'mt-[7px] size-1.5 shrink-0 rounded-full',
                  item.read ? 'bg-transparent' : 'bg-brand'
                )}
                aria-hidden
              />
              <Icon className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'min-w-0 truncate text-[13px] font-medium',
                      item.read ? 'text-ink' : 'text-ink-strong'
                    )}
                  >
                    {item.title}
                  </span>
                  {status !== undefined && (
                    <Badge variant={STATUS_VARIANT[status]}>
                      {t(`detail:discussions.status.${status}`)}
                    </Badge>
                  )}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-muted">
                  <Badge variant="outline" className="min-w-14 justify-center">
                    {t(`inbox:hub.kind.${item.kind}`)}
                  </Badge>
                  {item.repoId !== undefined && (
                    <span className="min-w-0 truncate">{item.repoId}</span>
                  )}
                </span>
              </span>
              {item.participants !== undefined && item.participants.length > 0 && (
                <span className="mt-0.5 flex shrink-0 -space-x-1.5" aria-hidden>
                  {item.participants
                    .slice(0, 3)
                    .map((participant) =>
                      participant.avatar !== undefined ? (
                        <img
                          key={participant.user}
                          src={participant.avatar}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="size-4 rounded-full border bg-panel"
                        />
                      ) : null
                    )}
                </span>
              )}
              <span className="nums shrink-0 text-[11px] text-ink-faint">
                {formatRelativeTime(item.updatedAt, locale)}
              </span>
            </button>
          )
        })}
      </div>
      {pageCount > 1 && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border-card px-4 py-1.5">
          <span className="nums text-[12px] text-ink-muted">
            {t('inbox:hub.pageOf', { page: page + 1, pages: pageCount })}
          </span>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t('inbox:hub.pagePrev')}
              disabled={page === 0 || notifications.isFetching}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t('inbox:hub.pageNext')}
              disabled={page + 1 >= pageCount || notifications.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      )}
      <Dialog open={confirmClear} onOpenChange={(open) => !open && setConfirmClear(false)}>
        <DialogContent>
          <DialogTitle className="text-[14px] font-semibold">
            {t('inbox:hub.confirmClear.title')}
          </DialogTitle>
          <DialogDescription className="mt-2 text-[13px] text-ink-muted">
            {t('inbox:hub.confirmClear.body')}
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmClear(false)}>
              {t('common:cancel')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={clearAll.isPending}
              onClick={() => clearAll.mutate()}
            >
              {t('inbox:hub.confirmClear.confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
