# Command+K global search: orgs + search-all page

Date: 2026-07-11  
Status: approved

## Goal

Extend the Command+K palette so users can find organizations (and papers / collections) in the live preview, and add a dedicated **Search all** results page that surfaces every related hub entity for a query.

## Decisions

| Topic | Choice |
|-------|--------|
| Interaction model | Keep palette grouped previews; add a **Search all “q”** action that opens a dedicated page |
| Orgs | Show in both palette preview and the search-all page |
| Search-all layout | Sidebar category nav + results list (HF-like) |
| Per-kind palette actions | Keep existing “Search models/datasets/spaces for q”; put **Search all** above them |
| Implementation approach | Extend parallel `hub:search` + new quicksearch IPC channels (not a single unified quicksearch for repos) |
| Entity scope | Models, Datasets, Spaces, Organizations, Users, Papers, Collections |

## Architecture

### Data sources

| Entity | IPC | Hub API | Palette limit | Search-all |
|--------|-----|---------|---------------|------------|
| Model / Dataset / Space | existing `hub:search` | list endpoints with `search` | 5 each | ~10 + cursor pagination |
| User | existing `hub:searchUsers` | `/api/quicksearch?type=user` | ~8 | one page |
| Org | new `hub:searchOrgs` | `/api/quicksearch?type=org` | ~5–8 | one page |
| Paper | new `hub:searchPapers` | `/api/quicksearch?type=paper` | ~5 | one page |
| Collection | new `hub:searchCollections` | `/api/quicksearch?type=collection` | ~5 | one page |

Failures on any single channel degrade to an empty list for that bucket (same pattern as `searchUsers` today). Do not fail the whole palette or page.

### Navigation targets

- Repo → `/models|datasets|spaces/:id`
- User / Org → `/users/:name` (existing profile page already resolves orgs)
- Paper → `/papers/:id`
- Collection → `/collections/:slug`

### Route

`/search?q=<query>&type=<all|model|dataset|space|org|user|paper|collection>`

- Default `type=all`
- Changing the sidebar only updates `type`; `q` is preserved
- Empty `q`: show empty-state prompt (do not fire hub queries). Palette never emits Search all with an empty query.

## Command+K UI

When the root page has a non-empty query:

1. Loading indicator until debounced queries settle (existing behavior).
2. Result groups — omit empty groups. Fixed order:
   Models → Datasets → Spaces → Organizations → Users → Papers → Collections
3. Action rows (always when query non-empty):
   - **Search all “q”** → navigate to `/search?q=…&type=all` (first)
   - Search models / datasets / spaces for “q” (unchanged; current browse kind still listed first among these three)
4. Static nav / filters / theme rows below (unchanged filtering).

Org rows use a building/org icon; papers show title; collections show title (optional owner). Update the global-search placeholder copy to mention orgs / papers / collections.

## Search-all page UI

- **Desktop:** narrow left sidebar + main results column.
- **Narrow viewports:** sidebar becomes a horizontal scrollable chip row.
- **Sidebar items:** All + seven entity types. Show counts when available (`*Count` from quicksearch or current page length).
- **`type=all`:** parallel fetch of all seven buckets (~10 each for repos; one page for quicksearch types). Render as **typed sections** (heading + rows + affordance to switch sidebar type for more). Empty sections omitted.
- **Single type:** only that bucket. Repo kinds support Load more via cursor. Quicksearch kinds are single-page.
- Reuse existing EmptyState / Skeleton patterns.
- Do **not** add a permanent main-app sidebar “Search” nav item in this change.

## Shared types & IPC

- Extend or reuse `UserSearchResult` for orgs (add optional `isOrg` if useful for badges; org quicksearch uses `name` / `fullname` / `avatarUrl`).
- Add slim result types for paper/collection quicksearch hits if full `PaperSummary` / `CollectionSummary` cannot be filled from quicksearch alone. Minimum fields: paper `{ id, title }` (Hub `_id` → `id`); collection `{ slug, title }` (Hub `_id` is the collection slug path).
- Register `hub:searchOrgs`, `hub:searchPapers`, `hub:searchCollections` in shared IPC + zod schemas (query string min 1, max length aligned with users: 64).
- Wire handlers in desktop main `ipc.ts` → `HubClient` methods.

## Hook / page wiring

- Extend `useGlobalSearch` to return `orgs`, `papers`, `collections` and include them in `isLoading`.
- New page component (e.g. `SearchPage`) + route in `App.tsx`.
- i18n keys (en + zh-CN) for: Organizations, Papers, Collections group headings, Search all action, search page title/empty, sidebar labels, placeholder.

## Error handling

- Per-bucket empty on network/API failure.
- Schema rejects oversized queries at IPC boundary.
- Partial success on All view: render only buckets with items.

## Testing

- HubClient unit tests for the three new quicksearch helpers (happy path mapping + failure → `[]`).
- IPC schema coverage for new channels.
- Hook/page behavior: URL `type` switching; All vs single-type rendering; empty query empty-state.

## Out of scope

- “Search papers/collections for q” shortcut rows in the palette (sidebar on `/search` covers filtering).
- Permanent sidebar Search entry.
- Enriching quicksearch hits with likes/downloads or full paper metadata beyond what quicksearch returns.
- Buckets / kernels from the Hub quicksearch payload.
