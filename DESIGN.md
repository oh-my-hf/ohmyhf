# Design

Visual system for Oh My HuggingFace. Register: **product** — design serves the task.
Mood: "precision instrument for model hunters — clinical surface, one crimson signal."

## Color

Strategy: **Restrained.** Pure neutral surfaces (chroma 0), a single crimson primary carrying
actions, selection, and focus. Semantic colors are reserved for state, never decoration.
All colors in OKLCH. Tokens live in `apps/desktop/src/renderer/src/assets/main.css`.

### Light theme

| Role        | Value                    | Usage                                    |
| ----------- | ------------------------ | ---------------------------------------- |
| bg          | `oklch(1 0 0)`           | Content surface (pure white)             |
| panel       | `oklch(0.972 0 0)`       | Sidebar, toolbars, second neutral layer  |
| border      | `oklch(0.908 0 0)`       | Hairlines, dividers                      |
| ink         | `oklch(0.205 0 0)`       | Body text                                |
| ink-muted   | `oklch(0.462 0 0)`       | Secondary text (≥4.5:1 on bg)            |
| primary     | `oklch(0.578 0.226 22)`  | Primary actions, selection, focus ring   |
| primary-ink | `oklch(0.995 0 0)`       | Text on primary                          |
| accent      | `oklch(0.472 0.185 18)`  | Primary hover/pressed (deeper oxblood)   |

### Dark theme

| Role        | Value                    |
| ----------- | ------------------------ |
| bg          | `oklch(0.185 0 0)`       |
| panel       | `oklch(0.225 0 0)`       |
| border      | `oklch(0.310 0 0)`       |
| ink         | `oklch(0.930 0 0)`       |
| ink-muted   | `oklch(0.712 0 0)`       |
| primary     | `oklch(0.640 0.216 21)`  |
| primary-ink | `oklch(0.995 0 0)`       |
| accent      | `oklch(0.720 0.185 19)`  |

### Semantic state

success `oklch(0.60 0.14 150)`, warning `oklch(0.72 0.15 75)`, error `oklch(0.55 0.20 27)`,
info `oklch(0.60 0.12 240)` (dark theme: raise L by ~0.08). Error is distinguished from primary by
context and iconography, never color alone.

## Typography

One family: **Inter Variable**, bundled locally via `@fontsource-variable/inter` (privacy: no font
CDNs). Code/data: `ui-monospace` stack. Fixed rem scale (ratio ~1.2): 12 / 13 / 14 (base) / 16 /
20 / 24. Weights: 400 body, 500 UI labels, 600 headings. No display faces, no fluid type. Prose
(model cards) capped at 72ch; tables and lists run dense.

## Layout

Three-pane app shell: icon+label sidebar (collapsible, panel tone) / virtualized list pane /
detail pane. 4px spacing grid; list rows 40–56px. Responsive behavior is structural: below 900px
the detail pane overlays; below 640px the sidebar collapses to icons.

## Components

shadcn-style primitives on Radix (Button, Input, Dialog, Command, Tabs, Tooltip, DropdownMenu,
ScrollArea, Switch, Select). Every interactive component ships default/hover/focus/active/
disabled/loading states. Skeletons for loading (never centered spinners in content), empty states
that teach. Radius: 6px controls, 8px surfaces — never above 12px.

## Motion

150–250ms, `ease-out` (quart). Motion conveys state only: pane transitions, progress, toasts.
No page-load choreography. `prefers-reduced-motion: reduce` → instant transitions.

## Iconography

lucide-react, 16px in dense UI, 20px in navigation, 1.5px stroke. No emoji in UI chrome
(and never 🤗 anywhere).
