# Local Personalization Settings Design

**Date:** 2026-07-11  
**Status:** Approved  
**Product:** Oh My HuggingFace (`ohmyhf`) desktop client

## Problem

Settings already cover theme, locale, UI scale, default home/sort, network, desktop, and privacy wipe. Users still lack finer local personalization: density, accent, independent font scale, persisted sidebar state, browse page size / open target / history limit, granular data clear, and settings import/export.

## Goals

1. Add local personalization under existing Appearance and Privacy sections (no new nav section).
2. Extend `AppSettings` → SQLite `kv` → IPC; do not invent a second preferences system.
3. Ship in three phases: Appearance → Browse → Privacy (import/export + granular clear).

## Non-goals

- Shortcut key editor
- Multi-window live settings sync
- Exporting auth/tokens or library data (favorites/history)
- Arbitrary custom CSS / accent hex picker
- Changing CTA or brand yellow tokens via accent
- Applying `browsePageSize` to home trending rails or global-search suggestion chips

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Information architecture | Appearance for look + browse prefs; Privacy for clear / import / export |
| Accent scope | Remap `--c-focus` and selection only; CTA and `--c-brand` unchanged |
| Font vs zoom | `fontScale` (90–120) independent of `uiScale` (document zoom) |
| Sidebar | Move from `localStorage` (`omh:sidebarCollapsed`) into `AppSettings` with one-time migrate |
| `repoOpenTarget: browser` | Favorites / history / global search only; browse split-pane stays in-app |
| Import | `AppSettings` JSON only; preserve local `hfCacheDir` on import |
| Clear | Category checkboxes; `settings` kv key never deleted |

## New `AppSettings` fields

```ts
uiDensity: 'comfortable' | 'compact'          // default 'comfortable'
accent: 'default' | 'blue' | 'green' | 'orange' | 'violet'  // default 'default'
fontScale: number                             // 90–120, step 5; default 100
sidebarCollapsed: boolean                     // default false
browsePageSize: 20 | 30 | 50                  // default 30
repoOpenTarget: 'app' | 'browser'             // default 'app'
historyLimit: 50 | 100 | 200 | 500            // default 200
```

## Architecture

```
UI (Appearance / Privacy)
  → useAppStore.updateSettings / invoke
  → IPC (settings:set | settings:export | settings:import | privacy:clearLocalData)
  → SettingsStore (SQLite kv) / LibraryStore / dialogs
  → setSettings applies theme, zoom, density, accent, fontScale
```

## Phase 1 — Appearance

### Behavior

- **Density:** `data-density` on `document.documentElement`; compact reduces list/row/sidebar spacing, not font size.
- **Accent:** Presets remap focus ring and `::selection` via CSS variables. `default` keeps current blue focus.
- **fontScale:** Root text size multiplier via `--font-scale`; separate control from `uiScale`.
- **sidebarCollapsed:** `toggleSidebar` persists via `settings:set`. On first load, if settings still default `false` but `localStorage omh:sidebarCollapsed === '1'`, migrate into settings and remove the localStorage key.

### UI

Appearance section gains density select, accent swatches, font scale stepper, and sidebar collapsed switch (below existing language / theme / uiScale).

## Phase 2 — Browse preferences

### Behavior

- **browsePageSize:** Used as `limit` in `RepoList` and `use-search-page` (main browse lists only).
- **repoOpenTarget:** When `browser`, primary open from favorites / history / global search uses `openExternal` Hub URL; Models/Datasets/Spaces browse pages keep in-app selection.
- **historyLimit:** Replaces hard-coded `HISTORY_LIMIT = 200` in `library.ts`; prune oldest by `viewed_at` after record / on list when over limit.

### UI

Appearance browse block: page size, open target, history limit (alongside default home / sort).

## Phase 3 — Privacy

### Granular clear

Extend `privacy:clearLocalData`:

```ts
{
  favorites?: boolean
  history?: boolean
  downloads?: boolean
  follows?: boolean
  inbox?: boolean
  otherKv?: boolean
  signOut?: boolean
}
```

Confirm dialog checkboxes default all selected (except sign-out). Stop download workers before clearing `downloads`. Never delete `kv` key `settings`.

### Import / export

```ts
'settings:export': { req: void; res: { canceled: true } | { canceled: false; path: string } }
'settings:import': { req: void; res: { canceled: true } | { canceled: false; settings: AppSettings } }
```

File shape:

```ts
{ version: 1, exportedAt: string, settings: AppSettings }
```

Main process save/open dialogs. Import: Zod validate → merge `DEFAULT_SETTINGS` → keep current `hfCacheDir` → write store → apply same side effects as `settings:set`. Invalid file: toast error, no change.

## Cross-cutting

1. New fields always have defaults; `SettingsStore` merges on load.
2. Every string in `en` and `zh-CN` settings i18n.
3. Schema unit tests for new fields and privacy/import validators.

## Success criteria

- Appearance controls change density, accent, font scale, and persist sidebar collapse via SQLite.
- Browse lists honor page size; history respects limit; open target works for favorites/history/search.
- Privacy can clear subsets of local data and round-trip settings JSON without touching auth or overwriting `hfCacheDir`.
