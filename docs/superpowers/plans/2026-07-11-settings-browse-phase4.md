# Phase 4 Browse Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist default home route and default repo sort in `AppSettings`, exposed under Settings → Appearance (no new nav item).

**Architecture:** Add `defaultHome` and `defaultRepoSort` to `AppSettings`. Initialize Zustand browse filters from settings on bootstrap. When the user changes sort in the browse UI, also `updateSettings({ defaultRepoSort })`. Honor `defaultHome` for the index redirect / first-load route.

**Tech Stack:** Existing `AppSettings` IPC, Zustand `useAppStore`, React Router `HashRouter`, Appearance section controls.

**Spec:** `docs/superpowers/specs/2026-07-11-settings-expansion-design.md` (Phase 4)

**Depends on:** None beyond current settings pipeline.

---

## File map

| File | Role |
|------|------|
| `packages/shared/src/types.ts` | `defaultHome`, `defaultRepoSort` + defaults |
| `packages/shared/src/schemas.ts` | enums in `settingsPatch` |
| `apps/desktop/src/renderer/src/stores/app.ts` | Init filters from settings; persist sort on `setFilters` when `sort` changes |
| `apps/desktop/src/renderer/src/main.tsx` | After `settings:get`, seed filters / home |
| `apps/desktop/src/renderer/src/App.tsx` or `AppShell` | Index route uses `defaultHome` |
| `apps/desktop/src/renderer/.../SettingsDialog.tsx` (`AppearanceSection`) | Two Selects |
| i18n en / zh-CN | Labels for home options + sort |

---

### Task 1: Schema

- [ ] Types:

```ts
export type DefaultHome = 'home' | 'models' | 'datasets' | 'spaces' | 'papers'

// on AppSettings:
defaultHome: DefaultHome        // default 'home'
defaultRepoSort: RepoSort       // default 'trending'
```

- [ ] Zod:

```ts
defaultHome: z.enum(['home', 'models', 'datasets', 'spaces', 'papers']),
defaultRepoSort: z.enum(['trending', 'downloads', 'likes', 'updated', 'created']),
```

- [ ] Commit: `feat(settings): add defaultHome and defaultRepoSort`

---

### Task 2: Wire store + routing

- [ ] Change `defaultFilters(kind, sort?: RepoSort)` to use `settings.defaultRepoSort`, with spaces fallback: if settings still at factory default and kind is `space`, use `'likes'` only when `defaultRepoSort === 'trending'` **and** user never changed it — **simpler rule from spec:** once settings load, use `defaultRepoSort` for all kinds. Spaces initial default in `DEFAULT_SETTINGS` stays `trending`; document that users who want likes set it once. (Avoid per-kind complexity.)

- [ ] In `setFilters`, if `patch.sort` is defined:

```ts
void get().updateSettings({ defaultRepoSort: patch.sort })
```

- [ ] Map `defaultHome` → path:

```ts
const HOME_PATH: Record<DefaultHome, string> = {
  home: '/',
  models: '/models',
  datasets: '/datasets',
  spaces: '/spaces',
  papers: '/papers'
}
```

- [ ] Replace `<Route index element={<HomePage />} />` behavior: either keep HomePage at `/` and redirect on first launch only, or change index to a small `DefaultHomeRedirect` component:

```tsx
function DefaultHomeRedirect() {
  const home = useAppStore(s => s.settings.defaultHome)
  if (home === 'home') return <HomePage />
  return <Navigate to={HOME_PATH[home]} replace />
}
```

Use this only for the index route so deep links stay intact.

- [ ] Commit: `feat(browse): persist default home and sort`

---

### Task 3: Appearance UI

- [ ] In `AppearanceSection`, after UI scale, add:

- Default home: Select of five options  
- Default sort: Select of `RepoSort` values  

- [ ] i18n keys under `settings:appearance.defaultHome` / `defaultSort` and option labels (reuse browse sort labels from existing namespaces if present).

- [ ] Typecheck + locale completeness test.

- [ ] Commit: `feat(settings): browse defaults in Appearance`

---

## Out of scope

Per-kind default sorts, persisting full filter panel state (tags, libraries, etc.).
