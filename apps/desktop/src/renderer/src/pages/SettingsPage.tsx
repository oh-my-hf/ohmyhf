import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { ExternalLink, LogIn, LogOut } from 'lucide-react'
import type { Locale } from '@oh-my-huggingface/shared'
import { SUPPORTED_LOCALES } from '@oh-my-huggingface/shared'
import { invoke, openExternal } from '@/lib/ipc'
import { changeLanguage } from '@/i18n'
import { formatBytes } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useToasts } from '@/components/ui/toaster'
import { resolveLocale, useAppStore } from '@/stores/app'

const REPO_URL = 'https://github.com/MoraxCheng/oh-my-huggingface'
const SPEED_OPTIONS = [1, 5, 10, 20, 50] // MB/s

function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-[13px] font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-h-8 items-center justify-between gap-4">
      <span className="text-[13px] text-ink-muted">{label}</span>
      {children}
    </div>
  )
}

export function SettingsPage(): React.JSX.Element {
  const { t } = useTranslation(['settings', 'common', 'auth'])
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const auth = useAppStore((s) => s.auth)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const setAuth = useAppStore((s) => s.setAuth)
  const push = useToasts((s) => s.push)

  const signIn = useMutation({
    mutationFn: () => invoke('auth:signIn', undefined),
    onSuccess: setAuth,
    onError: () => push(t('auth:error'), 'error')
  })
  const signOut = useMutation({
    mutationFn: () => invoke('auth:signOut', undefined),
    onSuccess: setAuth
  })
  const pickCacheDir = useMutation({
    mutationFn: () => invoke('system:pickFolder', undefined),
    onSuccess: (path) => {
      if (path) void updateSettings({ hfCacheDir: path })
    }
  })

  const setLocale = (value: string): void => {
    const locale = value as 'system' | Locale
    void updateSettings({ locale }).then(() => {
      changeLanguage(resolveLocale({ ...settings, locale }, appInfo))
    })
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 p-5">
        <h1 className="text-[15px] font-semibold">{t('settings:title')}</h1>

        <Section title={t('settings:account.title')}>
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
        </Section>

        <Section title={t('settings:appearance.title')}>
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
              onValueChange={(theme) =>
                void updateSettings({ theme: theme as typeof settings.theme })
              }
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
        </Section>

        <Section title={t('settings:downloads.title')}>
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
        </Section>

        <Section title={t('settings:notifications.title')}>
          <Row label={t('settings:notifications.enabled')}>
            <Switch
              checked={settings.notificationsEnabled}
              onCheckedChange={(notificationsEnabled) =>
                void updateSettings({ notificationsEnabled })
              }
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
        </Section>

        <Section title={t('settings:about.title')}>
          <div className="flex flex-col gap-2 text-[12.5px]">
            <div className="flex items-center gap-2">
              <span className="text-[13.5px] font-semibold">{t('common:appName')}</span>
              <Badge variant="warning">{t('settings:about.unofficialTitle')}</Badge>
              {appInfo && (
                <span className="text-ink-faint">
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
        </Section>
      </div>
    </div>
  )
}
