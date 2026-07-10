import { create } from 'zustand'
import type { AppInfo, AppSettings, AuthState, RepoKind, RepoSort } from '@oh-my-huggingface/shared'
import { DEFAULT_SETTINGS } from '@oh-my-huggingface/shared'
import type { SpaceHardware } from '@/lib/catalog'
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
  /** Raw Hub `filter=` tags collected by the filter panel (multi-select). */
  tags?: string[]
  /** Models only: serverless inference provider id. */
  inferenceProvider?: string
  /** Bare ISO code; RepoList emits it as-is for models and as `language:<code>` for datasets. */
  language?: string
  /** Spaces only: client-side "runtime stage is RUNNING" filter. */
  runningOnly?: boolean
  /** Spaces only: client-side hardware bucket derived from the raw hardware id. */
  hardware?: SpaceHardware
}

const defaultFilters = (kind: RepoKind): BrowseFilters => ({
  search: '',
  sort: kind === 'space' ? 'likes' : 'trending'
})

/** Sections of the settings dialog (left nav entries). */
export type SettingsSection = 'account' | 'appearance' | 'downloads' | 'notifications' | 'about'

interface AppState {
  settings: AppSettings
  appInfo: AppInfo | null
  auth: AuthState
  paletteOpen: boolean
  filters: Record<RepoKind, BrowseFilters>
  /** Whether the browse filter sidebar overlays the list pane. */
  filterPanelOpen: boolean
  /** Whether the settings dialog is open. */
  settingsOpen: boolean
  /** Active section inside the settings dialog. */
  settingsSection: SettingsSection

  setSettings: (settings: AppSettings) => void
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  setAuth: (auth: AuthState) => void
  setPaletteOpen: (open: boolean) => void
  setFilters: (kind: RepoKind, patch: Partial<BrowseFilters>) => void
  resetFilters: (kind: RepoKind) => void
  setFilterPanelOpen: (open: boolean) => void
  openSettings: (section?: SettingsSection) => void
  closeSettings: () => void
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
  filterPanelOpen: false,
  settingsOpen: false,
  settingsSection: 'account',

  setSettings: (settings) => {
    setTheme(settings.theme)
    // CSS zoom scales the whole UI; 100 = default (settings:set clamps to 80–140).
    document.body.style.zoom = String(settings.uiScale / 100)
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
    set((state) => ({ filters: { ...state.filters, [kind]: defaultFilters(kind) } })),
  setFilterPanelOpen: (filterPanelOpen) => set({ filterPanelOpen }),
  openSettings: (section) =>
    set((state) => ({
      settingsOpen: true,
      settingsSection: section ?? state.settingsSection
    })),
  closeSettings: () => set({ settingsOpen: false })
}))

/** UI locale resolved from settings + system locale; used by i18n and formatters. */
export function resolveLocale(settings: AppSettings, appInfo: AppInfo | null): string {
  if (settings.locale !== 'system') return settings.locale
  const sys = appInfo?.systemLocale ?? navigator.language
  return sys.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}
