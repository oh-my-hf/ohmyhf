/**
 * System tray: Show / Quit. Created when close-to-tray is enabled (or on first hide).
 */
import { Menu, Tray, nativeImage } from 'electron'
import type { BrowserWindow, NativeImage } from 'electron'
import type { MainI18n } from './i18n'
// ?asset copies the icon into out/ and resolves the path at runtime; a plain
// __dirname-relative path breaks in packaged builds (only out/** is bundled).
import trayIconAsset from '../../build/icon.png?asset'

function trayIcon(): NativeImage {
  const source = nativeImage.createFromPath(trayIconAsset)
  if (source.isEmpty()) return nativeImage.createEmpty()
  // 16pt with an explicit @2x representation; a bare 16px resize is blurry on Retina.
  const icon = nativeImage.createEmpty()
  icon.addRepresentation({ scaleFactor: 1, buffer: source.resize({ width: 16, height: 16 }).toPNG() })
  icon.addRepresentation({ scaleFactor: 2, buffer: source.resize({ width: 32, height: 32 }).toPNG() })
  return icon
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
    this.tray = new Tray(trayIcon())
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
