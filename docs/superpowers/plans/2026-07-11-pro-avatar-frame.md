# Pro Avatar Frame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Hub-faithful Pro avatar frames (gradient ring + rainbow sparkle) to `ProfileAvatar`, with profile/compact recipes and `isPro` plumbed through posts + activity feed.

**Architecture:** Extend `ProfileAvatar` with `isPro` + `frame`. Map Hub `author.isPro` / activity `isPro` into shared types. Wire call sites. No TFLOPS/Sync.

**Tech Stack:** React + Tailwind, Vitest, `@oh-my-huggingface/shared` + `hub-api`

**Spec:** `docs/superpowers/specs/2026-07-11-pro-avatar-frame-design.md`

---

## File map

| File | Role |
|------|------|
| `packages/shared/src/types.ts` | `authorIsPro` on `PostSummary`; `actorIsPro` on `ActivityItem` |
| `packages/hub-api/src/mappers.ts` | Map `isPro` in `mapPost` / `mapActivityFeed` |
| `packages/hub-api/src/index.ts` | Export `mapActivityFeed` for unit tests |
| `packages/hub-api/test/pro-avatar-mappers.test.ts` | Mapper unit tests |
| `apps/desktop/.../profile/ProSparkleIcon.tsx` | Official sparkle SVG |
| `apps/desktop/.../profile/ProfileAvatar.tsx` | Ring + sparkle chrome |
| `UserPage.tsx`, `FeedItems.tsx`, `ActivityFeedItems.tsx`, `PostPage.tsx`, `SettingsDialog.tsx` | Pass `isPro` / `frame` |

---

### Task 1: Types + mapper tests (TDD) + mapper impl

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/hub-api/src/mappers.ts`
- Modify: `packages/hub-api/src/index.ts`
- Create: `packages/hub-api/test/pro-avatar-mappers.test.ts`
- Update: `packages/hub-api/test/profile.test.ts` (post equality may need `authorIsPro`)

- [ ] **Step 1: Add shared fields**

`PostSummary`:
```ts
authorIsPro?: boolean
```

Every `ActivityItem` variant:
```ts
actorIsPro?: boolean
```

- [ ] **Step 2: Write failing mapper tests**

```ts
import { describe, expect, it } from 'vitest'
import { mapActivityFeed, mapPost } from '../src'

describe('mapPost authorIsPro', () => {
  it('maps author.isPro true', () => {
    const post = mapPost(
      { slug: '1', author: { name: 'a', isPro: true }, rawContent: '', url: '/posts/a/1' },
      'https://huggingface.co'
    )
    expect(post.authorIsPro).toBe(true)
  })
  it('maps author.isPro false', () => {
    const post = mapPost(
      { slug: '1', author: { name: 'a', isPro: false }, rawContent: '', url: '/posts/a/1' },
      'https://huggingface.co'
    )
    expect(post.authorIsPro).toBe(false)
  })
  it('omits authorIsPro when missing', () => {
    const post = mapPost(
      { slug: '1', author: { name: 'a' }, rawContent: '', url: '/posts/a/1' },
      'https://huggingface.co'
    )
    expect(post.authorIsPro).toBeUndefined()
  })
})

describe('mapActivityFeed actorIsPro', () => {
  it('maps top-level isPro on like items', () => {
    const feed = mapActivityFeed(
      {
        recentActivity: [
          {
            type: 'like',
            user: 'prouser',
            userAvatarUrl: '/avatar.png',
            isPro: true,
            repoType: 'model',
            repoData: { id: 'prouser/m', author: 'prouser' }
          }
        ]
      },
      'https://huggingface.co'
    )
    expect(feed.items[0]).toMatchObject({ kind: 'like', actor: 'prouser', actorIsPro: true })
  })
  it('leaves actorIsPro undefined when omitted', () => {
    const feed = mapActivityFeed(
      {
        recentActivity: [
          {
            type: 'like',
            user: 'u',
            repoType: 'model',
            repoData: { id: 'u/m', author: 'u' }
          }
        ]
      },
      'https://huggingface.co'
    )
    expect(feed.items[0]).toMatchObject({ kind: 'like', actor: 'u' })
    expect('actorIsPro' in (feed.items[0] ?? {}) ? (feed.items[0] as { actorIsPro?: boolean }).actorIsPro : undefined).toBeUndefined()
  })
})
```

- [ ] **Step 3: Export `mapActivityFeed` from `packages/hub-api/src/index.ts`**

- [ ] **Step 4: Implement mapper changes**

`RawPost.author`:
```ts
author?: { name?: string; fullname?: string; avatarUrl?: string; isPro?: boolean }
```

In `mapPost` return:
```ts
authorIsPro: raw.author?.isPro,
```

`RawActivityItem`:
```ts
isPro?: boolean
```

When pushing activity items, include:
```ts
actorIsPro: a.isPro,
```

- [ ] **Step 5: Run tests**

```bash
cd packages/hub-api && pnpm test
```

Expected: PASS (fix `profile.test.ts` post equality if it asserts full object — add `authorIsPro: undefined` or stop using full equality)

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types.ts packages/hub-api/src/mappers.ts packages/hub-api/src/index.ts packages/hub-api/test/pro-avatar-mappers.test.ts packages/hub-api/test/profile.test.ts
git commit -m "feat(hub): plumb isPro into post and activity mappers"
```

---

### Task 2: `ProSparkleIcon` + `ProfileAvatar` frame

**Files:**
- Create: `apps/desktop/src/renderer/src/components/profile/ProSparkleIcon.tsx`
- Modify: `apps/desktop/src/renderer/src/components/profile/ProfileAvatar.tsx`

- [ ] **Step 1: Add `ProSparkleIcon`**

Official path + gradient stops `#FF0789` / `#21DE75@0.63` / `#FF8D00`. Use `useId()` for gradient id. `className` sets size + stroke via `currentColor` (`text-white dark:text-gray-950`).

- [ ] **Step 2: Extend `ProfileAvatar`**

Props: `isPro?: boolean`, `frame?: 'profile' | 'compact'` (default `'compact'` when Pro).

When `isPro !== true`: keep current markup.

When Pro + `profile`:
- Outer `relative inline-flex shrink-0`
- Ring: `bg-linear-to-br from-pink-300 via-green-400 to-yellow-300 p-[3px] dark:from-pink-500/70 dark:via-green-500/70 dark:to-yellow-500/70 relative rounded-full`
- Inner img/fallback: apply caller `className` for size; add `rounded-full border-[3px] border-white object-cover dark:border-gray-950` (drop plain `border`)
- Sparkle: `absolute left-0 top-[10%] text-[1.15em] text-white dark:text-gray-950` (scale with avatar via em)

When Pro + `compact`:
- Ring: `from-pink-500 via-green-500 to-yellow-500 p-px relative rounded-full bg-linear-to-br`
- Inner: `rounded-full bg-white object-cover dark:bg-gray-950` + size `className`; thin inset ok via ring padding
- Sparkle: `absolute -bottom-0.5 -right-0.5 text-[0.65em] text-white dark:text-gray-950`

Letter fallback wrapped the same way.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(ui): add Hub-style Pro avatar frame to ProfileAvatar"
```

---

### Task 3: Wire call sites

**Files:**
- `UserPage.tsx` — header `frame="profile" isPro={data.isPro === true}`; compact where available
- `FeedItems.tsx` — `isPro={post.authorIsPro === true} frame="compact"`
- `ActivityFeedItems.tsx` — pass `actorIsPro`; for social-post prefer `item.actorIsPro ?? item.post.authorIsPro`
- `PostPage.tsx` — `authorIsPro`
- `SettingsDialog.tsx` — replace raw `<img>` with `ProfileAvatar` + `isPro={auth.user.isPro === true}`

- [ ] **Step 1: Wire all call sites**
- [ ] **Step 2: Typecheck desktop / shared as needed**
- [ ] **Step 3: Commit**

```bash
git commit -m "feat(ui): show Pro avatar frame on profile, feed, and settings"
```

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Ring + sparkle only | 2 |
| Profile + compact recipes / light-dark | 2 |
| Plumb feed/post isPro | 1, 3 |
| Extend ProfileAvatar | 2 |
| No TFLOPS/Sync/org frames | — |
| Mapper tests | 1 |
