import { create } from 'zustand'
import type {
  AppInfo,
  AppSettings,
  AuthState,
  RepoKind,
  RepoSort
} from '@oh-my-huggingface/shared'
import { DEFAULT_SETTINGS } from '@oh-my-huggingface/shared'
import type { ParamBucket } from '@/lib/utils'
import { invoke } from '@/lib/ipc'
import { setTheme } from '@/lib/theme'

export interface BrowseFilters {
  search: string
  sort: RepoSort
  pipelineTag?: string
  library?: string
  license?: string
  /** Client-side parameter-count bucket (models only). */
  paramBucket?: ParamBucket
}

const defaultFilters = (kind: RepoKind): BrowseFilters => ({
  search: '',
  sort: kind === 'space' ? 'likes' : 'trending'
})

interface AppState {
  settings: AppSettings
  appInfo: AppInfo | null
  auth: AuthState
  paletteOpen: boolean
  filters: Record<RepoKind, BrowseFilters>

  setSettings: (settings: AppSettings) => void
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  setAuth: (auth: AuthState) => void
  setPaletteOpen: (open: boolean) => void
  setFilters: (kind: RepoKind, patch: Partial<BrowseFilters>) => void
  resetFilters: (kind: RepoKind) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  appInfo: null,
  auth: { status: 'signedOut' },
  paletteOpen: false,
  filters: {
    model: defaultFilters('model'),
    dataset: defaultFilters('dataset'),
    space: defaultFilters('space')
  },

  setSettings: (settings) => {
    setTheme(settings.theme)
    set({ settings })
  },
  updateSettings: async (patch) => {
    const settings = await invoke('settings:set', { patch })
    get().setSettings(settings)
  },
  setAuth: (auth) => set({ auth }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setFilters: (kind, patch) =>
    set((state) => ({
      filters: { ...state.filters, [kind]: { ...state.filters[kind], ...patch } }
    })),
  resetFilters: (kind) =>
    set((state) => ({ filters: { ...state.filters, [kind]: defaultFilters(kind) } }))
}))

/** UI locale resolved from settings + system locale; used by i18n and formatters. */
export function resolveLocale(settings: AppSettings, appInfo: AppInfo | null): string {
  if (settings.locale !== 'system') return settings.locale
  const sys = appInfo?.systemLocale ?? navigator.language
  return sys.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}
