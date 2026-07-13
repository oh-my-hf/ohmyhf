/**
 * Capture marketing/docs screenshots into docs/screenshots/.
 *
 * Usage (from apps/desktop, after `electron-vite build`):
 *   ELECTRON_RUN_AS_NODE= pnpm exec playwright test e2e/capture-screenshots.spec.ts
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, type Page } from '@playwright/test'
import { test } from '@playwright/test'

const OUT = resolve(__dirname, '../../../docs/screenshots')
const DESKTOP = resolve(__dirname, '..')

async function settle(page: Page, ms = 800): Promise<void> {
  await page.waitForTimeout(ms)
}

async function go(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => {
    window.location.hash = h
  }, hash)
  await settle(page, 500)
}

async function waitForMain(page: Page): Promise<void> {
  await page.waitForSelector('aside nav', { timeout: 60_000 })
  await page.waitForSelector('main', { timeout: 15_000 })
}

async function shot(page: Page, name: string): Promise<void> {
  await settle(page, 1200)
  await page.screenshot({ path: join(OUT, name), type: 'png' })
}

// settings:set alone never restyles the running renderer (main.tsx reads settings
// once at startup), so persist the theme, reload, and wait for the shell to remount
// before re-navigating and shooting.
async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate(async (t) => {
    await window.omh.invoke('settings:set', { patch: { theme: t } })
  }, theme)
  await page.evaluate(() => window.location.reload()).catch(() => undefined)
  await settle(page, 500)
  await waitForMain(page)
}

test('capture docs screenshots', async () => {
  test.skip(
    !process.env.CAPTURE_SCREENSHOTS,
    'Set CAPTURE_SCREENSHOTS=1 to regenerate docs/screenshots'
  )
  test.setTimeout(10 * 60_000)
  const userDataDir = mkdtempSync(join(tmpdir(), 'omh-shots-'))
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  env.OMH_USER_DATA_DIR = userDataDir
  env.OMH_CREDENTIALS_DIR = userDataDir

  const app = await electron.launch({
    args: ['.'],
    cwd: DESKTOP,
    env
  })

  try {
    const page = await app.firstWindow()
    // Match the app's default window (1360×860) at 2× for retina docs assets.
    const bw = await app.browserWindow(page)
    await bw.evaluate((win) => {
      win.setBounds({ x: 80, y: 60, width: 1360, height: 860 })
    })
    const session = await page.context().newCDPSession(page)
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 1360,
      height: 860,
      deviceScaleFactor: 2,
      mobile: false
    })
    await waitForMain(page)

    // Force English + light for consistent docs shots.
    await page.evaluate(async () => {
      await window.omh.invoke('settings:set', { patch: { locale: 'en', theme: 'light' } })
    })
    await settle(page, 600)

    // --- home-feed ---
    await go(page, '#/')
    await page.waitForSelector('text=Home', { timeout: 30_000 })
    // Wait for posts or trending rail to populate.
    await page.waitForSelector('text=Trending', { timeout: 30_000 })
    await settle(page, 2500)
    await shot(page, 'home-feed.png')

    // --- home-feed-dark ---
    await setTheme(page, 'dark')
    await go(page, '#/')
    await page.waitForSelector('text=Home', { timeout: 30_000 })
    await page.waitForSelector('text=Trending', { timeout: 30_000 })
    await settle(page, 2500)
    await shot(page, 'home-feed-dark.png')
    await setTheme(page, 'light')

    // --- browse (model card) ---
    await go(page, '#/models/tencent/Hy3')
    await page.waitForSelector('text=tencent/Hy3', { timeout: 45_000 })
    await page
      .getByRole('tab', { name: /^Card$/i })
      .click()
      .catch(() => undefined)
    await settle(page, 2500)
    await shot(page, 'browse.png')

    // --- browse-dark ---
    await setTheme(page, 'dark')
    await go(page, '#/models/tencent/Hy3')
    await page.waitForSelector('text=tencent/Hy3', { timeout: 45_000 })
    await settle(page, 2500)
    await shot(page, 'browse-dark.png')
    await setTheme(page, 'light')
    await settle(page, 800)

    // --- filter-panel ---
    await go(page, '#/models')
    await page.waitForSelector('input[data-list-search]', { timeout: 20_000 })
    await page.getByRole('button', { name: /filter/i }).click()
    await page.waitForSelector('text=Tasks', { timeout: 10_000 })
    await settle(page, 800)
    await shot(page, 'filter-panel.png')
    // Close panel
    await page
      .getByRole('button', { name: /done|filter/i })
      .first()
      .click()
      .catch(() => undefined)
    await settle(page, 400)

    // --- filter-panel-dark ---
    await setTheme(page, 'dark')
    await go(page, '#/models')
    await page.waitForSelector('input[data-list-search]', { timeout: 20_000 })
    await page.getByRole('button', { name: /filter/i }).click()
    await page.waitForSelector('text=Tasks', { timeout: 10_000 })
    await settle(page, 800)
    await shot(page, 'filter-panel-dark.png')
    await page
      .getByRole('button', { name: /done|filter/i })
      .first()
      .click()
      .catch(() => undefined)
    await settle(page, 400)
    await setTheme(page, 'light')

    // --- file-preview ---
    await go(page, '#/models/openai-community/gpt2')
    await page.waitForSelector('text=openai-community/gpt2', { timeout: 45_000 })
    await page.getByRole('tab', { name: /^Files$/i }).click()
    await page.waitForSelector('text=config.json', { timeout: 30_000 })
    await page.getByText('config.json', { exact: true }).first().click()
    await page.waitForSelector('text=n_embd', { timeout: 30_000 })
    await settle(page, 1000)
    await shot(page, 'file-preview.png')

    // --- file-preview-dark ---
    await setTheme(page, 'dark')
    await go(page, '#/models/openai-community/gpt2')
    await page.waitForSelector('text=openai-community/gpt2', { timeout: 45_000 })
    await page.getByRole('tab', { name: /^Files$/i }).click()
    await page.waitForSelector('text=config.json', { timeout: 30_000 })
    await page.getByText('config.json', { exact: true }).first().click()
    await page.waitForSelector('text=n_embd', { timeout: 30_000 })
    await settle(page, 1000)
    await shot(page, 'file-preview-dark.png')
    await setTheme(page, 'light')

    // --- pr-files ---
    await page.getByRole('tab', { name: /^Discussions$/i }).click()
    await settle(page, 1500)
    // Prefer PRs segment if present
    const prTab = page.getByRole('button', { name: /Pull Requests/i })
    if (await prTab.count()) await prTab.first().click()
    await settle(page, 1000)
    // Open discussion #159 if listed, else first clickable discussion row
    const pr159 = page.getByText(/Update model config to fix architecture mismatch/i)
    if (await pr159.count()) {
      await pr159.first().click()
    } else {
      const row = page.locator('button').filter({ hasText: /#\d+/ }).first()
      await row.click()
    }
    await settle(page, 1500)
    const filesTab = page.getByRole('tab', { name: /Files changed/i })
    await expect(filesTab).toBeVisible({ timeout: 30_000 })
    await filesTab.click()
    await settle(page, 2000)
    await shot(page, 'pr-files.png')

    // --- dataset-preview ---
    // The dataset-viewer backend (datasets-server.huggingface.co) is a separate service from
    // the Hub API and occasionally has outages independent of this dataset; don't let a
    // transient 503 there abort the rest of the capture run.
    await go(page, '#/datasets/stanfordnlp/imdb')
    await page.waitForSelector('text=stanfordnlp/imdb', { timeout: 45_000 })
    await page.getByRole('tab', { name: /^Preview$/i }).click()
    const datasetViewerReady = await page
      .waitForSelector('text=label', { timeout: 45_000 })
      .then(() => true)
      .catch(() => false)
    if (datasetViewerReady) {
      await settle(page, 2000)
      await shot(page, 'dataset-preview.png')
    } else {
      console.warn(
        '[capture-screenshots] dataset viewer unavailable for stanfordnlp/imdb — skipping dataset-preview.png'
      )
    }

    // --- spaces-gallery ---
    await go(page, '#/spaces')
    await page.waitForSelector('input[data-list-search]', { timeout: 20_000 })
    // Sort by likes
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: /^Likes$/i }).click()
    await settle(page, 2500)
    await shot(page, 'spaces-gallery.png')

    // --- spaces-gallery-dark ---
    await setTheme(page, 'dark')
    await go(page, '#/spaces')
    await page.waitForSelector('input[data-list-search]', { timeout: 20_000 })
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: /^Likes$/i }).click()
    await settle(page, 2500)
    await shot(page, 'spaces-gallery-dark.png')
    await setTheme(page, 'light')

    // --- space-runner ---
    await go(page, '#/spaces/akhaliq/Unlimited-OCR')
    await page.waitForSelector('text=akhaliq/Unlimited-OCR', { timeout: 45_000 })
    await page.getByRole('tab', { name: /^Run$/i }).click()
    await settle(page, 4000)
    await shot(page, 'space-runner.png')

    // --- user-profile ---
    await go(page, '#/users/julien-c')
    await page.waitForSelector('text=julien-c', { timeout: 45_000 })
    await settle(page, 2500)
    await shot(page, 'user-profile.png')

    // --- post-page ---
    // Pick a fresh post from the API via home navigation if possible; fall back to a known slug.
    await go(page, '#/')
    await settle(page, 2000)
    const postCard = page.locator('article, [class*="card"]').filter({ hasText: /Post/i }).first()
    if (await postCard.count()) {
      // Click the card's own padding, not its center — the center can land on a
      // nested UserLink/mention/attachment that stops propagation and opens its
      // own dialog (e.g. a profile hover card) instead of navigating to the post.
      await postCard.click({ position: { x: 8, y: 8 } })
      await settle(page, 2000)
    } else {
      await go(page, '#/posts/AbstractPhil/203080872373598')
      await settle(page, 2500)
    }
    await page.waitForSelector('text=Open on the Hub', { timeout: 30_000 }).catch(() => undefined)
    await settle(page, 1500)
    await shot(page, 'post-page.png')

    // --- settings-modal ---
    await page.getByRole('button', { name: /^Settings$/i }).click()
    await page.waitForSelector('text=User Access Token', { timeout: 15_000 })
    await settle(page, 800)
    await shot(page, 'settings-modal.png')
  } finally {
    await app.close()
  }
})
