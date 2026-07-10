import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

// Namespaced resources; adding a language = adding a folder and one import block here.
import enCommon from './locales/en/common.json'
import enNav from './locales/en/nav.json'
import enBrowse from './locales/en/browse.json'
import enDetail from './locales/en/detail.json'
import enPapers from './locales/en/papers.json'
import enDownloads from './locales/en/downloads.json'
import enCache from './locales/en/cache.json'
import enInbox from './locales/en/inbox.json'
import enSettings from './locales/en/settings.json'
import enAuth from './locales/en/auth.json'
import enCompare from './locales/en/compare.json'
import enUpload from './locales/en/upload.json'
import enIntegrations from './locales/en/integrations.json'
import enHome from './locales/en/home.json'
import zhCommon from './locales/zh-CN/common.json'
import zhNav from './locales/zh-CN/nav.json'
import zhBrowse from './locales/zh-CN/browse.json'
import zhDetail from './locales/zh-CN/detail.json'
import zhPapers from './locales/zh-CN/papers.json'
import zhDownloads from './locales/zh-CN/downloads.json'
import zhCache from './locales/zh-CN/cache.json'
import zhInbox from './locales/zh-CN/inbox.json'
import zhSettings from './locales/zh-CN/settings.json'
import zhAuth from './locales/zh-CN/auth.json'
import zhCompare from './locales/zh-CN/compare.json'
import zhUpload from './locales/zh-CN/upload.json'
import zhIntegrations from './locales/zh-CN/integrations.json'
import zhHome from './locales/zh-CN/home.json'

export const NAMESPACES = [
  'common',
  'nav',
  'browse',
  'detail',
  'papers',
  'downloads',
  'cache',
  'inbox',
  'settings',
  'auth',
  'compare',
  'upload',
  'integrations',
  'home'
] as const

const resources = {
  en: {
    common: enCommon,
    nav: enNav,
    browse: enBrowse,
    detail: enDetail,
    papers: enPapers,
    downloads: enDownloads,
    cache: enCache,
    inbox: enInbox,
    settings: enSettings,
    auth: enAuth,
    compare: enCompare,
    upload: enUpload,
    integrations: enIntegrations,
    home: enHome
  },
  'zh-CN': {
    common: zhCommon,
    nav: zhNav,
    browse: zhBrowse,
    detail: zhDetail,
    papers: zhPapers,
    downloads: zhDownloads,
    cache: zhCache,
    inbox: zhInbox,
    settings: zhSettings,
    auth: zhAuth,
    compare: zhCompare,
    upload: zhUpload,
    integrations: zhIntegrations,
    home: zhHome
  }
}

export async function initI18n(locale: string): Promise<void> {
  await i18next.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: 'en',
    ns: [...NAMESPACES],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    returnEmptyString: false
  })
}

export function changeLanguage(locale: string): void {
  void i18next.changeLanguage(locale)
}
