import { join } from 'node:path'
import { BrowserWindow, app, shell } from 'electron'
import type { IpcEventChannel, IpcEventPayload } from '@oh-my-huggingface/shared'
import { AuthManager } from './auth'
import { CacheManager } from './cache'
import { openDatabase } from './db'
import { DownloadManager } from './downloads'
import { FollowsPoller } from './follows'
import { createHubClient } from './hub'
import { MainI18n, matchLocale } from './i18n'
import { registerIpcHandlers } from './ipc'
import { Library } from './library'
import { buildMenu } from './menu'
import { SettingsStore } from './settings'

// One identity everywhere: dev and packaged share the same safeStorage keychain
// entry and userData, so the ~/.oh_my_hf credentials decrypt in every session.
// This matches the identity existing installs already used — never change it,
// or stored ciphertexts stop decrypting and profiles orphan.
app.setName('oh-my-huggingface-desktop')

const isDev = !app.isPackaged

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

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 760,
    minHeight: 520,
    show: false,
    autoHideMenuBar: false,
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 14 } }
      : {}),
    ...(process.platform === 'linux' ? { icon: join(__dirname, '../../build/icon.png') } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  win.on('ready-to-show', () => win.show())

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

// Dev and packaged now share one app identity; skip the lock in dev so a running
// packaged instance doesn't swallow `pnpm dev` launches.
const gotLock = app.isPackaged ? app.requestSingleInstanceLock() : true
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  void app.whenReady().then(async () => {
    const db = openDatabase()
    const settings = new SettingsStore(db)
    const i18n = new MainI18n()
    const configuredLocale = settings.get().locale
    i18n.setLocale(configuredLocale === 'system' ? matchLocale(app.getLocale()) : configuredLocale)

    const auth = new AuthManager(db, i18n, (state) => broadcast('evt:auth', state))
    const hub = createHubClient(() => auth.accessToken())
    auth.attachClient(hub)

    const library = new Library(db)
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

    const rebuildMenu = (): void => buildMenu(i18n, navigate)
    registerIpcHandlers({
      hub,
      auth,
      settings,
      library,
      downloads,
      cache,
      follows,
      i18n,
      rebuildMenu,
      broadcast
    })
    rebuildMenu()
    createWindow()
    follows.start()

    if (!isDev) {
      // Auto-update from GitHub Releases; failures (offline, unsigned dev builds) are non-fatal.
      void import('electron-updater')
        .then(({ autoUpdater }) => autoUpdater.checkForUpdatesAndNotify())
        .catch((err) => console.warn('[updater] check failed', err))
    }

    // Session restore happens after the window exists so auth events reach the UI.
    void auth.init()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    app.on('before-quit', () => {
      downloads.shutdown()
      follows.stop()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
