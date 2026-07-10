# Phase 3 Desktop Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Settings → System → Desktop with launch-at-login and close-to-tray behavior, including a system tray icon.

**Architecture:** Extend `AppSettings` with `launchAtLogin` and `closeToTray`. Sync login item via `app.setLoginItemSettings`. Create a `TrayManager` that owns the tray menu (Show / Quit). Intercept window `close` to hide when `closeToTray` is true unless quitting.

**Tech Stack:** Electron `Tray`, `Menu`, `app.setLoginItemSettings`, nativeImage, React settings section, i18next.

**Spec:** `docs/superpowers/specs/2026-07-11-settings-expansion-design.md` (Phase 3)

**Depends on:** Settings nav pattern from Phase 1.

---

## File map

| File | Role |
|------|------|
| `packages/shared/src/types.ts` | `launchAtLogin`, `closeToTray` booleans + defaults `false` |
| `packages/shared/src/schemas.ts` | boolean fields in `settingsPatch` |
| `apps/desktop/src/main/tray.ts` | `TrayManager` create/update/destroy |
| `apps/desktop/src/main/index.ts` | Wire tray; close-to-hide; apply login item on boot + settings change |
| `apps/desktop/src/main/ipc.ts` | On `settings:set`, call login-item + tray policy helpers |
| `apps/desktop/src/renderer/.../DesktopSection.tsx` | Switches + platform hint copy |
| `apps/desktop/src/renderer/.../SettingsDialog.tsx` | System nav group |
| `apps/desktop/src/renderer/src/stores/app.ts` | `'desktop'` section id |
| i18n en / zh-CN | Strings; macOS vs win/linux hint keys |
| Tray icon asset | Reuse existing app icon under `resources/` (locate current icon path used by BrowserWindow) |

---

### Task 1: Settings fields

- [ ] Add:

```ts
launchAtLogin: boolean  // default false
closeToTray: boolean    // default false
```

- [ ] Zod booleans in `settingsPatch`.

- [ ] Commit: `feat(settings): add launchAtLogin and closeToTray`

---

### Task 2: Tray + window close policy

- [ ] Implement `TrayManager`:

```ts
export class TrayManager {
  private tray: Tray | null = null
  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    private readonly i18n: MainI18n
  ) {}
  ensure(): void { /* create tray once with Show + Quit */ }
  destroy(): void { /* tray.destroy() */ }
}
```

- Show: restore + focus main window.  
- Quit: set `isQuitting = true` then `app.quit()`.

- [ ] In window `close` handler:

```ts
win.on('close', (e) => {
  if (!isQuitting && settings.get().closeToTray) {
    e.preventDefault()
    win.hide()
    tray.ensure()
  }
})
```

- [ ] When `closeToTray` becomes false and tray exists with no need to stay: destroy tray if window visible (keep tray while hidden only if closeToTray).

- [ ] `launchAtLogin`: on boot and on settings change:

```ts
app.setLoginItemSettings({ openAtLogin: settings.get().launchAtLogin })
```

- [ ] Unit-test pure helpers with mocked `app` / `Tray` if practical; otherwise smoke manually.

- [ ] Commit: `feat(desktop): tray and launch-at-login`

---

### Task 3: Desktop settings UI

- [ ] `DesktopSection` with two Switches bound to `updateSettings`.
- [ ] Platform hint: `settings:desktop.closeHintMac` vs `settings:desktop.closeHintOther` using `appInfo.platform`.
- [ ] Nav group `settings:groups.system` → `desktop`.
- [ ] i18n en + zh-CN.
- [ ] Typecheck + tests.
- [ ] Commit: `feat(settings): add Desktop section`

---

## Out of scope

Custom tray icon picker, global shortcut to show window, menu-bar-only macOS mode.
