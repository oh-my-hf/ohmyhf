import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

// Namespaced resources; adding a language = adding a folder and one import block here.
import enAdmin from './locales/en/admin.json'
import enAuth from './locales/en/auth.json'
import enBrowse from './locales/en/browse.json'
import enCache from './locales/en/cache.json'
import enCollections from './locales/en/collections.json'
import enCommon from './locales/en/common.json'
import enCompare from './locales/en/compare.json'
import enDetail from './locales/en/detail.json'
import enDownloads from './locales/en/downloads.json'
import enErrors from './locales/en/errors.json'
import enHistory from './locales/en/history.json'
import enHome from './locales/en/home.json'
import enInbox from './locales/en/inbox.json'
import enIntegrations from './locales/en/integrations.json'
import enNav from './locales/en/nav.json'
import enPapers from './locales/en/papers.json'
import enProfile from './locales/en/profile.json'
import enSettings from './locales/en/settings.json'
import enShortcuts from './locales/en/shortcuts.json'
import enUpload from './locales/en/upload.json'
import zhCNAdmin from './locales/zh-CN/admin.json'
import zhCNAuth from './locales/zh-CN/auth.json'
import zhCNBrowse from './locales/zh-CN/browse.json'
import zhCNCache from './locales/zh-CN/cache.json'
import zhCNCollections from './locales/zh-CN/collections.json'
import zhCNCommon from './locales/zh-CN/common.json'
import zhCNCompare from './locales/zh-CN/compare.json'
import zhCNDetail from './locales/zh-CN/detail.json'
import zhCNDownloads from './locales/zh-CN/downloads.json'
import zhCNErrors from './locales/zh-CN/errors.json'
import zhCNHistory from './locales/zh-CN/history.json'
import zhCNHome from './locales/zh-CN/home.json'
import zhCNInbox from './locales/zh-CN/inbox.json'
import zhCNIntegrations from './locales/zh-CN/integrations.json'
import zhCNNav from './locales/zh-CN/nav.json'
import zhCNPapers from './locales/zh-CN/papers.json'
import zhCNProfile from './locales/zh-CN/profile.json'
import zhCNSettings from './locales/zh-CN/settings.json'
import zhCNShortcuts from './locales/zh-CN/shortcuts.json'
import zhCNUpload from './locales/zh-CN/upload.json'
import zhTWAdmin from './locales/zh-TW/admin.json'
import zhTWAuth from './locales/zh-TW/auth.json'
import zhTWBrowse from './locales/zh-TW/browse.json'
import zhTWCache from './locales/zh-TW/cache.json'
import zhTWCollections from './locales/zh-TW/collections.json'
import zhTWCommon from './locales/zh-TW/common.json'
import zhTWCompare from './locales/zh-TW/compare.json'
import zhTWDetail from './locales/zh-TW/detail.json'
import zhTWDownloads from './locales/zh-TW/downloads.json'
import zhTWErrors from './locales/zh-TW/errors.json'
import zhTWHistory from './locales/zh-TW/history.json'
import zhTWHome from './locales/zh-TW/home.json'
import zhTWInbox from './locales/zh-TW/inbox.json'
import zhTWIntegrations from './locales/zh-TW/integrations.json'
import zhTWNav from './locales/zh-TW/nav.json'
import zhTWPapers from './locales/zh-TW/papers.json'
import zhTWProfile from './locales/zh-TW/profile.json'
import zhTWSettings from './locales/zh-TW/settings.json'
import zhTWShortcuts from './locales/zh-TW/shortcuts.json'
import zhTWUpload from './locales/zh-TW/upload.json'
import jaAdmin from './locales/ja/admin.json'
import jaAuth from './locales/ja/auth.json'
import jaBrowse from './locales/ja/browse.json'
import jaCache from './locales/ja/cache.json'
import jaCollections from './locales/ja/collections.json'
import jaCommon from './locales/ja/common.json'
import jaCompare from './locales/ja/compare.json'
import jaDetail from './locales/ja/detail.json'
import jaDownloads from './locales/ja/downloads.json'
import jaErrors from './locales/ja/errors.json'
import jaHistory from './locales/ja/history.json'
import jaHome from './locales/ja/home.json'
import jaInbox from './locales/ja/inbox.json'
import jaIntegrations from './locales/ja/integrations.json'
import jaNav from './locales/ja/nav.json'
import jaPapers from './locales/ja/papers.json'
import jaProfile from './locales/ja/profile.json'
import jaSettings from './locales/ja/settings.json'
import jaShortcuts from './locales/ja/shortcuts.json'
import jaUpload from './locales/ja/upload.json'
import koAdmin from './locales/ko/admin.json'
import koAuth from './locales/ko/auth.json'
import koBrowse from './locales/ko/browse.json'
import koCache from './locales/ko/cache.json'
import koCollections from './locales/ko/collections.json'
import koCommon from './locales/ko/common.json'
import koCompare from './locales/ko/compare.json'
import koDetail from './locales/ko/detail.json'
import koDownloads from './locales/ko/downloads.json'
import koErrors from './locales/ko/errors.json'
import koHistory from './locales/ko/history.json'
import koHome from './locales/ko/home.json'
import koInbox from './locales/ko/inbox.json'
import koIntegrations from './locales/ko/integrations.json'
import koNav from './locales/ko/nav.json'
import koPapers from './locales/ko/papers.json'
import koProfile from './locales/ko/profile.json'
import koSettings from './locales/ko/settings.json'
import koShortcuts from './locales/ko/shortcuts.json'
import koUpload from './locales/ko/upload.json'
import deAdmin from './locales/de/admin.json'
import deAuth from './locales/de/auth.json'
import deBrowse from './locales/de/browse.json'
import deCache from './locales/de/cache.json'
import deCollections from './locales/de/collections.json'
import deCommon from './locales/de/common.json'
import deCompare from './locales/de/compare.json'
import deDetail from './locales/de/detail.json'
import deDownloads from './locales/de/downloads.json'
import deErrors from './locales/de/errors.json'
import deHistory from './locales/de/history.json'
import deHome from './locales/de/home.json'
import deInbox from './locales/de/inbox.json'
import deIntegrations from './locales/de/integrations.json'
import deNav from './locales/de/nav.json'
import dePapers from './locales/de/papers.json'
import deProfile from './locales/de/profile.json'
import deSettings from './locales/de/settings.json'
import deShortcuts from './locales/de/shortcuts.json'
import deUpload from './locales/de/upload.json'
import esAdmin from './locales/es/admin.json'
import esAuth from './locales/es/auth.json'
import esBrowse from './locales/es/browse.json'
import esCache from './locales/es/cache.json'
import esCollections from './locales/es/collections.json'
import esCommon from './locales/es/common.json'
import esCompare from './locales/es/compare.json'
import esDetail from './locales/es/detail.json'
import esDownloads from './locales/es/downloads.json'
import esErrors from './locales/es/errors.json'
import esHistory from './locales/es/history.json'
import esHome from './locales/es/home.json'
import esInbox from './locales/es/inbox.json'
import esIntegrations from './locales/es/integrations.json'
import esNav from './locales/es/nav.json'
import esPapers from './locales/es/papers.json'
import esProfile from './locales/es/profile.json'
import esSettings from './locales/es/settings.json'
import esShortcuts from './locales/es/shortcuts.json'
import esUpload from './locales/es/upload.json'
import frAdmin from './locales/fr/admin.json'
import frAuth from './locales/fr/auth.json'
import frBrowse from './locales/fr/browse.json'
import frCache from './locales/fr/cache.json'
import frCollections from './locales/fr/collections.json'
import frCommon from './locales/fr/common.json'
import frCompare from './locales/fr/compare.json'
import frDetail from './locales/fr/detail.json'
import frDownloads from './locales/fr/downloads.json'
import frErrors from './locales/fr/errors.json'
import frHistory from './locales/fr/history.json'
import frHome from './locales/fr/home.json'
import frInbox from './locales/fr/inbox.json'
import frIntegrations from './locales/fr/integrations.json'
import frNav from './locales/fr/nav.json'
import frPapers from './locales/fr/papers.json'
import frProfile from './locales/fr/profile.json'
import frSettings from './locales/fr/settings.json'
import frShortcuts from './locales/fr/shortcuts.json'
import frUpload from './locales/fr/upload.json'
import ptBRAdmin from './locales/pt-BR/admin.json'
import ptBRAuth from './locales/pt-BR/auth.json'
import ptBRBrowse from './locales/pt-BR/browse.json'
import ptBRCache from './locales/pt-BR/cache.json'
import ptBRCollections from './locales/pt-BR/collections.json'
import ptBRCommon from './locales/pt-BR/common.json'
import ptBRCompare from './locales/pt-BR/compare.json'
import ptBRDetail from './locales/pt-BR/detail.json'
import ptBRDownloads from './locales/pt-BR/downloads.json'
import ptBRErrors from './locales/pt-BR/errors.json'
import ptBRHistory from './locales/pt-BR/history.json'
import ptBRHome from './locales/pt-BR/home.json'
import ptBRInbox from './locales/pt-BR/inbox.json'
import ptBRIntegrations from './locales/pt-BR/integrations.json'
import ptBRNav from './locales/pt-BR/nav.json'
import ptBRPapers from './locales/pt-BR/papers.json'
import ptBRProfile from './locales/pt-BR/profile.json'
import ptBRSettings from './locales/pt-BR/settings.json'
import ptBRShortcuts from './locales/pt-BR/shortcuts.json'
import ptBRUpload from './locales/pt-BR/upload.json'

export const NAMESPACES = [
  'admin',
  'auth',
  'browse',
  'cache',
  'collections',
  'common',
  'compare',
  'detail',
  'downloads',
  'errors',
  'history',
  'home',
  'inbox',
  'integrations',
  'nav',
  'papers',
  'profile',
  'settings',
  'shortcuts',
  'upload'
] as const

const resources = {
  en: {
    admin: enAdmin,
    auth: enAuth,
    browse: enBrowse,
    cache: enCache,
    collections: enCollections,
    common: enCommon,
    compare: enCompare,
    detail: enDetail,
    downloads: enDownloads,
    errors: enErrors,
    history: enHistory,
    home: enHome,
    inbox: enInbox,
    integrations: enIntegrations,
    nav: enNav,
    papers: enPapers,
    profile: enProfile,
    settings: enSettings,
    shortcuts: enShortcuts,
    upload: enUpload
  },
  'zh-CN': {
    admin: zhCNAdmin,
    auth: zhCNAuth,
    browse: zhCNBrowse,
    cache: zhCNCache,
    collections: zhCNCollections,
    common: zhCNCommon,
    compare: zhCNCompare,
    detail: zhCNDetail,
    downloads: zhCNDownloads,
    errors: zhCNErrors,
    history: zhCNHistory,
    home: zhCNHome,
    inbox: zhCNInbox,
    integrations: zhCNIntegrations,
    nav: zhCNNav,
    papers: zhCNPapers,
    profile: zhCNProfile,
    settings: zhCNSettings,
    shortcuts: zhCNShortcuts,
    upload: zhCNUpload
  },
  'zh-TW': {
    admin: zhTWAdmin,
    auth: zhTWAuth,
    browse: zhTWBrowse,
    cache: zhTWCache,
    collections: zhTWCollections,
    common: zhTWCommon,
    compare: zhTWCompare,
    detail: zhTWDetail,
    downloads: zhTWDownloads,
    errors: zhTWErrors,
    history: zhTWHistory,
    home: zhTWHome,
    inbox: zhTWInbox,
    integrations: zhTWIntegrations,
    nav: zhTWNav,
    papers: zhTWPapers,
    profile: zhTWProfile,
    settings: zhTWSettings,
    shortcuts: zhTWShortcuts,
    upload: zhTWUpload
  },
  ja: {
    admin: jaAdmin,
    auth: jaAuth,
    browse: jaBrowse,
    cache: jaCache,
    collections: jaCollections,
    common: jaCommon,
    compare: jaCompare,
    detail: jaDetail,
    downloads: jaDownloads,
    errors: jaErrors,
    history: jaHistory,
    home: jaHome,
    inbox: jaInbox,
    integrations: jaIntegrations,
    nav: jaNav,
    papers: jaPapers,
    profile: jaProfile,
    settings: jaSettings,
    shortcuts: jaShortcuts,
    upload: jaUpload
  },
  ko: {
    admin: koAdmin,
    auth: koAuth,
    browse: koBrowse,
    cache: koCache,
    collections: koCollections,
    common: koCommon,
    compare: koCompare,
    detail: koDetail,
    downloads: koDownloads,
    errors: koErrors,
    history: koHistory,
    home: koHome,
    inbox: koInbox,
    integrations: koIntegrations,
    nav: koNav,
    papers: koPapers,
    profile: koProfile,
    settings: koSettings,
    shortcuts: koShortcuts,
    upload: koUpload
  },
  de: {
    admin: deAdmin,
    auth: deAuth,
    browse: deBrowse,
    cache: deCache,
    collections: deCollections,
    common: deCommon,
    compare: deCompare,
    detail: deDetail,
    downloads: deDownloads,
    errors: deErrors,
    history: deHistory,
    home: deHome,
    inbox: deInbox,
    integrations: deIntegrations,
    nav: deNav,
    papers: dePapers,
    profile: deProfile,
    settings: deSettings,
    shortcuts: deShortcuts,
    upload: deUpload
  },
  es: {
    admin: esAdmin,
    auth: esAuth,
    browse: esBrowse,
    cache: esCache,
    collections: esCollections,
    common: esCommon,
    compare: esCompare,
    detail: esDetail,
    downloads: esDownloads,
    errors: esErrors,
    history: esHistory,
    home: esHome,
    inbox: esInbox,
    integrations: esIntegrations,
    nav: esNav,
    papers: esPapers,
    profile: esProfile,
    settings: esSettings,
    shortcuts: esShortcuts,
    upload: esUpload
  },
  fr: {
    admin: frAdmin,
    auth: frAuth,
    browse: frBrowse,
    cache: frCache,
    collections: frCollections,
    common: frCommon,
    compare: frCompare,
    detail: frDetail,
    downloads: frDownloads,
    errors: frErrors,
    history: frHistory,
    home: frHome,
    inbox: frInbox,
    integrations: frIntegrations,
    nav: frNav,
    papers: frPapers,
    profile: frProfile,
    settings: frSettings,
    shortcuts: frShortcuts,
    upload: frUpload
  },
  'pt-BR': {
    admin: ptBRAdmin,
    auth: ptBRAuth,
    browse: ptBRBrowse,
    cache: ptBRCache,
    collections: ptBRCollections,
    common: ptBRCommon,
    compare: ptBRCompare,
    detail: ptBRDetail,
    downloads: ptBRDownloads,
    errors: ptBRErrors,
    history: ptBRHistory,
    home: ptBRHome,
    inbox: ptBRInbox,
    integrations: ptBRIntegrations,
    nav: ptBRNav,
    papers: ptBRPapers,
    profile: ptBRProfile,
    settings: ptBRSettings,
    shortcuts: ptBRShortcuts,
    upload: ptBRUpload
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
