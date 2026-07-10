import { Menu, app, dialog, shell, type MenuItemConstructorOptions } from 'electron'
import type { MainI18n } from './i18n'

const REPO_URL = 'https://github.com/oh-my-hf/ohmyhf'

/** Fully localized native application menu. Rebuilt whenever the locale changes. */
export function buildMenu(i18n: MainI18n, navigate: (route: string) => void): void {
  const t = (key: string): string => i18n.t(key)
  const isMac = process.platform === 'darwin'

  const showAbout = (): void => {
    void dialog.showMessageBox({
      type: 'info',
      title: t('app.name'),
      message: t('app.name'),
      detail: i18n.t('dialogs.aboutDetail', { version: app.getVersion() }),
      buttons: [t('dialogs.ok')]
    })
  }

  const macAppMenu: MenuItemConstructorOptions = {
    label: t('app.name'),
    submenu: [
      { label: t('menu.about'), click: showAbout },
      { type: 'separator' },
      {
        label: t('menu.settings'),
        accelerator: 'CmdOrCtrl+,',
        click: () => navigate('/settings')
      },
      { type: 'separator' },
      { role: 'hide', label: t('menu.hide') },
      { role: 'hideOthers', label: t('menu.hideOthers') },
      { role: 'unhide', label: t('menu.showAll') },
      { type: 'separator' },
      { role: 'quit', label: t('menu.quit') }
    ]
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [macAppMenu] : []),
    ...(!isMac
      ? [
          {
            label: t('menu.file'),
            submenu: [
              {
                label: t('menu.settings'),
                accelerator: 'CmdOrCtrl+,',
                click: (): void => navigate('/settings')
              },
              { type: 'separator' },
              { role: 'quit', label: t('menu.quit') }
            ] as MenuItemConstructorOptions[]
          }
        ]
      : []),
    {
      label: t('menu.edit'),
      submenu: [
        { role: 'undo', label: t('menu.undo') },
        { role: 'redo', label: t('menu.redo') },
        { type: 'separator' },
        { role: 'cut', label: t('menu.cut') },
        { role: 'copy', label: t('menu.copy') },
        { role: 'paste', label: t('menu.paste') },
        { role: 'selectAll', label: t('menu.selectAll') }
      ]
    },
    {
      label: t('menu.go'),
      submenu: [
        { label: t('menu.models'), accelerator: 'CmdOrCtrl+1', click: () => navigate('/models') },
        {
          label: t('menu.datasets'),
          accelerator: 'CmdOrCtrl+2',
          click: () => navigate('/datasets')
        },
        { label: t('menu.spaces'), accelerator: 'CmdOrCtrl+3', click: () => navigate('/spaces') },
        { label: t('menu.papers'), accelerator: 'CmdOrCtrl+4', click: () => navigate('/papers') },
        { type: 'separator' },
        {
          label: t('menu.favorites'),
          accelerator: 'CmdOrCtrl+5',
          click: () => navigate('/favorites')
        },
        {
          label: t('menu.downloads'),
          accelerator: 'CmdOrCtrl+6',
          click: () => navigate('/downloads')
        },
        { label: t('menu.cache'), accelerator: 'CmdOrCtrl+7', click: () => navigate('/cache') },
        { label: t('menu.inbox'), accelerator: 'CmdOrCtrl+8', click: () => navigate('/inbox') }
      ]
    },
    {
      label: t('menu.view'),
      submenu: [
        { role: 'reload', label: t('menu.reload') },
        { role: 'forceReload', label: t('menu.forceReload') },
        { role: 'toggleDevTools', label: t('menu.toggleDevTools') },
        { type: 'separator' },
        { role: 'resetZoom', label: t('menu.resetZoom') },
        { role: 'zoomIn', label: t('menu.zoomIn') },
        { role: 'zoomOut', label: t('menu.zoomOut') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: t('menu.toggleFullscreen') }
      ]
    },
    {
      label: t('menu.window'),
      submenu: [
        { role: 'minimize', label: t('menu.minimize') },
        { role: 'close', label: t('menu.close') }
      ]
    },
    {
      label: t('menu.help'),
      role: 'help',
      submenu: [
        { label: t('menu.github'), click: () => void shell.openExternal(REPO_URL) },
        {
          label: t('menu.reportIssue'),
          click: () => void shell.openExternal(`${REPO_URL}/issues/new`)
        },
        { type: 'separator' },
        { label: t('menu.disclaimer'), click: showAbout }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
