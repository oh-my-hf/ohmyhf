# Phase 1 Privacy Settings Implementation Plan

> **Status:** Implemented / Historical.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Settings → Data → Privacy section with HF cache summary + link to `/cache`, and a clear-local-app-data action (optional sign-out) that never deletes the HF cache directory.

**Architecture:** New `privacy:clearLocalData` IPC clears SQLite tables via a pure DB helper (unit-tested) after `DownloadManager.clearAll()` stops workers; UI is a new `PrivacySection` wired into the existing settings modal nav. Cache summary reuses `cache:scan`.

**Tech Stack:** Electron main + React renderer, Zod IPC schemas, better-sqlite3, Vitest, i18next (en / zh-CN), TanStack Query, Zustand.

**Spec:** `docs/superpowers/specs/2026-07-11-settings-expansion-design.md`

---

## File map

| File                                                                   | Role                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------- |
| `packages/shared/src/ipc.ts`                                           | Add `privacy:clearLocalData` to contract + channel list |
| `packages/shared/src/schemas.ts`                                       | Zod for `{ signOut?: boolean }`                         |
| `apps/desktop/src/main/privacy.ts`                                     | Pure SQL clear helper (testable)                        |
| `apps/desktop/src/main/privacy.test.ts`                                | Unit tests for clear semantics                          |
| `apps/desktop/src/main/downloads.ts`                                   | `clearAll()` — cancel workers, wipe tasks + DB rows     |
| `apps/desktop/src/main/ipc.ts`                                         | Register handler                                        |
| `apps/desktop/src/renderer/src/stores/app.ts`                          | Extend `SettingsSection` with `'privacy'`               |
| `apps/desktop/src/renderer/src/components/settings/PrivacySection.tsx` | New section UI                                          |
| `apps/desktop/src/renderer/src/components/settings/SettingsDialog.tsx` | Nav group + section map                                 |
| `apps/desktop/src/renderer/src/i18n/locales/en/settings.json`          | English strings                                         |
| `apps/desktop/src/renderer/src/i18n/locales/zh-CN/settings.json`       | Chinese strings                                         |
| `apps/desktop/src/main/schemas.test.ts`                                | Schema accept/reject for new channel                    |

---

### Task 1: Shared IPC contract + Zod schema

**Files:**

- Modify: `packages/shared/src/ipc.ts`
- Modify: `packages/shared/src/schemas.ts`
- Modify: `apps/desktop/src/main/schemas.test.ts`

- [ ] **Step 1: Add invoke contract**

In `IpcInvokeContract`, after `settings:set`:

```ts
'privacy:clearLocalData': {
  req: { signOut?: boolean }
  res: { cleared: true; signedOut: boolean }
}
```

Add `'privacy:clearLocalData'` to `IPC_INVOKE_CHANNELS` (near settings channels).

- [ ] **Step 2: Add Zod schema**

In `ipcRequestSchemas`:

```ts
'privacy:clearLocalData': z.object({ signOut: z.boolean().optional() }),
```

- [ ] **Step 3: Schema test**

```ts
it('accepts privacy:clearLocalData with optional signOut', () => {
  const schema = ipcRequestSchemas['privacy:clearLocalData']!
  expect(schema.safeParse({}).success).toBe(true)
  expect(schema.safeParse({ signOut: true }).success).toBe(true)
  expect(schema.safeParse({ signOut: 'yes' }).success).toBe(false)
})
```

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/ipc.ts packages/shared/src/schemas.ts apps/desktop/src/main/schemas.test.ts
git commit -m "feat(ipc): add privacy:clearLocalData contract"
```

---

### Task 2: DB clear helper + DownloadManager.clearAll + IPC handler

**Files:**

- Create: `apps/desktop/src/main/privacy.ts`
- Create: `apps/desktop/src/main/privacy.test.ts`
- Modify: `apps/desktop/src/main/downloads.ts`
- Modify: `apps/desktop/src/main/ipc.ts`
- Modify: `apps/desktop/src/main/db.ts` (only if test needs `openDatabase` with temp path — already supports `filePath`)

- [ ] **Step 1: Write failing tests for `clearLocalAppData`**

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type AppDatabase } from './db'
import { clearLocalAppData } from './privacy'

describe('clearLocalAppData', () => {
  let dir: string
  let db: AppDatabase

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'omh-privacy-'))
    db = openDatabase(join(dir, 'test.db'))
    db.prepare(
      `INSERT INTO favorites (repo_id, kind, added_at, summary_json) VALUES (?, ?, ?, ?)`
    ).run('a/b', 'model', new Date().toISOString(), '{}')
    db.prepare(
      `INSERT INTO history (repo_id, kind, viewed_at, summary_json) VALUES (?, ?, ?, ?)`
    ).run('a/b', 'model', new Date().toISOString(), '{}')
    db.prepare(
      `INSERT INTO downloads (id, repo_id, kind, revision, status, files_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('d1', 'a/b', 'model', 'main', 'completed', '[]', new Date().toISOString())
    db.prepare(`INSERT INTO follows (id, type, target, created_at) VALUES (?, ?, ?, ?)`).run(
      'f1',
      'user',
      'hf',
      new Date().toISOString()
    )
    db.prepare(
      `INSERT INTO inbox (id, kind, title, body, route, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run('i1', 'follow', 't', 'b', '/', new Date().toISOString())
    db.prepare(`INSERT INTO kv (key, value) VALUES (?, ?)`).run('settings', '{"theme":"dark"}')
    db.prepare(`INSERT INTO kv (key, value) VALUES (?, ?)`).run('other', 'x')
    db.prepare(`INSERT INTO auth (id, token_cipher, updated_at) VALUES (1, ?, ?)`).run(
      Buffer.from('cipher'),
      new Date().toISOString()
    )
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('clears library tables and non-settings kv but keeps settings and auth', () => {
    const result = clearLocalAppData(db, { signOut: false })
    expect(result).toEqual({ signedOut: false })
    expect(db.prepare('SELECT COUNT(*) AS n FROM favorites').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM history').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM downloads').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM follows').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM inbox').get()).toEqual({ n: 0 })
    expect(db.prepare(`SELECT value FROM kv WHERE key = 'settings'`).get()).toEqual({
      value: '{"theme":"dark"}'
    })
    expect(db.prepare(`SELECT COUNT(*) AS n FROM kv WHERE key = 'other'`).get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM auth').get()).toEqual({ n: 1 })
  })

  it('clears auth when signOut is true', () => {
    const result = clearLocalAppData(db, { signOut: true })
    expect(result).toEqual({ signedOut: true })
    expect(db.prepare('SELECT COUNT(*) AS n FROM auth').get()).toEqual({ n: 0 })
    expect(db.prepare(`SELECT value FROM kv WHERE key = 'settings'`).get()).toEqual({
      value: '{"theme":"dark"}'
    })
  })
})
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

Run: `pnpm --filter oh-my-huggingface-desktop test src/main/privacy.test.ts`

- [ ] **Step 3: Implement `privacy.ts`**

```ts
import type { AppDatabase } from './db'

export function clearLocalAppData(
  db: AppDatabase,
  options: { signOut: boolean }
): { signedOut: boolean } {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM favorites').run()
    db.prepare('DELETE FROM history').run()
    db.prepare('DELETE FROM downloads').run()
    db.prepare('DELETE FROM follows').run()
    db.prepare('DELETE FROM inbox').run()
    db.prepare(`DELETE FROM kv WHERE key != 'settings'`).run()
    if (options.signOut) {
      db.prepare('DELETE FROM auth WHERE id = 1').run()
    }
  })
  tx()
  return { signedOut: options.signOut }
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Add `DownloadManager.clearAll()`**

After `remove`:

```ts
clearAll(): DownloadTask[] {
  for (const id of [...this.tasks.keys()]) {
    this.remove(id)
  }
  return this.list()
}
```

- [ ] **Step 6: Register IPC handler**

```ts
handle('privacy:clearLocalData', async ({ signOut }) => {
  ctx.downloads.clearAll()
  const result = clearLocalAppData(ctx.library /* need db */)
})
```

`Library` does not expose `db`. Prefer passing `db` into IPC context **or** call `clearLocalAppData` with a db reference from a new method. Cleanest: add `clearLocalData(signOut: boolean)` on a thin wrapper that IPC calls:

Option chosen: give `registerIpcHandlers` access via extending context with `db: AppDatabase`, OR add `Library.clearLocalData` that runs the SQL (move helper to be used by Library).

**Chosen:** keep `clearLocalAppData(db)` pure; add `db` to IPC context from `index.ts` (`registerIpcHandlers({ ..., db })`).

Handler:

```ts
handle('privacy:clearLocalData', async (req) => {
  const signOut = req?.signOut === true
  ctx.downloads.clearAll()
  clearLocalAppData(ctx.db, { signOut })
  if (signOut) {
    await ctx.auth.signOut()
  }
  return { cleared: true as const, signedOut: signOut }
})
```

Note: when `signOut` is true, `clearLocalAppData` already deletes the auth row; `auth.signOut()` still updates in-memory state and broadcasts `evt:auth`. Call `auth.signOut()` after DB clear so memory matches.

When `signOut` is false, do not call `auth.signOut()`.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(privacy): clear local app data in main process"
```

---

### Task 3: SettingsSection type + i18n + PrivacySection UI

**Files:**

- Modify: `apps/desktop/src/renderer/src/stores/app.ts`
- Modify: `apps/desktop/src/renderer/src/i18n/locales/en/settings.json`
- Modify: `apps/desktop/src/renderer/src/i18n/locales/zh-CN/settings.json`
- Create: `apps/desktop/src/renderer/src/components/settings/PrivacySection.tsx`
- Modify: `apps/desktop/src/renderer/src/components/settings/SettingsDialog.tsx`

- [ ] **Step 1: Extend `SettingsSection`**

```ts
export type SettingsSection =
  'account' | 'appearance' | 'downloads' | 'notifications' | 'privacy' | 'about'
```

- [ ] **Step 2: i18n keys (en)**

```json
"groups": {
  "about": "About",
  "account": "Account",
  "data": "Data",
  "interface": "Interface"
},
"privacy": {
  "title": "Privacy & data",
  "cache": {
    "title": "HF cache",
    "path": "Location",
    "size": "Total size",
    "open": "Open cache manager",
    "scanFailed": "Couldn't scan the cache.",
    "retry": "Retry"
  },
  "local": {
    "title": "App local data",
    "description": "Clears favorites, history, download records, follows, and inbox on this device. Does not delete model or dataset files in the HF cache.",
    "clear": "Clear local data…",
    "confirmTitle": "Clear local data?",
    "confirmBody": "This removes:",
    "items": {
      "favorites": "Favorites",
      "history": "Browse history",
      "downloads": "Download task records",
      "follows": "Followed accounts",
      "inbox": "Local inbox"
    },
    "signOutAlso": "Also sign out of Hub",
    "confirm": "Clear data",
    "success": "Local data cleared.",
    "successSignedOut": "Local data cleared. You have been signed out."
  }
}
```

Mirror in zh-CN.

- [ ] **Step 3: Implement `PrivacySection.tsx`**

- Cache block: `useQuery(['cache'], () => invoke('cache:scan'))`; show path from `appInfo.hfCacheDir` / settings; `formatBytes(totalSize)`; button closes settings + `navigate('/cache')`.
- Local data: button opens nested confirm `Dialog`; Switch for sign-out; mutate `privacy:clearLocalData`; on success toast, invalidate `['cache']` not required, invalidate favorites/history/follows/inbox/downloads query keys used in app; if `signedOut`, `setAuth({ status: 'signedOut' })` (also listen to `evt:auth` if already wired).

Query keys to invalidate (grep existing): `['favorites']`, `['history']`, `['follows']`, `['inbox']`, `['downloads']` as used in pages.

- [ ] **Step 4: Wire nav in `SettingsDialog.tsx`**

Add group between interface and about:

```ts
{
  labelKey: 'settings:groups.data',
  items: [{ id: 'privacy', labelKey: 'settings:privacy.title', icon: Shield }]
}
```

Import `Shield` from lucide-react. Add `privacy: PrivacySection` to `SECTION_CONTENT`.

Extract shared `SectionShell` / `Row` only if needed for PrivacySection — PrivacySection can use a local shell matching existing pattern, or import duplicated markup. Prefer copying the small `SectionShell` pattern into PrivacySection or exporting it from SettingsDialog. **Chosen:** keep `SectionShell` in SettingsDialog and pass children via importing PrivacySection that defines its own `<section>` matching the same classes (avoid circular exports). Duplicate the 5-line shell in PrivacySection.

- [ ] **Step 5: Run typecheck + unit tests**

```bash
pnpm --filter oh-my-huggingface-desktop typecheck
pnpm --filter oh-my-huggingface-desktop test
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(settings): add Privacy & data section"
```

---

### Task 4: Spec fix commit + verify

- [ ] Commit the Zod wording fix in the design spec if still unstaged.
- [ ] Manual smoke: open Settings → Privacy → see cache size → Open cache manager → clear local data with/without sign-out.

---

## Self-review (plan vs spec)

| Spec requirement                                                | Task                                 |
| --------------------------------------------------------------- | ------------------------------------ |
| Data / privacy nav                                              | Task 3                               |
| Cache summary + open `/cache`                                   | Task 3                               |
| Clear favorites/history/downloads/follows/inbox/non-settings kv | Task 2                               |
| Keep settings; keep auth unless checkbox                        | Task 2                               |
| Optional sign-out                                               | Task 2–3                             |
| `privacy:clearLocalData` IPC                                    | Task 1–2                             |
| i18n en + zh-CN                                                 | Task 3                               |
| Unit test clear semantics                                       | Task 2                               |
| Do not delete HF cache dir                                      | Task 2 (SQL only; no cache FS calls) |
