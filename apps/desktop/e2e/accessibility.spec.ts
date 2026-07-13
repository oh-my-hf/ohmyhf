import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { _electron as electron, expect, test } from '@playwright/test'

test('sidebar and History remain keyboard reachable with no serious axe violations', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'omh-a11y-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..'),
    env: { ...process.env, OMH_USER_DATA_DIR: userDataDir, OMH_CREDENTIALS_DIR: userDataDir }
  })

  try {
    const window = await app.firstWindow()
    await window.waitForSelector('aside nav', { timeout: 30_000 })

    const sidebar = await new AxeBuilder({ page: window }).include('aside').analyze()
    expect(
      sidebar.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))
    ).toEqual([])

    await window.keyboard.press(process.platform === 'darwin' ? 'Meta+9' : 'Control+9')
    await expect(window).toHaveURL(/#\/history$/)
    await expect(
      window.getByRole('heading', { name: /^(Browse history|浏览历史)$/i })
    ).toBeVisible()

    const history = await new AxeBuilder({ page: window }).include('main').analyze()
    expect(
      history.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))
    ).toEqual([])
  } finally {
    await app.close()
  }
})
