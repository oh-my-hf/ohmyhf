import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

/**
 * Boot smoke test: launches the built app against a throwaway profile and checks
 * the three-pane shell renders with localized navigation.
 */
test('app boots into the three-pane shell', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'omh-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..'),
    env: { ...process.env, OMH_USER_DATA_DIR: userDataDir, OMH_CREDENTIALS_DIR: userDataDir }
  })
  try {
    const window = await app.firstWindow()
    await expect(window).toHaveTitle('Oh My HuggingFace')

    // Sidebar (navigation), main pane, and the Home feed are all present.
    await window.waitForSelector('aside nav', { timeout: 30_000 })
    await window.waitForSelector('main', { timeout: 10_000 })

    // Browse routes keep the localized search box (never a raw i18n key).
    await window.evaluate(() => {
      window.location.hash = '#/models'
    })
    const searchBox = window.locator('input[aria-label]').first()
    await expect(searchBox).toBeVisible({ timeout: 10_000 })
    const label = await searchBox.getAttribute('aria-label')
    expect(label).toBeTruthy()
    expect(label).not.toContain('searchPlaceholder')

    // The renderer runs sandboxed: no Node globals may leak in.
    expect(await window.evaluate(() => typeof (window as never)['require'])).toBe('undefined')
    expect(await window.evaluate(() => typeof (window as never)['process'])).toBe('undefined')

    // The typed IPC bridge is the only exposed API.
    expect(await window.evaluate(() => typeof window.omh?.invoke)).toBe('function')
  } finally {
    await app.close()
  }
})
