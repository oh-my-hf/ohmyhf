import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * i18n guard: every locale must ship the exact same key set as English.
 * A missing or extra key in any namespace fails CI.
 */
const localesDir = join(__dirname, 'locales')

function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? flatKeys(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  )
}

describe('locale completeness', () => {
  const locales = readdirSync(localesDir)
  const namespaces = readdirSync(join(localesDir, 'en'))

  it('ships en and zh-CN', () => {
    expect(locales).toContain('en')
    expect(locales).toContain('zh-CN')
  })

  for (const locale of locales.filter((l) => l !== 'en')) {
    for (const ns of namespaces) {
      it(`${locale}/${ns} mirrors en/${ns}`, () => {
        const en = JSON.parse(readFileSync(join(localesDir, 'en', ns), 'utf8'))
        const other = JSON.parse(readFileSync(join(localesDir, locale, ns), 'utf8'))
        expect(flatKeys(other).sort()).toEqual(flatKeys(en).sort())
      })
    }
  }
})
