# Settings Expansion Design

**Date:** 2026-07-11  
**Status:** Approved  
**Product:** Oh My HuggingFace (`ohmyhf`) desktop client

## Problem

The Settings modal today covers Account, Appearance, Downloads, Notifications, and About. Users still lack in-settings access to privacy/data controls, network/Hub connectivity, desktop lifecycle behavior, and persisted browse preferences. Related capabilities (e.g. cache management at `/cache`) exist elsewhere but are not discoverable from Settings.

## Goals

1. Expand Settings across four capability areas without bloating existing sections.
2. Ship incrementally: each phase is independently mergeable and testable.
3. Keep HF model/dataset cache separate from app-local SQLite data.
4. Extend the existing `AppSettings` → SQLite `kv` → IPC pattern; do not invent a second preferences system.

## Non-goals

- Shortcut key editor
- Settings import/export
- Fine-grained SOCKS auth UI
- Multi-window live settings sync (`evt:settings` broadcast)
- Re-implementing the full Cache page inside Settings
- Changing OAuth scope set or Hub API surface beyond endpoint/proxy wiring

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Scope | All four areas, phased **Privacy → Network → Desktop → Browse prefs** |
| Phase 1 depth | Lightweight: cache summary + link to `/cache`; clear app local data; optional sign-out |
| Information architecture | New sidebar sections per phase; browse prefs fold into Appearance |
| Settings file structure | Split `SettingsDialog.tsx` into per-section components under `settings/` as sections grow |

## Final settings information architecture

| Group (i18n) | Section id | Phase |
|--------------|------------|-------|
| Account | `account` | existing |
| Interface | `appearance` (+ browse prefs), `downloads`, `notifications` | existing + Phase 4 |
| Data | `privacy` | **Phase 1** |
| Connection | `network` | Phase 2 |
| System | `desktop` | Phase 3 |
| About | `about` | existing |

Phase 1 only adds the Data / `privacy` nav entry. Connection and System groups appear when those phases ship.

## Architecture

```
UI (Settings section)
  → useAppStore / invoke
  → IPC (settings:set | privacy:* | …)
  → SettingsStore (SQLite kv) / DB tables / HubClient / session proxy / Tray
```

Key existing pieces:

- UI shell: `apps/desktop/src/renderer/src/components/settings/SettingsDialog.tsx`
- Section type: `SettingsSection` in `apps/desktop/src/renderer/src/stores/app.ts`
- Schema: `AppSettings` + `DEFAULT_SETTINGS` in `packages/shared/src/types.ts`
- Validation: `settingsPatch` in `packages/shared/src/schemas.ts`
- Persistence: `apps/desktop/src/main/settings.ts` (`SettingsStore`)
- Local DB: `apps/desktop/src/main/db.ts` (favorites, history, downloads, follows, inbox, auth, kv)
- Hub client: `apps/desktop/src/main/hub.ts` / `HubClient` already accepts `endpoint`
- Cache: `cache:scan` → `CacheReport` (`root`, `totalSize`, `repos`, `scannedAt`)

## Phase 1 — Privacy / Data

### UI

New nav group **Data** with one item `privacy` (Privacy & data).

**Block 1 — HF cache**

- Show cache path (`appInfo.hfCacheDir` / settings override) and total size from `cache:scan`.
- Loading skeleton and retry on scan failure.
- Primary action: “Open cache manager” → `closeSettings()` + navigate to `/cache`.
- Do not delete revisions from Settings.

**Block 2 — App local data**

- Copy clarifies: clears app SQLite data only; does **not** delete the HF cache directory.
- Button “Clear local data…” opens a confirm dialog listing what will be removed.
- Optional checkbox: “Also sign out” (clears `auth`). Default unchecked.
- On success: toast; invalidate related React Query keys; if signed out, refresh auth store.

### Clear semantics

| Target | Default clear | With “Also sign out” |
|--------|---------------|----------------------|
| `favorites` | yes | yes |
| `history` | yes | yes |
| `downloads` | yes | yes |
| `follows` | yes | yes |
| `inbox` | yes | yes |
| `kv` keys other than `settings` | yes | yes |
| `kv` key `settings` | **keep** | **keep** |
| `auth` | **keep** | clear |

Active download workers should be cancelled/stopped before wiping the `downloads` table so the UI and main process do not diverge.

### IPC

```ts
'privacy:clearLocalData': {
  req: { signOut?: boolean }
  res: { cleared: true; signedOut: boolean }
}
```

Zod: `{ signOut: z.boolean().optional() }` (or empty object / undefined payload with optional field).

Implementation lives in main (dedicated helper or library method), registered in `apps/desktop/src/main/ipc.ts`.

### Errors

- Cache scan failure: show error + retry; do not block the clear-data action.
- Clear failure: toast error; leave confirm dialog open; keep button disabled only while in flight.

### Tests

- Unit/integration: clear tables while preserving `settings` and (by default) `auth`; with `signOut: true`, `auth` is empty and auth state is signed out.
- Smoke: Privacy CTA navigates to `/cache` (e2e or component-level as practical).

### i18n

Add keys under `settings` namespace in `en/settings.json` and `zh-CN/settings.json` for group label, section title, cache block, clear block, confirm dialog, checkbox, toasts.

## Phase 2 — Network

### Settings fields

```ts
hubEndpoint: string | null  // null → https://huggingface.co
proxyUrl: string | null     // null → system / no app override
```

### Behavior

- Rebuild main-process `HubClient` with `endpoint` when `hubEndpoint` changes; clear in-memory Hub response cache.
- Apply `proxyUrl` via Electron `session.defaultSession.setProxy` and ensure download workers honor the same proxy.
- UI: URL inputs, reset-to-default, “Test connection” (lightweight Hub ping).
- Inline validation for illegal URLs.
- Warn that in-flight downloads may keep the previous proxy/endpoint until restarted.

### Tests

- Schema rejects invalid URLs; accepts null.
- Client constructed with custom endpoint hits that base URL (hub-api or main wiring test).

## Phase 3 — Desktop

### Settings fields

```ts
launchAtLogin: boolean  // default false
closeToTray: boolean    // default false
```

### Behavior

- `launchAtLogin` → `app.setLoginItemSettings({ openAtLogin })`.
- Introduce a system Tray with Show and Quit.
- When `closeToTray` is true, window close hides instead of quitting; Quit from tray (or explicit quit) exits.
- Platform-specific copy for macOS vs Windows/Linux (Dock vs tray expectations).

### Tests

- Settings patch round-trip; login-item and close-to-tray handlers invoked with expected flags (mocked Electron APIs where needed).

## Phase 4 — Browse preferences (Appearance)

### Settings fields

```ts
defaultHome: 'home' | 'models' | 'datasets' | 'spaces' | 'papers'  // default 'home'
defaultRepoSort: RepoSort  // default 'trending'
```

### Behavior

- Appearance section gains “Default home” and “Default sort” controls.
- Changing browse sort persists as `defaultRepoSort` (simple mental model).
- Spaces may still initialize to `likes` when no user override exists; once the user sets a default sort, that value wins for all kinds unless a later phase adds per-kind sorts (out of scope).
- App startup / browse entry reads defaults from `AppSettings`.

### Tests

- Defaults applied when filters initialize; updating sort writes settings.

## Cross-cutting principles

1. **Backward compatible schema:** new `AppSettings` fields always have defaults in `DEFAULT_SETTINGS`; `SettingsStore` merges with defaults on load.
2. **Dangerous actions** (clear data, change endpoint) use confirmation or clear warning copy.
3. **i18n:** every new string in both `en` and `zh-CN`.
4. **YAGNI:** no features listed under Non-goals.
5. **Phased delivery:** Phase 1 is the first shippable slice; Phases 2–4 each get their own implementation plan.

## Implementation order

1. Write this design doc (done when committed).
2. Implementation plan for **Phase 1 only** → implement Phase 1.
3. Separate implementation plans for Phase 2, 3, and 4 as follow-ups.

## Success criteria

- Settings nav includes Privacy under Data; cache summary and clear-local-data work as specified.
- HF cache directory contents are untouched by clear-local-data.
- Later phases can add Network / Desktop / browse fields without redesigning the modal shell.
