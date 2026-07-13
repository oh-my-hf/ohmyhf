# Personalization Browse Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `browsePageSize`, `repoOpenTarget`, and `historyLimit` from `AppSettings` into browse lists, open handlers, and history pruning.

**Architecture:** Shared fields already on `AppSettings`. Renderer reads page size / open target from Zustand; main `Library` reads `historyLimit` via settings callback.

**Spec:** `docs/superpowers/specs/2026-07-11-local-personalization-design.md` (Phase 2)

**Status:** Implemented / Historical (local personalization rollout).

---

## File map

| File                                              | Role                                               |
| ------------------------------------------------- | -------------------------------------------------- |
| `packages/shared/src/types.ts`                    | `browsePageSize`, `repoOpenTarget`, `historyLimit` |
| `packages/shared/src/schemas.ts`                  | Zod unions/enums                                   |
| `RepoList.tsx` / `use-search-page.ts`             | `limit` from settings                              |
| `lib/repo-open.ts`                                | Open in app vs browser                             |
| `FavoritesPage` / `SearchPage` / `CommandPalette` | Honor `repoOpenTarget`                             |
| `library.ts`                                      | Settings-backed history limit + prune              |
| Appearance UI                                     | Three Selects                                      |

---

### Tasks (done)

- [x] Schema + defaults
- [x] Browse list / search page size
- [x] Open target helper + call sites
- [x] History limit + prune on record
- [x] Appearance controls + i18n
