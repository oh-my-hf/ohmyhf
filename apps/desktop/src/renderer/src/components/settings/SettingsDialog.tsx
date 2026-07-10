import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownToLine,
  Bell,
  ExternalLink,
  Info,
  LogIn,
  LogOut,
  Minus,
  Monitor,
  PanelTop,
  Plus,
  RefreshCw,
  Shield,
  UserCircle2,
  Wifi,
  X
} from 'lucide-react'
import type { AppUpdateState, DefaultHome, Locale, RepoSort } from '@oh-my-huggingface/shared'
import { SUPPORTED_LOCALES } from '@oh-my-huggingface/shared'
import { invoke, openExternal } from '@/lib/ipc'
import { changeLanguage } from '@/i18n'
import { HUB_DEFAULT_SCOPES, SCOPE_LABEL_KEYS } from '@/lib/scopes'
import { cn, formatBytes, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { PlanBadge } from '@/components/profile/PlanBadge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { useToasts } from '@/components/ui/toaster'
import type { SettingsSection } from '@/stores/app'
import { resolveLocale, useAppStore } from '@/stores/app'
import { APP_UPDATE_QUERY_KEY } from '@/lib/query'
import { PrivacySection } from '@/components/settings/PrivacySection'
import { NetworkSection } from '@/components/settings/NetworkSection'
import { DesktopSection } from '@/components/settings/DesktopSection'

const REPO_URL = 'https://github.com/oh-my-hf/ohmyhf'
const RELEASES_URL = `${REPO_URL}/releases`
const SPEED_OPTIONS = [1, 5, 10, 20, 50] // MB/s
const UI_SCALE_MIN = 80
const UI_SCALE_MAX = 140
const UI_SCALE_STEP = 10

/** IPC flattens HubApiError into a message string; sniff auth failures from it. */
function isAuthErrorMessage(message: string): boolean {
  return /\b401\b|\b403\b|unauthorized|forbidden/i.test(message)
}

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
    labelKey: 'settings:groups.connection',
    items: [{ id: 'network', labelKey: 'settings:network.title', icon: Wifi }]
  },
  {
    labelKey: 'settings:groups.system',
    items: [{ id: 'desktop', labelKey: 'settings:desktop.title', icon: PanelTop }]
  },
  {
    labelKey: 'settings:groups.data',
    items: [{ id: 'privacy', labelKey: 'settings:privacy.title', icon: Shield }]
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
      <h2 className="text-smd font-semibold text-ink-strong">{title}</h2>
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
  // Aborts a stuck "waiting for browser…"; the resulting state arrives via the
  // evt:auth broadcast and the signIn mutation resolving, so we don't setAuth here.
  const cancelSignIn = useMutation({
    mutationFn: () => invoke('auth:cancelSignIn', undefined)
  })
  const signOut = useMutation({
    mutationFn: () => invoke('auth:signOut', undefined),
    onSuccess: setAuth
  })
  const signingIn = auth.status === 'signingIn' || signIn.isPending

  return (
    <SectionShell title={t('settings:account.title')}>
      {auth.status === 'signedIn' ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {auth.user.avatarUrl && (
              <img src={auth.user.avatarUrl} alt="" className="size-9 rounded-full border" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[13.5px] font-medium text-ink-strong">
                  {auth.user.fullname ?? auth.user.name}
                </span>
                {auth.user.isPro && <PlanBadge kind="pro" />}
              </div>
              <div className="truncate text-[12px] text-ink-muted">@{auth.user.name}</div>
              {auth.user.orgs.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {auth.user.orgs.map((org) => (
                    <span key={org.name} className="inline-flex items-center gap-1">
                      <Badge variant="outline">{org.name}</Badge>
                      {org.plan && <PlanBadge kind={org.plan} />}
                    </span>
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
          <HubAccountBlock
            scopes={auth.scopes}
            reauthorizing={signIn.isPending}
            onReauthorize={() => signIn.mutate()}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Button variant="cta" loading={signingIn} onClick={() => signIn.mutate()}>
              <LogIn className="size-3.5" aria-hidden />
              {signingIn ? t('auth:signingIn') : t('auth:signIn')}
            </Button>
            {signingIn && (
              <Button
                variant="secondary"
                loading={cancelSignIn.isPending}
                onClick={() => cancelSignIn.mutate()}
              >
                <X className="size-3.5" aria-hidden />
                {t('auth:cancelSignIn')}
              </Button>
            )}
          </div>
          <p className="text-[12px] text-ink-faint">
            {signingIn ? t('auth:signingInHint') : t('auth:hint')}
          </p>
        </div>
      )}
    </SectionShell>
  )
}

function HubAccountBlock({
  scopes,
  reauthorizing,
  onReauthorize
}: {
  /** OAuth scopes granted to the stored token; undefined for pre-scopes sessions. */
  scopes?: string[]
  reauthorizing: boolean
  onReauthorize: () => void
}): React.JSX.Element {
  const { t } = useTranslation(['settings'])
  const missingScopes =
    scopes === undefined ? [] : HUB_DEFAULT_SCOPES.filter((scope) => !scopes.includes(scope))
  // Unknown scopes (old session) → allow the attempt; only a definitive miss gates.
  const billingGranted = scopes === undefined || scopes.includes('read-billing')

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <h3 className="text-[13px] font-semibold text-ink-strong">
        {t('settings:account.hub.title')}
      </h3>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] text-ink-muted">{t('settings:account.hub.scopes')}</span>
        {scopes === undefined ? (
          <p className="text-[12px] text-ink-faint">{t('settings:account.hub.scopesUnknown')}</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {scopes.map((scope) =>
              SCOPE_LABEL_KEYS[scope] !== undefined ? (
                <Badge key={scope} variant="neutral" title={scope}>
                  {t(SCOPE_LABEL_KEYS[scope])}
                </Badge>
              ) : (
                <Badge key={scope} variant="outline" className="font-mono text-[11px]">
                  {scope}
                </Badge>
              )
            )}
          </div>
        )}
        {missingScopes.length > 0 && (
          <p className="max-w-[65ch] text-[12px] text-warning">
            {t('settings:account.hub.missingScopes', { scopes: missingScopes.join(', ') })}
          </p>
        )}
      </div>
      <div>
        <Button variant="secondary" size="sm" loading={reauthorizing} onClick={onReauthorize}>
          <RefreshCw className="size-3.5" aria-hidden />
          {t('settings:account.hub.reauthorize')}
        </Button>
      </div>
      {billingGranted ? (
        <BillingUsageCard />
      ) : (
        <p className="max-w-[65ch] text-[12px] text-ink-faint">
          {t('settings:account.billing.gated')}
        </p>
      )}
    </div>
  )
}

function BillingUsageCard(): React.JSX.Element {
  const { t } = useTranslation(['settings', 'common'])
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)

  const usage = useQuery({
    queryKey: ['hub-billing-usage'],
    queryFn: () => invoke('hub:billingUsage', undefined),
    // A 401/403 is a capability gap, not a transient failure — do not retry it.
    retry: (failureCount, error) => failureCount < 2 && !isAuthErrorMessage(error.message)
  })

  // The Hub bills in USD; rows carry integer cents.
  const formatAmount = (cents: number): string =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(cents / 100)

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-card bg-card-gradient p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[12.5px] font-medium text-ink-strong">
          {t('settings:account.billing.title')}
        </h4>
        {usage.data?.periodStart !== undefined && usage.data.periodEnd !== undefined && (
          <span className="nums text-[11.5px] text-ink-faint">
            {t('settings:account.billing.period', {
              start: formatDate(usage.data.periodStart, locale),
              end: formatDate(usage.data.periodEnd, locale)
            })}
          </span>
        )}
      </div>
      {usage.isPending && <Skeleton className="h-14" />}
      {usage.isError &&
        (isAuthErrorMessage(usage.error.message) ? (
          <p className="text-[12px] text-ink-faint">{t('settings:account.billing.unauthorized')}</p>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[12px] text-ink-muted">{usage.error.message}</p>
            <Button variant="ghost" size="sm" onClick={() => void usage.refetch()}>
              {t('common:retry')}
            </Button>
          </div>
        ))}
      {usage.data !== undefined && usage.data.rows.length === 0 && (
        <p className="text-[12px] text-ink-faint">{t('settings:account.billing.empty')}</p>
      )}
      {usage.data !== undefined && usage.data.rows.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {usage.data.rows.map((row, index) => (
            <div
              key={`${row.label}-${index}`}
              className="flex items-center justify-between gap-4 text-[12.5px]"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-ink">{row.label}</span>
                {row.detail !== undefined && row.detail !== '' && (
                  <span className="truncate text-[11.5px] text-ink-faint">{row.detail}</span>
                )}
              </div>
              {row.amountCents !== undefined && (
                <span className="nums shrink-0 text-ink-muted">
                  {formatAmount(row.amountCents)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AppearanceSection(): React.JSX.Element {
  const { t } = useTranslation(['settings', 'common', 'browse'])
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

  const homeOptions: DefaultHome[] = ['home', 'models', 'datasets', 'spaces', 'papers']
  const sortOptions: RepoSort[] = ['trending', 'downloads', 'likes', 'updated', 'created']

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
      <Row label={t('settings:appearance.defaultHome')}>
        <Select
          value={settings.defaultHome}
          onValueChange={(v) => void updateSettings({ defaultHome: v as DefaultHome })}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {homeOptions.map((home) => (
              <SelectItem key={home} value={home}>
                {t(`settings:appearance.homeOptions.${home}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label={t('settings:appearance.defaultSort')}>
        <Select
          value={settings.defaultRepoSort}
          onValueChange={(v) => void updateSettings({ defaultRepoSort: v as RepoSort })}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((sort) => (
              <SelectItem key={sort} value={sort}>
                {t(`browse:sort.${sort}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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

function UpdatePanel(): React.JSX.Element {
  const { t } = useTranslation(['settings'])
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)
  const updateQuery = useQuery({
    queryKey: APP_UPDATE_QUERY_KEY,
    queryFn: () => invoke('updater:getState', undefined),
    staleTime: Infinity
  })
  const state = updateQuery.data

  const updateAction = useMutation({
    mutationFn: async (): Promise<AppUpdateState | undefined> => {
      if (state?.status === 'available') return invoke('updater:download', undefined)
      if (
        state?.status === 'ready' ||
        (state?.status === 'error' &&
          state.operation === 'install' &&
          state.availableVersion !== undefined)
      ) {
        await invoke('updater:install', undefined)
        return undefined
      }
      return invoke('updater:check', undefined)
    },
    onSuccess: (next) => {
      if (next) queryClient.setQueryData(APP_UPDATE_QUERY_KEY, next)
    },
    onError: () => push(t('settings:about.updates.errors.unknown'), 'error')
  })

  let statusText = t('settings:about.updates.checking')
  if (state) {
    switch (state.status) {
      case 'unsupported':
        statusText = t('settings:about.updates.unsupported')
        break
      case 'idle':
        statusText = t('settings:about.updates.description')
        break
      case 'checking':
        statusText = t('settings:about.updates.checking')
        break
      case 'up-to-date':
        statusText = t('settings:about.updates.upToDate')
        break
      case 'available':
        statusText = t('settings:about.updates.available', {
          version: state.availableVersion
        })
        break
      case 'manual':
        statusText = t('settings:about.updates.manual', {
          version: state.availableVersion
        })
        break
      case 'downloading':
        statusText = t('settings:about.updates.downloading', {
          version: state.availableVersion,
          percent: Math.round(state.percent)
        })
        break
      case 'ready':
        statusText = t('settings:about.updates.ready', { version: state.availableVersion })
        break
      case 'error':
        statusText = t(`settings:about.updates.errors.${state.error}`)
        break
    }
  }

  const busy =
    updateQuery.isPending ||
    updateAction.isPending ||
    state?.status === 'checking' ||
    state?.status === 'downloading'
  let actionLabel = t('settings:about.updates.check')
  if (state?.status === 'up-to-date') actionLabel = t('settings:about.updates.checkAgain')
  if (state?.status === 'available') actionLabel = t('settings:about.updates.download')
  if (state?.status === 'downloading') {
    actionLabel = t('settings:about.updates.downloadingButton', {
      percent: Math.round(state.percent)
    })
  }
  if (state?.status === 'ready') actionLabel = t('settings:about.updates.restartAndInstall')
  if (state?.status === 'error') {
    actionLabel = t(
      state.operation === 'install' && state.availableVersion !== undefined
        ? 'settings:about.updates.retryInstall'
        : 'settings:about.updates.retry'
    )
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="text-[13px] font-semibold text-ink-strong">
            {t('settings:about.updates.title')}
          </h3>
          <p
            className="max-w-[65ch] text-[12px] text-ink-muted"
            role={state?.status === 'downloading' ? undefined : 'status'}
            aria-live={state?.status === 'downloading' ? undefined : 'polite'}
          >
            {statusText}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {state?.status !== 'unsupported' && state?.status !== 'manual' && (
            <Button
              variant={state?.status === 'ready' ? 'cta' : 'secondary'}
              size="sm"
              loading={busy}
              onClick={() => updateAction.mutate()}
            >
              {!busy && <RefreshCw className="size-3.5" aria-hidden />}
              {actionLabel}
            </Button>
          )}
          {(state?.status === 'unsupported' ||
            state?.status === 'manual' ||
            state?.status === 'error') && (
            <Button variant="ghost" size="sm" onClick={() => openExternal(RELEASES_URL)}>
              <ExternalLink className="size-3.5" aria-hidden />
              {t('settings:about.updates.openReleases')}
            </Button>
          )}
        </div>
      </div>
      {state?.status === 'downloading' && (
        <div className="flex flex-col gap-1.5">
          <Progress
            value={state.percent / 100}
            aria-label={t('settings:about.updates.progressLabel')}
          />
          {state.total > 0 && (
            <span className="nums text-[11.5px] text-ink-faint">
              {t('settings:about.updates.downloadProgress', {
                transferred: formatBytes(state.transferred),
                total: formatBytes(state.total)
              })}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function AboutSection(): React.JSX.Element {
  const { t } = useTranslation(['settings', 'common'])
  const appInfo = useAppStore((s) => s.appInfo)

  return (
    <SectionShell title={t('settings:about.title')}>
      <div className="flex flex-col gap-2 text-[12.5px]">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-semibold text-ink-strong">{t('common:appName')}</span>
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
            className="flex items-center gap-1 text-link hover:underline"
            onClick={() => openExternal(REPO_URL)}
          >
            <ExternalLink className="size-3.5" aria-hidden />
            {t('settings:about.github')}
          </button>
        </div>
      </div>
      <UpdatePanel />
    </SectionShell>
  )
}

const SECTION_CONTENT: Record<SettingsSection, () => React.JSX.Element> = {
  account: AccountSection,
  appearance: AppearanceSection,
  downloads: DownloadsSection,
  notifications: NotificationsSection,
  network: NetworkSection,
  desktop: DesktopSection,
  privacy: PrivacySection,
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
                      ? 'bg-panel-2 text-ink-strong'
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
