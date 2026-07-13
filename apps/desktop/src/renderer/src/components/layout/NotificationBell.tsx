import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import {
  normalizeHubEndpoint,
  type HubNotification,
  type InboxItem
} from '@oh-my-huggingface/shared'
import { isAuthError } from '@/lib/errors'
import { invoke } from '@/lib/ipc'
import { cn, formatRelativeTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { resolveLocale, useAppStore } from '@/stores/app'

/** Cap on rows shown in the dropdown; the full list lives on /inbox. */
const MAX_ROWS = 8

/** One dropdown row, normalized from either the local inbox or a Hub notification. */
interface BellRow {
  key: string
  source: 'local' | 'hub'
  unread: boolean
  kindLabel: string
  title: string
  subtitle?: string
  route?: string
  ts?: string
  /** id used to mark this single item read (inbox id / discussion id). */
  markReadId?: string
}

function timeValue(iso: string | undefined): number {
  if (!iso) return 0
  const v = new Date(iso).getTime()
  return Number.isNaN(v) ? 0 : v
}

/**
 * Top-bar notification bell: a unified entry point that merges the local
 * follow-activity inbox and the Hub notification inbox (the two sources the
 * /inbox page keeps in separate tabs). Shows an unread dot, a dropdown of the
 * most recent items, and a "view all" link to /inbox.
 */
export function NotificationBell(): React.JSX.Element {
  const { t } = useTranslation(['inbox'])
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const auth = useAppStore((s) => s.auth)
  const locale = resolveLocale(settings, appInfo)
  const endpointKey = normalizeHubEndpoint(settings.hubEndpoint)
  const signedIn = auth.status === 'signedIn'
  const [open, setOpen] = useState(false)

  // Local inbox — shares the Sidebar's cache and stays live via evt:inbox.
  const inbox = useQuery({ queryKey: ['inbox'], queryFn: () => invoke('inbox:list', undefined) })

  // Hub notifications (page 0). No live event, so refetch whenever the panel
  // opens. Auth gaps are a capability issue, not a transient failure — don't
  // hammer, and a failure simply contributes no Hub rows.
  const hub = useQuery({
    queryKey: ['hub-notifications', 0, endpointKey],
    queryFn: () => invoke('hub:notifications', { page: 0 }),
    enabled: signedIn,
    placeholderData: keepPreviousData,
    retry: (failureCount, error) => failureCount < 2 && !isAuthError(error.message)
  })

  const markLocal = useMutation({
    mutationFn: (ids: string[]) => invoke('inbox:markRead', { ids }),
    onSuccess: (items) => queryClient.setQueryData(['inbox'], items)
  })
  const markHub = useMutation({
    mutationFn: (discussionIds: string[]) =>
      invoke('hub:notificationsMarkRead', { discussionIds, read: true }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['hub-notifications'] })
  })

  const localItems: InboxItem[] = inbox.data ?? []
  const hubItems: HubNotification[] = hub.data?.items ?? []

  const rows: BellRow[] = [
    ...localItems.map((i) => ({
      key: `local:${i.id}`,
      source: 'local' as const,
      unread: i.readAt === undefined,
      kindLabel: t(`inbox:kind.${i.kind}`),
      title: i.title,
      subtitle: i.body,
      route: i.route,
      ts: i.createdAt,
      markReadId: i.id
    })),
    ...hubItems.map((i, idx) => ({
      key: `hub:${i.discussionId ?? idx}`,
      source: 'hub' as const,
      unread: !i.read,
      kindLabel: t(`inbox:hub.kind.${i.kind}`),
      title: i.title,
      subtitle: i.repoId,
      route: i.route,
      ts: i.updatedAt,
      markReadId: i.discussionId
    }))
  ]
    .sort((a, b) => timeValue(b.ts) - timeValue(a.ts))
    .slice(0, MAX_ROWS)

  const localUnread = localItems.filter((i) => i.readAt === undefined)
  const hubUnread = hubItems.filter((i) => !i.read)
  const unreadCount = localUnread.length + hubUnread.length

  const openRow = (row: BellRow): void => {
    // Hub rows without a discussion-backed id CANNOT be marked read
    // individually: the Hub exposes no per-notification id and mark-as-read
    // accepts only discussion ids (openapi-verified 2026-07-12; see
    // HubClient.markNotificationsRead). They stay unread until "mark all
    // read", whose applyToAll form covers them.
    if (row.unread && row.markReadId !== undefined) {
      if (row.source === 'local') markLocal.mutate([row.markReadId])
      else markHub.mutate([row.markReadId])
    }
    if (row.route !== undefined) navigate(row.route)
    setOpen(false)
  }

  const markAllRead = (): void => {
    if (localUnread.length > 0) markLocal.mutate(localUnread.map((i) => i.id))
    // An empty id list marks every Hub notification read.
    if (hubUnread.length > 0) markHub.mutate([])
  }

  const label = t('inbox:bell.title')

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // Pull fresh Hub notifications each time the panel opens.
        if (next && signedIn) void hub.refetch()
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={label}
              className="app-no-drag relative flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors duration-150 hover:bg-panel-2 hover:text-ink data-[state=open]:bg-panel-2 data-[state=open]:text-ink"
            >
              <Bell className="size-4" aria-hidden />
              {unreadCount > 0 && (
                <span
                  className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-brand ring-2 ring-bg"
                  aria-hidden
                />
              )}
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>

      <DropdownMenuContent
        align="end"
        className="w-80 max-w-[92vw] p-0"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-strong">
            {label}
            {unreadCount > 0 && (
              <span className="nums inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] leading-none font-semibold text-brand-ink">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="rounded text-[12px] text-ink-muted transition-colors duration-150 outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            >
              {t('inbox:markAllRead')}
            </button>
          )}
        </div>
        <DropdownMenuSeparator className="my-0" />

        <div className="max-h-[60vh] overflow-y-auto p-1">
          {rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12.5px] text-ink-faint">
              {t('inbox:bell.empty')}
            </p>
          ) : (
            rows.map((row) => (
              <button
                key={row.key}
                type="button"
                onClick={() => openRow(row)}
                className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 outline-none hover:bg-panel focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
              >
                <span
                  className={cn(
                    'mt-[7px] size-1.5 shrink-0 rounded-full',
                    row.unread ? 'bg-brand' : 'bg-transparent'
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className="min-w-14 shrink-0 justify-center">
                      {row.kindLabel}
                    </Badge>
                    <span
                      className={cn(
                        'min-w-0 truncate text-[13px] font-medium',
                        row.unread ? 'text-ink-strong' : 'text-ink'
                      )}
                    >
                      {row.title}
                    </span>
                  </span>
                  {row.subtitle !== undefined && row.subtitle !== '' && (
                    <span className="mt-0.5 line-clamp-2 block text-[12px] text-ink-muted">
                      {row.subtitle}
                    </span>
                  )}
                </span>
                <span className="nums shrink-0 text-[11px] text-ink-faint">
                  {formatRelativeTime(row.ts, locale)}
                </span>
              </button>
            ))
          )}
        </div>

        <DropdownMenuSeparator className="my-0" />
        <button
          type="button"
          onClick={() => {
            navigate('/inbox')
            setOpen(false)
          }}
          className="flex w-full items-center justify-center rounded-b-lg px-3 py-2 text-[12.5px] font-medium text-ink-muted transition-colors duration-150 outline-none hover:bg-panel hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
        >
          {t('inbox:bell.viewAll')}
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
