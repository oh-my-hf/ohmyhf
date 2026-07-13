import { describe, expect, it } from 'vitest'
import { MainI18n, matchLocale } from './index'

describe('matchLocale', () => {
  it('maps system locales to supported app locales', () => {
    expect(matchLocale('en-US')).toBe('en')
    expect(matchLocale('zh-CN')).toBe('zh-CN')
    expect(matchLocale('zh-Hans-CN')).toBe('zh-CN')
    expect(matchLocale('zh-TW')).toBe('zh-TW')
    expect(matchLocale('zh-Hant-TW')).toBe('zh-TW')
    expect(matchLocale('zh-HK')).toBe('zh-TW')
    expect(matchLocale('fr-FR')).toBe('fr')
    expect(matchLocale('ja-JP')).toBe('ja')
    expect(matchLocale('ko-KR')).toBe('ko')
    expect(matchLocale('de-DE')).toBe('de')
    expect(matchLocale('es-ES')).toBe('es')
    expect(matchLocale('pt-BR')).toBe('pt-BR')
    expect(matchLocale('pt-PT')).toBe('pt-BR')
    expect(matchLocale('it-IT')).toBe('en')
  })
})

describe('MainI18n', () => {
  it('translates with interpolation', () => {
    const i18n = new MainI18n()
    i18n.setLocale('en')
    expect(i18n.t('menu.models')).toBe('Models')
    expect(i18n.t('menu.history')).toBe('Browse History')
    expect(i18n.t('notifications.downloadCompleteBody', { repo: 'a/b' })).toBe(
      'a/b finished downloading.'
    )
  })

  it('switches locales and falls back to English for unknown keys', () => {
    const i18n = new MainI18n()
    i18n.setLocale('zh-CN')
    expect(i18n.t('menu.models')).toBe('模型')
    expect(i18n.t('menu.history')).toBe('浏览历史')
    expect(i18n.t('does.not.exist')).toBe('does.not.exist')
  })

  it('translates in a newly added locale', () => {
    const i18n = new MainI18n()
    i18n.setLocale('de')
    expect(i18n.t('menu.models')).toBe('Modelle')
    expect(i18n.t('menu.history')).toBe('Browserverlauf')
  })
})
