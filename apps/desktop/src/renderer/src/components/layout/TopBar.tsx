import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, PanelLeft, Search, UserCircle2 } from 'lucide-react'
import logo from '@/assets/logo.png'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { NotificationBell } from '@/components/layout/NotificationBell'
import { useNavHistory } from '@/lib/nav-history'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'

function BarButton({
  label,
  keys,
  disabled,
  onClick,
  children
}: {
  label: string
  keys?: string[]
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className="app-no-drag flex size-8 items-center justify-center rounded-lg text-ink-muted transition-colors duration-150 hover:bg-panel-2 hover:text-ink disabled:pointer-events-none disabled:opacity-40"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-1.5">
        {label}
        {keys?.map((key) => (
          <Kbd key={key}>{key}</Kbd>
        ))}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Full-width draggable header (macOS hiddenInset): identity, history,
 * global search entry (opens the palette), and account. Every interactive
 * child opts out of the drag region.
 */
export function TopBar(): React.JSX.Element {
  const { t } = useTranslation(['nav', 'common', 'auth'])
  const navigate = useNavigate()
  const { canGoBack, canGoForward } = useNavHistory()
  const appInfo = useAppStore((s) => s.appInfo)
  const auth = useAppStore((s) => s.auth)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const setPaletteOpen = useAppStore((s) => s.setPaletteOpen)
  const openSettings = useAppStore((s) => s.openSettings)

  const isMac = appInfo?.platform === 'darwin'
  const mod = isMac ? '⌘' : 'Ctrl'

  return (
    <header
      className={cn(
        'app-drag app-drag-clearance relative z-30 flex h-11 shrink-0 items-center gap-1 border-b border-border-card bg-bg',
        // Clearance for the macOS traffic lights (x:16, ~52px wide).
        isMac ? 'pl-[76px]' : 'pl-2'
      )}
    >
      <BarButton label={t('nav:toggleSidebar')} keys={[mod, 'B']} onClick={toggleSidebar}>
        <PanelLeft className="size-4" aria-hidden />
      </BarButton>

      <div className="app-no-drag flex min-w-0 items-center gap-2 px-1.5">
        <img src={logo} alt="" className="size-5 shrink-0 select-none" draggable={false} />
        <span className="hidden truncate text-[13px] font-semibold text-ink-strong sm:block">
          {t('common:appName')}
        </span>
        <span className="hidden rounded-full border px-1.5 py-px text-[9px] leading-3 tracking-wider text-ink-faint uppercase md:block">
          {t('common:unofficial')}
        </span>
      </div>

      <div className="flex items-center gap-0.5 pl-1">
        <BarButton
          label={t('common:goBack')}
          keys={isMac ? [mod, '['] : ['Alt', '←']}
          disabled={!canGoBack}
          onClick={() => void navigate(-1)}
        >
          <ArrowLeft className="size-4" aria-hidden />
        </BarButton>
        <BarButton
          label={t('common:goForward')}
          keys={isMac ? [mod, ']'] : ['Alt', '→']}
          disabled={!canGoForward}
          onClick={() => void navigate(1)}
        >
          <ArrowRight className="size-4" aria-hidden />
        </BarButton>
      </div>

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="app-no-drag mx-auto flex h-8 w-80 max-w-[40vw] items-center gap-2 rounded-full border bg-field px-3 text-[12.5px] text-ink-faint shadow-field-inset transition-colors duration-150 hover:border-decor hover:text-ink-muted"
      >
        <Search className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left">{t('nav:globalSearch')}</span>
        <span className="flex shrink-0 items-center gap-0.5">
          <Kbd>{mod}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-0.5">
        <NotificationBell />
        <button
          type="button"
          aria-label={t('nav:account')}
          onClick={() => openSettings('account')}
          className="app-no-drag flex size-8 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors duration-150 hover:bg-panel-2 hover:text-ink"
        >
          {auth.status === 'signedIn' && auth.user.avatarUrl ? (
            <img
              src={auth.user.avatarUrl}
              alt=""
              loading="eager"
              decoding="async"
              className="size-5 rounded-full border"
            />
          ) : (
            <UserCircle2 className="size-[18px]" aria-hidden />
          )}
        </button>
      </div>
    </header>
  )
}
