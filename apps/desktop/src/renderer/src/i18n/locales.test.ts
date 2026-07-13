import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * i18n guard: every locale must ship the exact same key set as English.
 * A missing or extra key in any namespace fails CI.
 */
const localesDir = join(__dirname, 'locales')

function flatEntries(obj: Record<string, unknown>, prefix = ''): Array<[string, unknown]> {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? flatEntries(value as Record<string, unknown>, `${prefix}${key}.`)
      : [[`${prefix}${key}`, value] as [string, unknown]]
  )
}

/** Plural suffixes differ per language (en has _one, zh-CN does not); compare base keys. */
function baseKeys(obj: Record<string, unknown>): string[] {
  return [
    ...new Set(flatEntries(obj).map(([key]) => key.replace(/_(zero|one|two|few|many|other)$/, '')))
  ].sort()
}

describe('locale completeness', () => {
  const locales = readdirSync(localesDir)
  const namespaces = readdirSync(join(localesDir, 'en'))

  it('ships en and zh-CN', () => {
    expect(locales).toContain('en')
    expect(locales).toContain('zh-CN')
  })

  for (const locale of locales) {
    for (const ns of namespaces) {
      it(`${locale}/${ns} has no empty strings`, () => {
        const data = JSON.parse(readFileSync(join(localesDir, locale, ns), 'utf8'))
        for (const [key, value] of flatEntries(data)) {
          expect(typeof value, key).toBe('string')
          expect(value, key).not.toBe('')
        }
      })
    }
  }

  for (const locale of locales.filter((l) => l !== 'en')) {
    for (const ns of namespaces) {
      it(`${locale}/${ns} mirrors en/${ns}`, () => {
        const en = JSON.parse(readFileSync(join(localesDir, 'en', ns), 'utf8'))
        const other = JSON.parse(readFileSync(join(localesDir, locale, ns), 'utf8'))
        expect(baseKeys(other)).toEqual(baseKeys(en))
      })
    }
  }
})
