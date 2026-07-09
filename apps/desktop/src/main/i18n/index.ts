import type { Locale } from '@oh-my-huggingface/shared'
import { SUPPORTED_LOCALES } from '@oh-my-huggingface/shared'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'

type Dict = Record<string, unknown>

const DICTIONARIES: Record<Locale, Dict> = {
  en,
  'zh-CN': zhCN
}

/** Map a system locale (e.g. "zh-Hans-CN") to a supported app locale. */
export function matchLocale(systemLocale: string): Locale {
  const lower = systemLocale.toLowerCase()
  if (lower.startsWith('zh')) return 'zh-CN'
  const exact = SUPPORTED_LOCALES.find((l) => l.toLowerCase() === lower)
  return exact ?? 'en'
}

function lookup(dict: Dict, path: string): string | undefined {
  let node: unknown = dict
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Dict)[part]
  }
  return typeof node === 'string' ? node : undefined
}

/**
 * Minimal translator for main-process strings (menus, notifications, dialogs).
 * The renderer uses react-i18next; this keeps the main side dependency-free.
 */
export class MainI18n {
  private locale: Locale = 'en'

  setLocale(locale: Locale): void {
    this.locale = locale
  }

  getLocale(): Locale {
    return this.locale
  }

  t(key: string, vars?: Record<string, string | number>): string {
    const raw = lookup(DICTIONARIES[this.locale], key) ?? lookup(DICTIONARIES.en, key) ?? key
    if (!vars) return raw
    return raw.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name] ?? ''))
  }
}
