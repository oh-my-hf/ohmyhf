# Personalization Privacy Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Granular `privacy:clearLocalData` categories plus `settings:export` / `settings:import` JSON transfer (preserve local `hfCacheDir`).

**Architecture:** Extend clear helper with selective flags; main-process save/open dialogs; Zod `settingsExportFileSchema` for import validation; reuse `applySettingsPatch` side effects.

**Spec:** `docs/superpowers/specs/2026-07-11-local-personalization-design.md` (Phase 3)

**Status:** Implemented with the local personalization rollout.

---

## File map

| File | Role |
|------|------|
| `packages/shared/src/ipc.ts` | Clear req shape; export/import channels |
| `packages/shared/src/schemas.ts` | Clear + export file schemas |
| `privacy.ts` | Selective table deletes |
| `ipc.ts` | Handlers + dialogs |
| `PrivacySection.tsx` | Checkboxes + transfer buttons |
| i18n en / zh-CN | Copy |

---

### Tasks (done)

- [x] Granular clear IPC + tests
- [x] Export / import IPC
- [x] Privacy UI + i18n
- [x] Preserve `hfCacheDir` on import
