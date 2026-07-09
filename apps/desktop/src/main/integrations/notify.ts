import { MainI18n, matchLocale } from '../i18n'

/**
 * Completion notification for long-running integrations. The IPC wiring hands these
 * modules no MainI18n instance, so a private one keyed to the OS locale is used —
 * an explicitly configured non-system app locale is not honored here.
 * Best-effort only: never lets a notification failure break the operation itself.
 */
export function notifyDone(titleKey: string, bodyKey: string, vars?: Record<string, string>): void {
  void (async () => {
    try {
      const { app, Notification } = await import('electron')
      if (!app.isReady() || !Notification.isSupported()) return
      const i18n = new MainI18n()
      i18n.setLocale(matchLocale(app.getLocale()))
      new Notification({ title: i18n.t(titleKey), body: i18n.t(bodyKey, vars) }).show()
    } catch {
      // ignore — notifications are cosmetic
    }
  })()
}
