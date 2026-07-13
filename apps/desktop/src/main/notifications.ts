import { Notification } from 'electron'

interface NotificationSettings {
  get(): { notificationsEnabled: boolean }
}

interface NotificationTranslator {
  t(key: string, vars?: Record<string, string | number>): string
}

interface SystemNotification {
  on(event: 'click', listener: () => void): unknown
  show(): void
}

export interface NotificationBackend {
  isSupported(): boolean
  create(options: { title: string; body: string }): SystemNotification
}

const electronBackend: NotificationBackend = {
  isSupported: () => Notification.isSupported(),
  create: (options) => new Notification(options)
}

/**
 * Main-process notification boundary. It intentionally reads settings and locale
 * at delivery time so a long-running job honors changes made while it was active.
 */
export class NotificationService {
  constructor(
    private readonly settings: NotificationSettings,
    private readonly i18n: NotificationTranslator,
    private readonly navigate?: (route: string) => void,
    private readonly backend: NotificationBackend = electronBackend
  ) {}

  show(
    titleKey: string,
    bodyKey: string,
    vars?: Record<string, string | number>,
    route?: string
  ): void {
    try {
      // Read both settings and translations at delivery time. The operation may
      // have started before the user changed either preference.
      if (!this.settings.get().notificationsEnabled || !this.backend.isSupported()) return
      const notification = this.backend.create({
        title: this.i18n.t(titleKey, vars),
        body: this.i18n.t(bodyKey, vars)
      })
      if (route && this.navigate) notification.on('click', () => this.navigate?.(route))
      notification.show()
    } catch {
      // System notifications are best-effort and must never change job results.
    }
  }
}
