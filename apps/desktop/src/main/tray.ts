/**
 * System tray: Show / Quit. Created when close-to-tray is enabled (or on first hide).
 */
import { join } from 'node:path'
import { Menu, Tray, nativeImage } from 'electron'
import type { BrowserWindow } from 'electron'
import type { MainI18n } from './i18n'

function trayIconPath(): string {
  return join(__dirname, '../../build/icon.png')
}

export class TrayManager {
  private tray: Tray | null = null

  constructor(
    private readonly getWindow: () => BrowserWindow | null | undefined,
    private readonly i18n: MainI18n,
    private readonly requestQuit: () => void
  ) {}

  ensure(): void {
    if (this.tray) {
      this.refreshMenu()
      return
    }
    const image = nativeImage.createFromPath(trayIconPath())
    const icon = image.isEmpty() ? nativeImage.createEmpty() : image.resize({ width: 16, height: 16 })
    this.tray = new Tray(icon)
    this.tray.setToolTip(this.i18n.t('app.name'))
    this.refreshMenu()
    this.tray.on('click', () => this.showWindow())
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }

  /** Rebuild labels after locale change. */
  refreshMenu(): void {
    if (!this.tray) return
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: this.i18n.t('tray.show'),
          click: () => this.showWindow()
        },
        { type: 'separator' },
        {
          label: this.i18n.t('tray.quit'),
          click: () => this.requestQuit()
        }
      ])
    )
  }

  private showWindow(): void {
    const win = this.getWindow()
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
}
