import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import {
  ArrowDownToLine,
  Bell,
  ExternalLink,
  Info,
  LogIn,
  LogOut,
  Minus,
  Monitor,
  Plus,
  UserCircle2
} from 'lucide-react'
import type { Locale } from '@oh-my-huggingface/shared'
import { SUPPORTED_LOCALES } from '@oh-my-huggingface/shared'
import { invoke, openExternal } from '@/lib/ipc'
import { changeLanguage } from '@/i18n'
import { cn, formatBytes } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useToasts } from '@/components/ui/toaster'
import type { SettingsSection } from '@/stores/app'
import { resolveLocale, useAppStore } from '@/stores/app'

const REPO_URL = 'https://github.com/MoraxCheng/oh-my-huggingface'
const SPEED_OPTIONS = [1, 5, 10, 20, 50] // MB/s
const UI_SCALE_MIN = 80
const UI_SCALE_MAX = 140
const UI_SCALE_STEP = 10

interface NavEntry {
  id: SettingsSection
  labelKey: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavGroup {
  labelKey: string
  items: NavEntry[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'settings:groups.account',
    items: [{ id: 'account', labelKey: 'settings:account.title', icon: UserCircle2 }]
  },
  {
    labelKey: 'settings:groups.interface',
    items: [
      { id: 'appearance', labelKey: 'settings:appearance.title', icon: Monitor },
      { id: 'downloads', labelKey: 'settings:downloads.title', icon: ArrowDownToLine },
      { id: 'notifications', labelKey: 'settings:notifications.title', icon: Bell }
    ]
  },
  {
    labelKey: 'settings:groups.about',
    items: [{ id: 'about', labelKey: 'settings:about.title', icon: Info }]
  }
]

function SectionShell({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Row({
  label,
  description,
  children
}: {
  label: string
  /** Optional secondary line under the label. */
  description?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex min-h-8 items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] text-ink-muted">{label}</span>
        {description ? <span className="text-[11.5px] text-ink-faint">{description}</span> : null}
      </div>
      {children}
    </div>
  )
}

function AccountSection(): React.JSX.Element {
  const { t } = useTranslation(['settings', 'auth', 'profile'])
  const auth = useAppStore((s) => s.auth)
  const setAuth = useAppStore((s) => s.setAuth)
  const closeSettings = useAppStore((s) => s.closeSettings)
  const push = useToasts((s) => s.push)
  const navigate = useNavigate()

  const signIn = useMutation({
    mutationFn: () => invoke('auth:signIn', undefined),
    onSuccess: setAuth,
    onError: () => push(t('auth:error'), 'error')
  })
  const signOut = useMutation({
    mutationFn: () => invoke('auth:signOut', undefined),
    onSuccess: setAuth
  })

  return (
    <SectionShell title={t('settings:account.title')}>
      {auth.status === 'signedIn' ? (
        <div className="flex items-center gap-3">
          {auth.user.avatarUrl && (
            <img src={auth.user.avatarUrl} alt="" className="size-9 rounded-full border" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13.5px] font-medium">
                {auth.user.fullname ?? auth.user.name}
              </span>
              {auth.user.isPro && <Badge variant="primary">{t('auth:pro')}</Badge>}
            </div>
            <div className="truncate text-[12px] text-ink-muted">@{auth.user.name}</div>
            {auth.user.orgs.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {auth.user.orgs.map((org) => (
                  <Badge key={org.name} variant="outline">
                    {org.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              closeSettings()
              navigate(`/users/${auth.user.name}`)
            }}
          >
            {t('profile:viewProfile')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => signOut.mutate()}>
            <LogOut className="size-3.5" aria-hidden />
            {t('auth:signOut')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div>
            <Button
              variant="primary"
              loading={auth.status === 'signingIn' || signIn.isPending}
              onClick={() => signIn.mutate()}
            >
              <LogIn className="size-3.5" aria-hidden />
              {auth.status === 'signingIn' ? t('auth:signingIn') : t('auth:signIn')}
            </Button>
          </div>
          <p className="text-[12px] text-ink-faint">{t('auth:hint')}</p>
        </div>
      )}
    </SectionShell>
  )
}

function AppearanceSection(): React.JSX.Element {
  const { t } = useTranslation(['settings', 'common'])
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const updateSettings = useAppStore((s) => s.updateSettings)

  const setLocale = (value: string): void => {
    const locale = value as 'system' | Locale
    void updateSettings({ locale }).then(() => {
      changeLanguage(resolveLocale({ ...settings, locale }, appInfo))
    })
  }

  const stepUiScale = (delta: number): void => {
    const uiScale = Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, settings.uiScale + delta))
    if (uiScale !== settings.uiScale) void updateSettings({ uiScale })
  }

  return (
    <SectionShell title={t('settings:appearance.title')}>
      <Row label={t('settings:appearance.language')}>
        <Select value={settings.locale} onValueChange={setLocale}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">{t('common:language.system')}</SelectItem>
            {SUPPORTED_LOCALES.map((locale) => (
              <SelectItem key={locale} value={locale}>
                {t(`common:language.${locale}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label={t('common:theme.label')}>
        <Select
          value={settings.theme}
          onValueChange={(theme) => void updateSettings({ theme: theme as typeof settings.theme })}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">{t('common:theme.system')}</SelectItem>
            <SelectItem value="light">{t('common:theme.light')}</SelectItem>
            <SelectItem value="dark">{t('common:theme.dark')}</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row label={t('settings:appearance.uiScale')}>
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            className="w-7 px-0"
            aria-label={t('settings:appearance.uiScaleDecrease')}
            disabled={settings.uiScale <= UI_SCALE_MIN}
            onClick={() => stepUiScale(-UI_SCALE_STEP)}
          >
            <Minus className="size-3.5" aria-hidden />
          </Button>
          <span className="nums w-12 text-center text-[13px]">{settings.uiScale}%</span>
          <Button
            variant="secondary"
            size="sm"
            className="w-7 px-0"
            aria-label={t('settings:appearance.uiScaleIncrease')}
            disabled={settings.uiScale >= UI_SCALE_MAX}
            onClick={() => stepUiScale(UI_SCALE_STEP)}
          >
            <Plus className="size-3.5" aria-hidden />
          </Button>
        </div>
      </Row>
    </SectionShell>
  )
}

function DownloadsSection(): React.JSX.Element {
  const { t } = useTranslation(['settings'])
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const updateSettings = useAppStore((s) => s.updateSettings)

  const pickCacheDir = useMutation({
    mutationFn: () => invoke('system:pickFolder', undefined),
    onSuccess: (path) => {
      if (path) void updateSettings({ hfCacheDir: path })
    }
  })

  return (
    <SectionShell title={t('settings:downloads.title')}>
      <Row label={t('settings:downloads.concurrency')}>
        <Select
          value={String(settings.downloadConcurrency)}
          onValueChange={(v) => void updateSettings({ downloadConcurrency: Number(v) })}
        >
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 6, 8].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {String(n)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label={t('settings:downloads.speedLimit')}>
        <Select
          value={settings.speedLimitBps === null ? 'unlimited' : String(settings.speedLimitBps)}
          onValueChange={(v) =>
            void updateSettings({ speedLimitBps: v === 'unlimited' ? null : Number(v) })
          }
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unlimited">{t('settings:downloads.unlimited')}</SelectItem>
            {SPEED_OPTIONS.map((mb) => (
              <SelectItem key={mb} value={String(mb * 1024 * 1024)}>
                {t('settings:downloads.speedPerSecond', {
                  value: formatBytes(mb * 1024 * 1024)
                })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label={t('settings:downloads.cacheDir')}>
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="max-w-56 truncate font-mono text-[11.5px] text-ink-faint"
            title={settings.hfCacheDir ?? appInfo?.hfCacheDir}
          >
            {settings.hfCacheDir ?? t('settings:downloads.cacheDirDefault')}
          </span>
          <Button variant="secondary" size="sm" onClick={() => pickCacheDir.mutate()}>
            {t('settings:downloads.choose')}
          </Button>
          {settings.hfCacheDir && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void updateSettings({ hfCacheDir: null })}
            >
              {t('settings:downloads.reset')}
            </Button>
          )}
        </div>
      </Row>
    </SectionShell>
  )
}

function NotificationsSection(): React.JSX.Element {
  const { t } = useTranslation(['settings'])
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)

  return (
    <SectionShell title={t('settings:notifications.title')}>
      <Row label={t('settings:notifications.enabled')}>
        <Switch
          checked={settings.notificationsEnabled}
          onCheckedChange={(notificationsEnabled) => void updateSettings({ notificationsEnabled })}
        />
      </Row>
      <Row label={t('settings:notifications.pollInterval')}>
        <Select
          value={String(settings.pollIntervalMinutes)}
          onValueChange={(v) => void updateSettings({ pollIntervalMinutes: Number(v) })}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[15, 30, 60, 180, 360].map((minutes) => (
              <SelectItem key={minutes} value={String(minutes)}>
                {t('settings:notifications.minutes', { count: minutes })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
    </SectionShell>
  )
}

function AboutSection(): React.JSX.Element {
  const { t } = useTranslation(['settings', 'common'])
  const appInfo = useAppStore((s) => s.appInfo)

  return (
    <SectionShell title={t('settings:about.title')}>
      <div className="flex flex-col gap-2 text-[12.5px]">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-semibold">{t('common:appName')}</span>
          <Badge variant="warning">{t('settings:about.unofficialTitle')}</Badge>
          {appInfo && (
            <span className="nums text-ink-faint">
              {t('settings:about.version', { version: appInfo.version })}
            </span>
          )}
        </div>
        <p className="max-w-[65ch] text-ink-muted">{t('settings:about.disclaimer')}</p>
        <p className="max-w-[65ch] text-ink-muted">{t('settings:about.privacy')}</p>
        <div className="mt-1 flex items-center gap-3">
          <span className="text-ink-faint">{t('settings:about.license')}</span>
          <button
            type="button"
            className="flex items-center gap-1 text-primary hover:underline"
            onClick={() => openExternal(REPO_URL)}
          >
            <ExternalLink className="size-3.5" aria-hidden />
            {t('settings:about.github')}
          </button>
        </div>
      </div>
    </SectionShell>
  )
}

const SECTION_CONTENT: Record<SettingsSection, () => React.JSX.Element> = {
  account: AccountSection,
  appearance: AppearanceSection,
  downloads: DownloadsSection,
  notifications: NotificationsSection,
  about: AboutSection
}

export function SettingsDialog(): React.JSX.Element {
  const { t } = useTranslation(['settings'])
  const open = useAppStore((s) => s.settingsOpen)
  const section = useAppStore((s) => s.settingsSection)
  const openSettings = useAppStore((s) => s.openSettings)
  const closeSettings = useAppStore((s) => s.closeSettings)

  const Content = SECTION_CONTENT[section]

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? openSettings() : closeSettings())}>
      <DialogContent
        aria-describedby={undefined}
        className="grid h-[34rem] max-h-[calc(100vh-6rem)] w-[56rem] max-w-[calc(100vw-4rem)] grid-cols-[13rem_1fr] overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">{t('settings:title')}</DialogTitle>
        <nav className="flex min-h-0 flex-col gap-4 overflow-y-auto border-r bg-panel p-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.labelKey} className="flex flex-col gap-0.5">
              <div className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
                {t(group.labelKey)}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openSettings(item.id)}
                  className={cn(
                    'flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors duration-150',
                    section === item.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-ink-muted hover:bg-panel-2 hover:text-ink'
                  )}
                >
                  <item.icon className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-left">{t(item.labelKey)}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="min-h-0 overflow-y-auto p-6">
          <Content />
        </div>
      </DialogContent>
    </Dialog>
  )
}
