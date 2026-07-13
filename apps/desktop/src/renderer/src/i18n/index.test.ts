import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import i18next from 'i18next'
import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES } from '@oh-my-huggingface/shared'
import { NAMESPACES, initI18n } from './index'

const localesDir = join(__dirname, 'locales')

/**
 * Guards the resources object wired up in index.ts: locales.test.ts checks the raw
 * JSON files on disk, but a locale/namespace mismatch in the (hand-generated) import
 * map there would slip past it. Every bundled resource must equal its source file.
 */
describe('i18n resource wiring', () => {
  it('loads every supported locale into i18next', async () => {
    await initI18n('en')
    for (const locale of SUPPORTED_LOCALES) {
      for (const ns of NAMESPACES) {
        const bundled = i18next.getResourceBundle(locale, ns)
        const onDisk = JSON.parse(readFileSync(join(localesDir, locale, `${ns}.json`), 'utf8'))
        expect(bundled, `${locale}/${ns}`).toEqual(onDisk)
      }
    }
  })
})
