import { useTranslation } from 'react-i18next'
import { Switch } from '@/components/ui/switch'
import { useAppStore } from '@/stores/app'

export function DesktopSection(): React.JSX.Element {
  const { t } = useTranslation(['settings'])
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const isMac = appInfo?.platform === 'darwin'

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-smd font-semibold text-ink-strong">{t('settings:desktop.title')}</h2>

      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <label className="flex items-center justify-between gap-3 text-[13px] text-ink">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="font-medium text-ink-strong">
              {t('settings:desktop.launchAtLogin')}
            </span>
            <span className="text-[12px] text-ink-muted">
              {t('settings:desktop.launchAtLoginHint')}
            </span>
          </div>
          <Switch
            checked={settings.launchAtLogin}
            onCheckedChange={(launchAtLogin) => void updateSettings({ launchAtLogin })}
          />
        </label>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <label className="flex items-center justify-between gap-3 text-[13px] text-ink">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="font-medium text-ink-strong">{t('settings:desktop.closeToTray')}</span>
            <span className="text-[12px] text-ink-muted">
              {isMac ? t('settings:desktop.closeHintMac') : t('settings:desktop.closeHintOther')}
            </span>
          </div>
          <Switch
            checked={settings.closeToTray}
            onCheckedChange={(closeToTray) => void updateSettings({ closeToTray })}
          />
        </label>
      </div>
    </section>
  )
}
