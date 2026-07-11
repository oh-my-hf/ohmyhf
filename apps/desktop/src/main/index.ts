import { join } from 'node:path'
import { BrowserWindow, app, nativeTheme, shell } from 'electron'
import type { IpcEventChannel, IpcEventPayload } from '@oh-my-huggingface/shared'
import { AuthManager } from './auth'
import { CacheManager } from './cache'
import { openDatabase } from './db'
import { DownloadManager } from './downloads'
import { FollowsPoller } from './follows'
import { createHubClient, createHubProxy, rebuildHubClient, type HubHolder } from './hub'
import { MainI18n, matchLocale } from './i18n'
import { registerIpcHandlers } from './ipc'
import { Library } from './library'
import { buildMenu } from './menu'
import { applyAppProxy } from './proxy'
import { SettingsStore } from './settings'
import { TrayManager } from './tray'
import { resolveUpdateClient, UpdateManager } from './updater'

// One identity everywhere: dev and packaged share the same safeStorage keychain
// entry and userData, so the ~/.oh_my_hf credentials decrypt in every session.
// This matches the identity existing installs already used — never change it,
// or stored ciphertexts stop decrypting and profiles orphan.
app.setName('oh-my-huggingface-desktop')

const isDev = !app.isPackaged
// Squirrel.Mac requires signed current and replacement apps. Keep automatic
// installation gated until the signing checklist in docs/signing.md is complete.
const macAutoInstallEnabled = false

// E2E tests point userData at a temp dir so they never touch a real profile.
if (process.env.OMH_USER_DATA_DIR) {
  app.setPath('userData', process.env.OMH_USER_DATA_DIR)
}

function broadcast<C extends IpcEventChannel>(channel: C, payload: IpcEventPayload<C>): void {
  // Callers include timers (download progress, inference delta flushes); a send that
  // races window destruction must never become an uncaught exception in main.
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue
    try {
      win.webContents.send(channel, payload)
    } catch {
      /* window closed mid-send */
    }
  }
}

function navigate(route: string): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
  broadcast('evt:navigate', route)
}

// Dev and packaged now share one app identity; skip the lock in dev so a running
// packaged instance doesn't swallow `pnpm dev` launches.
const gotLock = app.isPackaged ? app.requestSingleInstanceLock() : true
if (!gotLock) {
  app.quit()
} else {
  let isQuitting = false

  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  void app.whenReady().then(async () => {
    const db = openDatabase()
    const settings = new SettingsStore(db)
    const i18n = new MainI18n()
    const configuredLocale = settings.get().locale
    i18n.setLocale(configuredLocale === 'system' ? matchLocale(app.getLocale()) : configuredLocale)

    const auth = new AuthManager(db, (state) => broadcast('evt:auth', state))
    const initial = settings.get()
    const hubHolder: HubHolder = {
      current: createHubClient(() => auth.accessToken(), {
        endpoint: initial.hubEndpoint,
        proxyUrl: initial.proxyUrl
      })
    }
    const hub = createHubProxy(hubHolder)
    auth.attachClient(hubHolder.current)
    await applyAppProxy(initial.proxyUrl)
    app.setLoginItemSettings({ openAtLogin: initial.launchAtLogin })

    const library = new Library(db, () => settings.get().historyLimit)
    const cache = new CacheManager(settings)
    const downloads = new DownloadManager(
      db,
      settings,
      hub,
      i18n,
      () => auth.accessToken(),
      (tasks) => broadcast('evt:downloads', tasks),
      navigate
    )
    const follows = new FollowsPoller(
      library,
      hub,
      settings,
      i18n,
      (items) => broadcast('evt:inbox', items),
      navigate
    )
    const updater = new UpdateManager({
      currentVersion: app.getVersion(),
      isPackaged: app.isPackaged,
      autoInstallSupported: process.platform !== 'darwin' || macAutoInstallEnabled,
      loadUpdater: async () => {
        const updaterModule = await import('electron-updater')
        return resolveUpdateClient(updaterModule)
      },
      onStateChange: (state) => broadcast('evt:updater', state)
    })

    const tray = new TrayManager(
      () => BrowserWindow.getAllWindows()[0],
      i18n,
      () => {
        isQuitting = true
        app.quit()
      }
    )

    const rebuildMenu = (): void => {
      buildMenu(i18n, navigate)
      tray.refreshMenu()
    }

    const applyNetworkSettings = async (
      next: { hubEndpoint: string | null; proxyUrl: string | null },
      prev: { hubEndpoint: string | null; proxyUrl: string | null }
    ): Promise<void> => {
      const endpointChanged = next.hubEndpoint !== prev.hubEndpoint
      const proxyChanged = next.proxyUrl !== prev.proxyUrl
      if (!endpointChanged && !proxyChanged) return
      if (proxyChanged) await applyAppProxy(next.proxyUrl)
      if (endpointChanged || proxyChanged) {
        rebuildHubClient(hubHolder, () => auth.accessToken(), {
          endpoint: next.hubEndpoint,
          proxyUrl: next.proxyUrl
        })
        auth.attachClient(hubHolder.current)
      }
    }

    const isDarkTheme = (): boolean => {
      const theme = settings.get().theme
      return theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
    }

    // Native minimize/maximize/close drawn over the TopBar (h-11 = 44px);
    // colors track the renderer theme (--c-bg / --c-ink-muted). Height is
    // 43px — one short of the TopBar — so the overlay's opaque background
    // doesn't paint over the header's 1px bottom border.
    const titleBarOverlay = (): Electron.TitleBarOverlayOptions =>
      isDarkTheme()
        ? { color: '#030712', symbolColor: '#99a1af', height: 43 }
        : { color: '#ffffff', symbolColor: '#4a5565', height: 43 }

    const refreshTitleBarOverlay = (): void => {
      if (process.platform !== 'win32') return
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.setTitleBarOverlay(titleBarOverlay())
      }
    }
    nativeTheme.on('updated', refreshTitleBarOverlay)

    const applyDesktopSettings = (
      next: { launchAtLogin: boolean; closeToTray: boolean; theme: string },
      prev: { launchAtLogin: boolean; closeToTray: boolean; theme: string }
    ): void => {
      if (next.theme !== prev.theme) refreshTitleBarOverlay()
      if (next.launchAtLogin !== prev.launchAtLogin) {
        app.setLoginItemSettings({ openAtLogin: next.launchAtLogin })
      }
      if (next.closeToTray === prev.closeToTray) return
      if (next.closeToTray) {
        tray.ensure()
      } else {
        const win = BrowserWindow.getAllWindows()[0]
        if (win && !win.isDestroyed() && !win.isVisible()) {
          win.show()
        }
        tray.destroy()
      }
    }

    registerIpcHandlers({
      db,
      hub,
      auth,
      settings,
      library,
      downloads,
      cache,
      follows,
      updater,
      i18n,
      rebuildMenu,
      broadcast,
      applyNetworkSettings,
      applyDesktopSettings
    })
    rebuildMenu()
    if (initial.closeToTray) tray.ensure()

    const windowBackground = (): string => (isDarkTheme() ? '#030712' : '#ffffff')

    const createWindow = (backgroundColor: string): BrowserWindow => {
      const win = new BrowserWindow({
        width: 1360,
        height: 860,
        minWidth: 760,
        minHeight: 520,
        show: false,
        // Matches the renderer's --c-bg per theme so first paint never flashes white.
        backgroundColor,
        // Hide the native menu bar on Windows/Linux (Alt reveals it); its
        // accelerators (Ctrl+1..8, Ctrl+,, zoom, reload) keep working.
        autoHideMenuBar: true,
        ...(process.platform === 'darwin'
          ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 14 } }
          : {}),
        // Windows: drop the native title bar; the system window controls render
        // as an overlay on the TopBar (keeps Snap Layouts on the maximize button).
        ...(process.platform === 'win32'
          ? { titleBarStyle: 'hidden' as const, titleBarOverlay: titleBarOverlay() }
          : {}),
        // Window/taskbar icon for Windows and Linux; macOS uses the app bundle icon.
        ...(process.platform !== 'darwin'
          ? { icon: join(__dirname, '../../build/icon.png') }
          : {}),
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true
        }
      })

      win.on('ready-to-show', () => win.show())

      win.on('close', (event) => {
        if (isQuitting || !settings.get().closeToTray) return
        event.preventDefault()
        win.hide()
        tray.ensure()
      })

      // Every external navigation goes through the system browser; the window never leaves the app.
      win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://')) void shell.openExternal(url)
        return { action: 'deny' }
      })
      win.webContents.on('will-navigate', (event, url) => {
        if (url !== win.webContents.getURL()) {
          event.preventDefault()
          if (url.startsWith('https://')) void shell.openExternal(url)
        }
      })

      if (isDev && process.env.ELECTRON_RENDERER_URL) {
        void win.loadURL(process.env.ELECTRON_RENDERER_URL)
      } else {
        void win.loadFile(join(__dirname, '../renderer/index.html'))
      }
      return win
    }

    createWindow(windowBackground())
    follows.start()

    if (!isDev) {
      // Compare this packaged version with the latest published GitHub Release.
      // Download and installation remain explicit user actions in Settings → About.
      void updater.checkForUpdates()
    }

    // Session restore happens after the window exists so auth events reach the UI.
    void auth.init()

    app.on('activate', () => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
      } else {
        createWindow(windowBackground())
      }
    })

    app.on('before-quit', () => {
      isQuitting = true
      downloads.shutdown()
      follows.stop()
      tray.destroy()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
