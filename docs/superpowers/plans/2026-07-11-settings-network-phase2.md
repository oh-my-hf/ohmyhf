# Phase 2 Network Settings Implementation Plan

> **Status:** Implemented / Historical.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Settings → Connection → Network with custom Hub endpoint and HTTP(S) proxy URL, applied to HubClient and downloads.

**Architecture:** Extend `AppSettings` with `hubEndpoint` / `proxyUrl` (null = defaults). On change, rebuild main `HubClient`, call `session.defaultSession.setProxy`, and pass proxy env into download workers. UI validates URLs and offers a lightweight connectivity test.

**Tech Stack:** Electron `session.setProxy`, existing `HubClient({ endpoint })`, Zod, React settings section, i18next.

**Spec:** `docs/superpowers/specs/2026-07-11-settings-expansion-design.md` (Phase 2)

**Depends on:** Phase 1 Privacy nav pattern (Data group already exists; add Connection group similarly).

---

## File map

| File                                               | Role                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| `packages/shared/src/types.ts`                     | `hubEndpoint`, `proxyUrl` on `AppSettings` + defaults                 |
| `packages/shared/src/schemas.ts`                   | URL-or-null refinements in `settingsPatch`                            |
| `apps/desktop/src/main/hub.ts`                     | Accept endpoint; export rebuild helper                                |
| `apps/desktop/src/main/index.ts`                   | Hold mutable hub ref; apply proxy on boot + settings change           |
| `apps/desktop/src/main/proxy.ts`                   | `applyProxy(proxyUrl: string \| null)` via `session.setProxy`         |
| `apps/desktop/src/main/workers/download-worker.ts` | Honor `HTTPS_PROXY` / `HTTP_PROXY` from workerData                    |
| `apps/desktop/src/main/downloads.ts`               | Pass proxy into workerData from settings                              |
| `packages/shared/src/ipc.ts`                       | Optional `network:testConnection` → `{ ok: boolean; error?: string }` |
| `apps/desktop/src/renderer/.../NetworkSection.tsx` | New section UI                                                        |
| `apps/desktop/src/renderer/.../SettingsDialog.tsx` | Connection nav group                                                  |
| `apps/desktop/src/renderer/src/stores/app.ts`      | `'network'` in `SettingsSection`                                      |
| i18n `en` / `zh-CN` `settings.json`                | Strings                                                               |

---

### Task 1: Schema + defaults

- [ ] Add to `AppSettings`:

```ts
/** null = https://huggingface.co */
hubEndpoint: string | null
/** null = no app-level proxy override */
proxyUrl: string | null
```

Defaults both `null`.

- [ ] In `settingsPatch`, validate:

```ts
hubEndpoint: z.union([z.url({ protocol: /^https?$/ }), z.null()]),
proxyUrl: z.union([z.url({ protocol: /^https?$/ }), z.null()]),
```

- [ ] Unit test: reject `ftp://`, accept `https://hf-mirror.com`, accept null.

- [ ] Commit: `feat(settings): add hubEndpoint and proxyUrl fields`

---

### Task 2: Apply endpoint + proxy in main

- [ ] Create `apps/desktop/src/main/proxy.ts`:

```ts
import { session } from 'electron'

export async function applyAppProxy(proxyUrl: string | null): Promise<void> {
  const ses = session.defaultSession
  if (!proxyUrl) {
    await ses.setProxy({ mode: 'system' })
    return
  }
  await ses.setProxy({ proxyRules: proxyUrl })
}
```

- [ ] Change hub ownership so settings can rebuild client: store `{ hub: HubClient }` box or recreate and re-`auth.attachClient(hub)` + update IPC context reference. Prefer a `HubRuntime` object with `getClient()` / `rebuild(endpoint)`.

- [ ] On `settings:set`, if `hubEndpoint` or `proxyUrl` changed: rebuild hub, `invalidateCache()`, `applyAppProxy`, warn via no toast from main (renderer shows static warning copy).

- [ ] Download worker: read `proxyUrl` from `workerData`; if set, set `process.env.HTTPS_PROXY` / `HTTP_PROXY` before `fetch` (Node undici respects these in Electron's Node).

- [ ] Commit: `feat(network): apply Hub endpoint and proxy in main`

---

### Task 3: Test connection IPC + UI

- [ ] Add `'network:testConnection': { req: void; res: { ok: true } | { ok: false; error: string } }` — GET `{endpoint}/api/models?limit=1` via current HubClient or raw fetch with proxy already applied.

- [ ] `NetworkSection`: inputs for endpoint + proxy, Reset buttons (set null), Test connection button, warning about in-flight downloads.

- [ ] Nav: group `settings:groups.connection` → `network`.

- [ ] i18n en + zh-CN.

- [ ] Typecheck + tests.

- [ ] Commit: `feat(settings): add Network section`

---

## Out of scope

SOCKS auth UI, per-request proxy bypass list, importing system PAC files beyond `mode: 'system'`.
