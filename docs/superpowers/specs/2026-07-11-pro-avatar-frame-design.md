# Pro Avatar Frame Design

**Date:** 2026-07-11  
**Status:** Approved  
**Product:** Oh My HuggingFace (`ohmyhf`) desktop client

## Problem

Hugging Face Pro users are identified on the Hub by a distinctive avatar frame (gradient ring + rainbow sparkle). Oh My HuggingFace already surfaces `isPro` via `PlanBadge` text, but avatars remain plain circles, so Pro identity is weaker than on the Hub—especially on the profile header and in feed/list compact avatars.

## Goals

1. Match the Hub’s Pro avatar frame visually (light/dark, profile vs compact recipes).
2. Show the frame wherever we render a user avatar and know `isPro === true`.
3. Plumb `isPro` through activity feed and post mappers so compact avatars can opt in without extra round-trips.
4. Keep non-Pro and missing-`isPro` behavior identical to today.

## Non-goals

- TFLOPS / hardware pill on the avatar
- Sync / refresh control on the avatar
- Status emoji / “Hiring” style overlays
- Org plan frames (Enterprise/Team/etc. stay on `PlanBadge` only)
- Screenshot / visual regression suite for the frame
- Fetching `isPro` via separate user lookups when the Hub payload omits it

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Scope ornaments | Gradient ring + `IconProSparkle` only (A); no TFLOPS/Sync |
| Surfaces | Profile large avatar **and** compact list/feed avatars (C) |
| Size recipes | Fully follow Hub’s **two** recipes (not one scaled recipe) |
| Light/dark | Match Hub token differences (not a single gradient for both themes) |
| Missing feed `isPro` | Plumb from Hub payloads in this work (B) |
| Component shape | Extend existing `ProfileAvatar` with `isPro` + `frame` (approach A) |
| Org accounts | No Pro frame; existing plan badges unchanged |

## Hub reference (source of truth)

Observed from live `huggingface.co` DOM and public bundles (`IconProSparkle`, `AuthorAvatar`, `UserProfile`), build `kube-efc94c6` (2026-07-11):

### Sparkle (`IconProSparkle`)

- SVG viewBox `0 0 12 12`, official path (same as Hub).
- Fill linear gradient: `#FF0789` → `#21DE75` at offset `0.63` → `#FF8D00`.
- Stroke: `currentColor` with `stroke-linejoin="round"`.
  - Light: white (`text-white`)
  - Dark: `gray-950` / Hub page bg `#0b0f19`

### Profile (large) frame

- Ring wrapper: `bg-linear-to-br` / `linear-gradient(to bottom right, …)` with `p-[3px]` `rounded-full`.
- Light: `from-pink-300 via-green-400 to-yellow-300`
- Dark: `from-pink-500/70 via-green-500/70 to-yellow-500/70`
- Image: `rounded-full` + `border-[3px] border-white` / `dark:border-gray-950`
- Sparkle position: top-left (`left-0 top-3` at Hub profile scale)

### Compact (`AuthorAvatar`) frame

- Ring: `from-pink-500 via-green-500 to-yellow-500` with `p-px` `rounded-full` (Hub `AuthorAvatar` has **no** separate dark ring stops — same trio in both themes)
- Image: white inset via `bg-white p-px` when Pro (Hub pattern); dark mode uses `dark:bg-gray-950` / matching inner border like Hub
- Sparkle: bottom-right (`-bottom-1 -right-1`), smaller (`text-sm`); stroke still swaps light white / dark `gray-950`

**Important:** the ring is a **linear** bottom-right gradient via padding trick, **not** a conic gradient.

## Component API

Extend `apps/desktop/src/renderer/src/components/profile/ProfileAvatar.tsx`:

```ts
ProfileAvatar({
  name: string
  url?: string
  className?: string
  isPro?: boolean
  /** Visual recipe. Callers should pass explicitly at known sizes. */
  frame?: 'profile' | 'compact'
})
```

Behavior:

- `isPro !== true` → current plain avatar (no ring, no sparkle).
- `isPro === true` && `frame === 'profile'` → large Hub recipe.
- `isPro === true` && `frame === 'compact'` → compact Hub recipe.
- If `isPro` and `frame` omitted → treat as `'compact'` (safer default for existing small call sites once they pass `isPro`).
- Letter fallback remains; when Pro, wrap fallback in the same ring/sparkle chrome.
- Sparkle is decorative (`aria-hidden`); no `/pro` upsell link required in-app (Hub links to `/pro`; we already have plan UI elsewhere).

Extract a tiny `ProSparkleIcon` (inline SVG) next to or inside the avatar module so gradient `id`s stay unique per instance (Hub uses random/fixed ids; we should use React `useId()` or a stable unique id).

## Data flow

### Types (`packages/shared`)

- `ActivityItem` variants: add `actorIsPro?: boolean`
- `PostSummary`: add `authorIsPro?: boolean`
- Profile / auth `UserProfile.isPro` already exists — no change

### Mappers (`packages/hub-api`)

- `RawActivityItem`: read Hub `isPro` (present on activity actor payloads) → `actorIsPro`
- `RawPost.author`: read `isPro` → `authorIsPro` on `PostSummary`
- Absent / false / undefined → field omitted or `false`; UI treats only `true` as Pro

### Call sites (desktop renderer)

| Location | `frame` | `isPro` source |
|----------|---------|----------------|
| `UserPage` header avatar | `profile` | `data.isPro` |
| `UserPage` small avatars (org strip, etc.) | `compact` | pass when available |
| `FeedItems` / `ActivityFeedItems` | `compact` | `actorIsPro` / `post.authorIsPro` |
| `PostPage` | `compact` | `authorIsPro` |
| `SettingsDialog` account avatar | `compact` | `auth.user.isPro` |

## Error handling / degradation

- Missing `isPro` never triggers extra Hub requests.
- Broken avatar URL → letter fallback inside the same Pro chrome when `isPro`.
- Mapper must not throw if `isPro` is missing from raw JSON.

## Testing

- Unit tests in `packages/hub-api/test` for `mapPost` / `mapActivityFeed`: `isPro: true`, `false`, and omitted.
- No new e2e screenshot suite in this scope; verify manually on Profile + Feed in light and dark themes.

## Out of scope follow-ups (explicit)

- Hardware TFLOPS badge and settings dialog wiring
- Status emoji chip on avatar
- Propagating `isPro` into every remaining avatar-like `<img>` outside `ProfileAvatar`
