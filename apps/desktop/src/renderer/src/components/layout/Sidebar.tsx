import { NavLink } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownToLine,
  Bookmark,
  Boxes,
  Columns3,
  Database,
  FileText,
  FolderGit2,
  HardDrive,
  Home,
  Inbox,
  LayoutGrid,
  Settings,
  Star,
  UploadCloud,
  UserCircle2
} from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { useMediaQuery } from '@/hooks/use-media-query'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface NavItem {
  to: string
  labelKey: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
}

function SidebarLink({
  item,
  label,
  collapsed
}: {
  item: NavItem
  label: string
  collapsed: boolean
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* `end`: highlight only on the page itself — a detail page under it
            (/models/owner/name) is its own view and gets no sidebar box. */}
        <NavLink
          to={item.to}
          end
          className={({ isActive }) =>
            cn(
              'group relative flex h-8 items-center gap-2.5 rounded-lg border border-transparent px-2 text-[13px] font-medium transition-colors duration-150',
              collapsed ? 'justify-center' : 'justify-start',
              isActive
                ? 'text-ink-strong'
                : 'text-ink-muted hover:bg-panel-2 hover:text-ink'
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span
                  className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-select"
                  aria-hidden
                />
              )}
              <item.icon className={cn('size-4 shrink-0', isActive && 'text-select')} aria-hidden />
              {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
              {item.badge ? (
                collapsed ? (
                  <span
                    className="absolute top-1 right-1 size-1.5 rounded-full bg-brand"
                    aria-hidden
                  />
                ) : (
                  <span className="nums inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] leading-none font-semibold text-brand-ink">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )
              ) : null}
            </>
          )}
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right" className={collapsed ? undefined : 'hidden'}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function Sidebar(): React.JSX.Element {
  const { t } = useTranslation(['nav', 'auth', 'common'])
  const auth = useAppStore((s) => s.auth)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const openSettings = useAppStore((s) => s.openSettings)
  const manualCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const narrow = useMediaQuery('(max-width: 859.98px)')
  const collapsed = manualCollapsed || narrow

  const downloads = useQuery({
    queryKey: ['downloads'],
    queryFn: () => invoke('downloads:list', undefined)
  })
  const inbox = useQuery({ queryKey: ['inbox'], queryFn: () => invoke('inbox:list', undefined) })

  const activeDownloads =
    downloads.data?.filter((d) => d.status === 'running' || d.status === 'queued').length ?? 0
  const unread = inbox.data?.filter((i) => !i.readAt).length ?? 0

  const browse: NavItem[] = [
    { to: '/', labelKey: 'home', icon: Home },
    { to: '/models', labelKey: 'models', icon: Boxes },
    { to: '/datasets', labelKey: 'datasets', icon: Database },
    { to: '/spaces', labelKey: 'spaces', icon: LayoutGrid },
    { to: '/papers', labelKey: 'papers', icon: FileText }
  ]
  const library: NavItem[] = [
    { to: '/favorites', labelKey: 'favorites', icon: Star },
    { to: '/my-repos', labelKey: 'myRepos', icon: FolderGit2 },
    { to: '/collections', labelKey: 'collections', icon: Bookmark },
    { to: '/downloads', labelKey: 'downloads', icon: ArrowDownToLine, badge: activeDownloads },
    { to: '/cache', labelKey: 'cache', icon: HardDrive },
    { to: '/inbox', labelKey: 'inbox', icon: Inbox, badge: unread },
    { to: '/compare', labelKey: 'compare', icon: Columns3 },
    { to: '/upload', labelKey: 'upload', icon: UploadCloud }
  ]

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-border-card bg-panel',
        collapsed ? 'w-12' : 'w-52'
      )}
    >
      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pt-3">
        <div className="flex flex-col gap-0.5">
          {!collapsed && (
            <div className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
              {t('browse')}
            </div>
          )}
          {browse.map((item) => (
            <SidebarLink key={item.to} item={item} label={t(item.labelKey)} collapsed={collapsed} />
          ))}
        </div>
        <div className="flex flex-col gap-0.5">
          {!collapsed && (
            <div className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
              {t('library')}
            </div>
          )}
          {library.map((item) => (
            <SidebarLink key={item.to} item={item} label={t(item.labelKey)} collapsed={collapsed} />
          ))}
        </div>
      </nav>

      <div className="flex flex-col gap-0.5 border-t border-border-card p-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => openSettings()}
              className={cn(
                'group relative flex h-8 items-center gap-2.5 rounded-lg border border-transparent px-2 text-[13px] font-medium transition-colors duration-150',
                collapsed ? 'justify-center' : 'justify-start',
                settingsOpen
                  ? 'text-ink-strong'
                  : 'text-ink-muted hover:bg-panel-2 hover:text-ink'
              )}
            >
              {settingsOpen && (
                <span
                  className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-select"
                  aria-hidden
                />
              )}
              <Settings
                className={cn('size-4 shrink-0', settingsOpen && 'text-select')}
                aria-hidden
              />
              {!collapsed && (
                <span className="min-w-0 flex-1 truncate text-left">{t('settings')}</span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className={collapsed ? undefined : 'hidden'}>
            {t('settings')}
          </TooltipContent>
        </Tooltip>
        <button
          type="button"
          onClick={() => openSettings('account')}
          className={cn(
            'mt-0.5 flex h-9 items-center gap-2.5 rounded-lg text-[13px] text-ink-muted transition-colors duration-150 hover:text-ink',
            collapsed
              ? 'justify-center hover:bg-panel-2'
              : 'justify-start border bg-linear-to-b from-btn-from to-btn-to px-2 hover:shadow-btn-inset'
          )}
        >
          {auth.status === 'signedIn' && auth.user.avatarUrl ? (
            <img
              src={auth.user.avatarUrl}
              alt=""
              className={cn(
                'shrink-0 rounded-full border object-cover',
                collapsed ? 'size-6' : 'size-5'
              )}
            />
          ) : (
            <UserCircle2 className={cn('shrink-0', collapsed ? 'size-5' : 'size-4')} aria-hidden />
          )}
          {!collapsed && (
            <span className="min-w-0 flex-1 truncate text-left font-medium">
              {auth.status === 'signedIn' ? auth.user.name : t('auth:signedOut')}
            </span>
          )}
        </button>
      </div>
    </aside>
  )
}
