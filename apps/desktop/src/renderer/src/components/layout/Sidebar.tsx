import { NavLink } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownToLine,
  Boxes,
  Columns3,
  Database,
  FileText,
  HardDrive,
  Inbox,
  LayoutGrid,
  Settings,
  Star,
  UploadCloud,
  UserCircle2
} from 'lucide-react'
import logo from '@/assets/logo.png'
import { invoke } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface NavItem {
  to: string
  labelKey: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
}

function SidebarLink({ item, label }: { item: NavItem; label: string }): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={item.to}
          className={({ isActive }) =>
            cn(
              'group relative flex h-8 items-center justify-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors duration-150 min-[860px]:justify-start',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-ink-muted hover:bg-panel-2 hover:text-ink'
            )
          }
        >
          <item.icon className="size-4 shrink-0" aria-hidden />
          <span className="hidden min-w-0 flex-1 truncate min-[860px]:block">{label}</span>
          {item.badge ? (
            <span className="nums hidden h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-ink min-[860px]:inline-flex">
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          ) : null}
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right" className="min-[860px]:hidden">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function Sidebar(): React.JSX.Element {
  const { t } = useTranslation(['nav', 'auth', 'common'])
  const auth = useAppStore((s) => s.auth)
  const appInfo = useAppStore((s) => s.appInfo)

  const downloads = useQuery({
    queryKey: ['downloads'],
    queryFn: () => invoke('downloads:list', undefined)
  })
  const inbox = useQuery({ queryKey: ['inbox'], queryFn: () => invoke('inbox:list', undefined) })

  const activeDownloads =
    downloads.data?.filter((d) => d.status === 'running' || d.status === 'queued').length ?? 0
  const unread = inbox.data?.filter((i) => !i.readAt).length ?? 0

  const browse: NavItem[] = [
    { to: '/models', labelKey: 'models', icon: Boxes },
    { to: '/datasets', labelKey: 'datasets', icon: Database },
    { to: '/spaces', labelKey: 'spaces', icon: LayoutGrid },
    { to: '/papers', labelKey: 'papers', icon: FileText }
  ]
  const library: NavItem[] = [
    { to: '/favorites', labelKey: 'favorites', icon: Star },
    { to: '/downloads', labelKey: 'downloads', icon: ArrowDownToLine, badge: activeDownloads },
    { to: '/cache', labelKey: 'cache', icon: HardDrive },
    { to: '/inbox', labelKey: 'inbox', icon: Inbox, badge: unread },
    { to: '/compare', labelKey: 'compare', icon: Columns3 },
    { to: '/upload', labelKey: 'upload', icon: UploadCloud }
  ]

  const isMac = appInfo?.platform === 'darwin'

  return (
    <aside className="flex w-12 shrink-0 flex-col border-r bg-panel min-[860px]:w-52">
      {/* Drag region under the macOS traffic lights. */}
      <div className={cn('app-drag flex items-end px-3', isMac ? 'h-11' : 'h-3')} />
      <div className="app-no-drag flex items-center justify-center gap-2.5 px-3 pt-2 pb-4 min-[860px]:justify-start">
        <img src={logo} alt="" className="size-6 shrink-0 select-none" draggable={false} />
        <div className="hidden min-w-0 min-[860px]:block">
          <div className="truncate text-[13px] leading-4 font-semibold">
            {t('appName', { ns: 'common' })}
          </div>
          <div className="text-[10px] leading-3 tracking-wider text-ink-faint uppercase">
            {t('unofficial', { ns: 'common' })}
          </div>
        </div>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2">
        <div className="flex flex-col gap-0.5">
          <div className="hidden px-2 pb-1 text-[10px] font-semibold tracking-wider text-ink-faint uppercase min-[860px]:block">
            {t('browse')}
          </div>
          {browse.map((item) => (
            <SidebarLink key={item.to} item={item} label={t(item.labelKey)} />
          ))}
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="hidden px-2 pb-1 text-[10px] font-semibold tracking-wider text-ink-faint uppercase min-[860px]:block">
            {t('library')}
          </div>
          {library.map((item) => (
            <SidebarLink key={item.to} item={item} label={t(item.labelKey)} />
          ))}
        </div>
      </nav>

      <div className="flex flex-col gap-0.5 border-t p-2">
        <SidebarLink
          item={{ to: '/settings', labelKey: 'settings', icon: Settings }}
          label={t('settings')}
        />
        <NavLink
          to="/settings"
          className="mt-0.5 flex h-9 items-center justify-center gap-2.5 rounded-md border bg-bg px-2 text-[13px] text-ink-muted transition-colors duration-150 hover:bg-panel-2 hover:text-ink min-[860px]:justify-start"
        >
          {auth.status === 'signedIn' && auth.user.avatarUrl ? (
            <img src={auth.user.avatarUrl} alt="" className="size-5 shrink-0 rounded-full border" />
          ) : (
            <UserCircle2 className="size-4 shrink-0" aria-hidden />
          )}
          <span className="hidden min-w-0 flex-1 truncate font-medium min-[860px]:block">
            {auth.status === 'signedIn' ? auth.user.name : t('auth:signedOut')}
          </span>
        </NavLink>
      </div>
    </aside>
  )
}
