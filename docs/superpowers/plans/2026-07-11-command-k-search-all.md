# Command+K Org Search + Search-All Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add org/paper/collection results to Command+K, plus a sidebar-based `/search` page that searches all hub entity types for a query.

**Architecture:** Extend parallel hub searches: keep `hub:search` for repos; add three quicksearch IPC channels (`hub:searchOrgs`, `hub:searchPapers`, `hub:searchCollections`) mirroring `hub:searchUsers`. Wire them into `useGlobalSearch` + CommandPalette, and a new `SearchPage` at `/search?q=&type=`.

**Tech Stack:** Electron IPC + Zod, HubClient (`/api/quicksearch`), React + TanStack Query, React Router (`HashRouter`), cmdk, i18next (en / zh-CN), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-11-command-k-search-all-design.md`

---

## File map

| File | Role |
|------|------|
| `packages/shared/src/types.ts` | `OrgSearchResult`, `PaperSearchResult`, `CollectionSearchResult`; optional `isOrg` on user result |
| `packages/shared/src/ipc.ts` | Three new invoke channels + imports |
| `packages/shared/src/schemas.ts` | Zod `query` min 1 max 64 for each |
| `packages/hub-api/src/client.ts` | `searchOrgs` / `searchPapers` / `searchCollections` |
| `packages/hub-api/test/client-features.test.ts` | Unit tests for the three methods |
| `apps/desktop/src/main/ipc.ts` | Register handlers |
| `apps/desktop/src/main/schemas.test.ts` | Schema accept/reject |
| `apps/desktop/src/renderer/src/hooks/use-global-search.ts` | Return orgs/papers/collections |
| `apps/desktop/src/renderer/src/components/CommandPalette.tsx` | New groups + Search all action |
| `apps/desktop/src/renderer/src/hooks/use-search-page.ts` | Debounced multi-bucket fetch for `/search` |
| `apps/desktop/src/renderer/src/pages/SearchPage.tsx` | Sidebar + results UI |
| `apps/desktop/src/renderer/src/App.tsx` | Route `search` |
| `apps/desktop/src/renderer/src/i18n/locales/en/nav.json` | Strings |
| `apps/desktop/src/renderer/src/i18n/locales/zh-CN/nav.json` | Strings |

---

### Task 1: Shared types + IPC contract + Zod schemas

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/ipc.ts`
- Modify: `packages/shared/src/schemas.ts`
- Modify: `apps/desktop/src/main/schemas.test.ts`

- [ ] **Step 1: Add result types**

In `packages/shared/src/types.ts`, after `UserSearchResult`:

```ts
export interface UserSearchResult {
  name: string
  fullname?: string
  avatarUrl?: string
}

/** Org hit from `/api/quicksearch?type=org` (Hub uses `name`, not `user`). */
export interface OrgSearchResult {
  name: string
  fullname?: string
  avatarUrl?: string
}

/** Paper hit from `/api/quicksearch?type=paper` (`_id` → `id`). */
export interface PaperSearchResult {
  id: string
  title: string
}

/** Collection hit from `/api/quicksearch?type=collection` (`_id` is the routable slug). */
export interface CollectionSearchResult {
  slug: string
  title: string
  description?: string
}
```

(Keep existing `UserSearchResult` unchanged — do not require `isOrg`.)

- [ ] **Step 2: Add IPC contract entries**

In `packages/shared/src/ipc.ts`:

1. Import `OrgSearchResult`, `PaperSearchResult`, `CollectionSearchResult` from `./types`.
2. After `'hub:searchUsers'`:

```ts
'hub:searchOrgs': { req: { query: string }; res: OrgSearchResult[] }
'hub:searchPapers': { req: { query: string }; res: PaperSearchResult[] }
'hub:searchCollections': { req: { query: string }; res: CollectionSearchResult[] }
```

3. Add the three channel names to `IPC_INVOKE_CHANNELS` immediately after `'hub:searchUsers'`.

- [ ] **Step 3: Add Zod schemas**

In `packages/shared/src/schemas.ts`, after `'hub:searchUsers'`:

```ts
'hub:searchOrgs': z.object({ query: z.string().min(1).max(64) }),
'hub:searchPapers': z.object({ query: z.string().min(1).max(64) }),
'hub:searchCollections': z.object({ query: z.string().min(1).max(64) }),
```

- [ ] **Step 4: Schema tests**

Append to `apps/desktop/src/main/schemas.test.ts`:

```ts
it('accepts hub quicksearch query channels and rejects empty/oversized', () => {
  for (const channel of [
    'hub:searchOrgs',
    'hub:searchPapers',
    'hub:searchCollections'
  ] as const) {
    const schema = ipcRequestSchemas[channel]!
    expect(schema.safeParse({ query: 'meta' }).success).toBe(true)
    expect(schema.safeParse({ query: '' }).success).toBe(false)
    expect(schema.safeParse({ query: 'x'.repeat(65) }).success).toBe(false)
  }
})
```

- [ ] **Step 5: Run schema tests**

Run: `pnpm --filter oh-my-huggingface-desktop test -- src/main/schemas.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/ipc.ts packages/shared/src/schemas.ts apps/desktop/src/main/schemas.test.ts
git commit -m "feat(ipc): add org/paper/collection quicksearch channels"
```

---

### Task 2: HubClient quicksearch methods (TDD)

**Files:**
- Modify: `packages/hub-api/src/client.ts`
- Modify: `packages/hub-api/test/client-features.test.ts`

- [ ] **Step 1: Write failing tests**

In `packages/hub-api/test/client-features.test.ts`, after the `searchUsers` describe block:

```ts
describe('HubClient.searchOrgs', () => {
  it('maps orgs and absolutizes avatar URLs', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        orgs: [
          { name: 'meta-llama', fullname: 'Meta Llama', avatarUrl: '/avatars/a.png' },
          { name: 'facebook' }
        ]
      })
    )
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    const orgs = await client.searchOrgs('meta')
    expect(orgs).toEqual([
      {
        name: 'meta-llama',
        fullname: 'Meta Llama',
        avatarUrl: 'https://huggingface.co/avatars/a.png'
      },
      { name: 'facebook', fullname: undefined, avatarUrl: undefined }
    ])
    const url = new URL(fetchImpl.mock.calls[0]![0] as string)
    expect(url.pathname).toBe('/api/quicksearch')
    expect(url.searchParams.get('type')).toBe('org')
    expect(url.searchParams.get('q')).toBe('meta')
  })

  it('degrades to empty on failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('x', { status: 500 }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0, maxRetries: 0 })
    await expect(client.searchOrgs('x')).resolves.toEqual([])
  })
})

describe('HubClient.searchPapers', () => {
  it('maps paper _id and title', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        papers: [{ _id: '2509.26507', id: 'The Dragon Hatchling' }]
      })
    )
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    await expect(client.searchPapers('transformer')).resolves.toEqual([
      { id: '2509.26507', title: 'The Dragon Hatchling' }
    ])
    const url = new URL(fetchImpl.mock.calls[0]![0] as string)
    expect(url.searchParams.get('type')).toBe('paper')
  })

  it('degrades to empty on failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('x', { status: 500 }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0, maxRetries: 0 })
    await expect(client.searchPapers('x')).resolves.toEqual([])
  })
})

describe('HubClient.searchCollections', () => {
  it('maps collection _id as slug and title', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        collections: [
          {
            _id: 'meta-llama/llama-4-67f0c30d9fe03840bc9d0164',
            title: 'Llama 4',
            description: 'Llama 4 release'
          }
        ]
      })
    )
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0 })
    await expect(client.searchCollections('llama')).resolves.toEqual([
      {
        slug: 'meta-llama/llama-4-67f0c30d9fe03840bc9d0164',
        title: 'Llama 4',
        description: 'Llama 4 release'
      }
    ])
    const url = new URL(fetchImpl.mock.calls[0]![0] as string)
    expect(url.searchParams.get('type')).toBe('collection')
  })

  it('degrades to empty on failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('x', { status: 500 }))
    const client = new HubClient({ fetchImpl, cacheTtlMs: 0, minRequestGapMs: 0, maxRetries: 0 })
    await expect(client.searchCollections('x')).resolves.toEqual([])
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm --filter @oh-my-huggingface/hub-api test -- test/client-features.test.ts`

Expected: FAIL (methods missing)

- [ ] **Step 3: Implement HubClient methods**

In `packages/hub-api/src/client.ts`:

1. Extend imports from `@oh-my-huggingface/shared` with `OrgSearchResult`, `PaperSearchResult`, `CollectionSearchResult`.
2. Immediately after `searchUsers`, add:

```ts
/** Org lookup for command palette / search-all. Failures degrade to []. */
async searchOrgs(query: string): Promise<OrgSearchResult[]> {
  const url = new URL(`${this.endpoint}/api/quicksearch`)
  url.searchParams.set('q', query)
  url.searchParams.set('type', 'org')
  try {
    const { body } = await this.getJson<{
      orgs?: Array<{ name?: string; fullname?: string; avatarUrl?: string }>
    }>(url.toString(), { ttl: 60_000 })
    return (body.orgs ?? [])
      .filter((o) => o.name)
      .slice(0, 8)
      .map((o) => ({
        name: o.name ?? '',
        fullname: o.fullname,
        avatarUrl: o.avatarUrl ? new URL(o.avatarUrl, this.endpoint).toString() : undefined
      }))
  } catch {
    return []
  }
}

/** Paper lookup for command palette / search-all. Failures degrade to []. */
async searchPapers(query: string): Promise<PaperSearchResult[]> {
  const url = new URL(`${this.endpoint}/api/quicksearch`)
  url.searchParams.set('q', query)
  url.searchParams.set('type', 'paper')
  try {
    const { body } = await this.getJson<{
      papers?: Array<{ _id?: string; id?: string }>
    }>(url.toString(), { ttl: 60_000 })
    return (body.papers ?? [])
      .filter((p) => p._id && p.id)
      .slice(0, 8)
      .map((p) => ({ id: p._id ?? '', title: p.id ?? '' }))
  } catch {
    return []
  }
}

/** Collection lookup for command palette / search-all. Failures degrade to []. */
async searchCollections(query: string): Promise<CollectionSearchResult[]> {
  const url = new URL(`${this.endpoint}/api/quicksearch`)
  url.searchParams.set('q', query)
  url.searchParams.set('type', 'collection')
  try {
    const { body } = await this.getJson<{
      collections?: Array<{ _id?: string; title?: string; description?: string }>
    }>(url.toString(), { ttl: 60_000 })
    return (body.collections ?? [])
      .filter((c) => c._id && c.title)
      .slice(0, 8)
      .map((c) => ({
        slug: c._id ?? '',
        title: c.title ?? '',
        description: c.description
      }))
  } catch {
    return []
  }
}
```

Note: Hub paper quicksearch uses `id` for the **title** and `_id` for the arXiv/paper id.

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @oh-my-huggingface/hub-api test -- test/client-features.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/hub-api/src/client.ts packages/hub-api/test/client-features.test.ts
git commit -m "feat(hub-api): search orgs, papers, and collections via quicksearch"
```

---

### Task 3: Wire main-process IPC handlers

**Files:**
- Modify: `apps/desktop/src/main/ipc.ts`

- [ ] **Step 1: Register handlers**

Immediately after `handle('hub:searchUsers', …)`:

```ts
handle('hub:searchOrgs', ({ query }) => ctx.hub.searchOrgs(query))
handle('hub:searchPapers', ({ query }) => ctx.hub.searchPapers(query))
handle('hub:searchCollections', ({ query }) => ctx.hub.searchCollections(query))
```

- [ ] **Step 2: Typecheck desktop**

Run: `pnpm --filter oh-my-huggingface-desktop typecheck`

Expected: PASS (contract + handlers align)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/main/ipc.ts
git commit -m "feat(desktop): wire org/paper/collection search IPC"
```

---

### Task 4: Extend `useGlobalSearch`

**Files:**
- Modify: `apps/desktop/src/renderer/src/hooks/use-global-search.ts`

- [ ] **Step 1: Replace hook contents**

```ts
import { useQueries } from '@tanstack/react-query'
import type {
  CollectionSearchResult,
  OrgSearchResult,
  PaperSearchResult,
  RepoKind,
  RepoSummary,
  UserSearchResult
} from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { useDebounced } from '@/hooks/use-debounced'

const STALE_TIME = 60_000

export interface GlobalSearchResults {
  models: RepoSummary[]
  datasets: RepoSummary[]
  spaces: RepoSummary[]
  users: UserSearchResult[]
  orgs: OrgSearchResult[]
  papers: PaperSearchResult[]
  collections: CollectionSearchResult[]
  isLoading: boolean
}

/** Debounced hub-wide search across repos, users, orgs, papers, collections. */
export function useGlobalSearch(query: string): GlobalSearchResults {
  const trimmed = query.trim()
  const q = useDebounced(trimmed, 200)
  const enabled = q !== ''

  const repoQuery = (kind: RepoKind) => ({
    queryKey: ['globalSearch', kind, q],
    queryFn: () =>
      invoke('hub:search', { query: { kind, search: q, sort: 'trending' as const, limit: 5 } }),
    staleTime: STALE_TIME,
    enabled
  })

  const [models, datasets, spaces, users, orgs, papers, collections] = useQueries({
    queries: [
      repoQuery('model'),
      repoQuery('dataset'),
      repoQuery('space'),
      {
        queryKey: ['globalSearch', 'user', q],
        queryFn: () => invoke('hub:searchUsers', { query: q }),
        staleTime: STALE_TIME,
        enabled
      },
      {
        queryKey: ['globalSearch', 'org', q],
        queryFn: () => invoke('hub:searchOrgs', { query: q }),
        staleTime: STALE_TIME,
        enabled
      },
      {
        queryKey: ['globalSearch', 'paper', q],
        queryFn: () => invoke('hub:searchPapers', { query: q }),
        staleTime: STALE_TIME,
        enabled
      },
      {
        queryKey: ['globalSearch', 'collection', q],
        queryFn: () => invoke('hub:searchCollections', { query: q }),
        staleTime: STALE_TIME,
        enabled
      }
    ]
  })

  const asyncQueries = [models, datasets, spaces, users, orgs, papers, collections]

  return {
    models: models.data?.items ?? [],
    datasets: datasets.data?.items ?? [],
    spaces: spaces.data?.items ?? [],
    users: users.data ?? [],
    orgs: orgs.data ?? [],
    papers: papers.data ?? [],
    collections: collections.data ?? [],
    isLoading:
      trimmed !== '' && (trimmed !== q || asyncQueries.some((r) => r.isLoading))
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/src/hooks/use-global-search.ts
git commit -m "feat(search): extend useGlobalSearch with orgs, papers, collections"
```

---

### Task 5: i18n strings

**Files:**
- Modify: `apps/desktop/src/renderer/src/i18n/locales/en/nav.json`
- Modify: `apps/desktop/src/renderer/src/i18n/locales/zh-CN/nav.json`

- [ ] **Step 1: English**

Update / add keys in `en/nav.json`:

```json
{
  "globalSearch": "Search models, datasets, spaces, users, orgs…",
  "organizations": "Organizations",
  "searchAll": "Search all for “{{query}}”",
  "searchPage": {
    "title": "Search results",
    "emptyTitle": "No results",
    "emptyBody": "Try a different query or pick another type.",
    "emptyQueryTitle": "Search the Hub",
    "emptyQueryBody": "Enter a query in the command palette, or add ?q= to the URL.",
    "all": "All",
    "viewMore": "View more"
  }
}
```

Keep existing keys (`papers`, `collections`, `users`, `searchIn`, etc.). Merge into the existing JSON object — do not wipe unrelated keys.

- [ ] **Step 2: Chinese**

In `zh-CN/nav.json`:

```json
{
  "globalSearch": "搜索模型、数据集、Spaces、用户、组织…",
  "organizations": "组织",
  "searchAll": "搜索全部 “{{query}}”",
  "searchPage": {
    "title": "搜索结果",
    "emptyTitle": "无结果",
    "emptyBody": "换个关键词，或切换类型再试。",
    "emptyQueryTitle": "搜索 Hub",
    "emptyQueryBody": "在命令面板输入关键词，或在 URL 加上 ?q=。",
    "all": "全部",
    "viewMore": "查看更多"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/i18n/locales/en/nav.json apps/desktop/src/renderer/src/i18n/locales/zh-CN/nav.json
git commit -m "feat(i18n): strings for org search and search-all page"
```

---

### Task 6: CommandPalette UI

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/CommandPalette.tsx`

- [ ] **Step 1: Imports and icons**

Add to lucide imports: `Building2`, `FileText` (FileText may already exist), `Library` (or `FolderOpen` for collections — prefer `Library` if unused; else `Layers`).

Ensure `FileText` is imported (already used for Papers nav).

- [ ] **Step 2: Update asyncCount and empty logic**

Replace `asyncCount` computation:

```ts
const asyncCount =
  search.models.length +
  search.datasets.length +
  search.spaces.length +
  search.users.length +
  search.orgs.length +
  search.papers.length +
  search.collections.length
```

- [ ] **Step 3: Render new result groups + Search all**

Inside the `page === 'root' && needle !== '' && !search.isLoading` block, after the existing `SEARCH_GROUPS` map and users group, add orgs / papers / collections groups. Place **Search all** action **before** the per-kind `searchKinds.map` rows.

Concrete structure (insert/replace the results + searchIn section):

```tsx
{SEARCH_GROUPS.map(([group, kind]) =>
  search[group].length > 0 ? (
    <Command.Group key={group} heading={t(KIND_LABEL_KEY[kind])}>
      {search[group].map((repo) => (
        <RepoResultItem
          key={repo.id}
          repo={repo}
          locale={locale}
          onSelect={() => closeAnd(() => navigate(`${KIND_PATH[repo.kind]}/${repo.id}`))}
        />
      ))}
    </Command.Group>
  ) : null
)}
{search.orgs.length > 0 && (
  <Command.Group heading={t('nav:organizations')}>
    {search.orgs.map((org) => (
      <Command.Item
        key={org.name}
        value={`org:${org.name}`}
        onSelect={() => closeAnd(() => navigate(`/users/${org.name}`))}
      >
        <Building2 className="size-4 shrink-0 text-ink-faint" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-mono text-ink-strong">{org.name}</span>
        {org.fullname ? (
          <span className="max-w-40 shrink-0 truncate text-[11px] text-ink-faint">{org.fullname}</span>
        ) : null}
      </Command.Item>
    ))}
  </Command.Group>
)}
{search.users.length > 0 && (
  <Command.Group heading={t('nav:users')}>
    {/* existing user items unchanged */}
  </Command.Group>
)}
{search.papers.length > 0 && (
  <Command.Group heading={t('nav:papers')}>
    {search.papers.map((paper) => (
      <Command.Item
        key={paper.id}
        value={`paper:${paper.id}`}
        onSelect={() => closeAnd(() => navigate(`/papers/${paper.id}`))}
      >
        <FileText className="size-4 shrink-0 text-ink-faint" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-ink-strong">{paper.title}</span>
      </Command.Item>
    ))}
  </Command.Group>
)}
{search.collections.length > 0 && (
  <Command.Group heading={t('nav:collections')}>
    {search.collections.map((col) => (
      <Command.Item
        key={col.slug}
        value={`collection:${col.slug}`}
        onSelect={() => closeAnd(() => navigate(`/collections/${col.slug}`))}
      >
        <Library className="size-4 shrink-0 text-ink-faint" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-ink-strong">{col.title}</span>
      </Command.Item>
    ))}
  </Command.Group>
)}
```

Then action rows:

```tsx
{needle !== '' && (
  <>
    <Command.Item
      value={`searchAll:${query}`}
      onSelect={() =>
        closeAnd(() => navigate(`/search?q=${encodeURIComponent(query)}&type=all`))
      }
    >
      <Search className="size-4 shrink-0 text-ink-faint" aria-hidden />
      <span className="truncate">{t('nav:searchAll', { query })}</span>
    </Command.Item>
    {searchKinds.map((kind) => (
      <Command.Item
        key={`searchIn:${kind}`}
        value={`searchIn:${kind}:${query}`}
        onSelect={() => applyFilter(kind, { search: query })}
      >
        <Search className="size-4 shrink-0 text-ink-faint" aria-hidden />
        <span className="truncate">
          {t('nav:searchIn', { kind: t(KIND_LABEL_KEY[kind]), query })}
        </span>
      </Command.Item>
    ))}
  </>
)}
```

Keep users group order as: orgs then users (matches spec: Organizations → Users → Papers → Collections). Move the existing users block to after orgs if it currently precedes orgs.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter oh-my-huggingface-desktop typecheck`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/components/CommandPalette.tsx
git commit -m "feat(palette): show orgs/papers/collections and Search all"
```

---

### Task 7: `useSearchPage` hook

**Files:**
- Create: `apps/desktop/src/renderer/src/hooks/use-search-page.ts`

- [ ] **Step 1: Create hook**

```ts
import { useInfiniteQuery, useQueries } from '@tanstack/react-query'
import type {
  CollectionSearchResult,
  OrgSearchResult,
  PaperSearchResult,
  RepoKind,
  RepoSummary,
  UserSearchResult
} from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { useDebounced } from '@/hooks/use-debounced'

const STALE_TIME = 60_000
const ALL_LIMIT = 10

export type SearchPageType =
  | 'all'
  | 'model'
  | 'dataset'
  | 'space'
  | 'org'
  | 'user'
  | 'paper'
  | 'collection'

export interface SearchPageBuckets {
  models: RepoSummary[]
  datasets: RepoSummary[]
  spaces: RepoSummary[]
  users: UserSearchResult[]
  orgs: OrgSearchResult[]
  papers: PaperSearchResult[]
  collections: CollectionSearchResult[]
}

export interface SearchPageResult {
  buckets: SearchPageBuckets
  isLoading: boolean
  /** Repo infinite query — only active when type is a repo kind. */
  repoItems: RepoSummary[]
  repoHasMore: boolean
  repoFetchMore: () => void
  repoFetchingMore: boolean
}

const EMPTY: SearchPageBuckets = {
  models: [],
  datasets: [],
  spaces: [],
  users: [],
  orgs: [],
  papers: [],
  collections: []
}

export function useSearchPage(query: string, type: SearchPageType): SearchPageResult {
  const trimmed = query.trim()
  const q = useDebounced(trimmed, 200)
  const enabled = q !== ''
  const isRepoType = type === 'model' || type === 'dataset' || type === 'space'
  const allMode = type === 'all'

  const repoInfinite = useInfiniteQuery({
    queryKey: ['searchPage', 'repo', type, q],
    queryFn: ({ pageParam }) =>
      invoke('hub:search', {
        query: {
          kind: type as RepoKind,
          search: q,
          sort: 'trending',
          limit: 30,
          cursor: pageParam
        }
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: STALE_TIME,
    enabled: enabled && isRepoType
  })

  const [models, datasets, spaces, users, orgs, papers, collections] = useQueries({
    queries: [
      {
        queryKey: ['searchPage', 'all', 'model', q],
        queryFn: () =>
          invoke('hub:search', {
            query: { kind: 'model', search: q, sort: 'trending' as const, limit: ALL_LIMIT }
          }),
        staleTime: STALE_TIME,
        enabled: enabled && allMode
      },
      {
        queryKey: ['searchPage', 'all', 'dataset', q],
        queryFn: () =>
          invoke('hub:search', {
            query: { kind: 'dataset', search: q, sort: 'trending' as const, limit: ALL_LIMIT }
          }),
        staleTime: STALE_TIME,
        enabled: enabled && allMode
      },
      {
        queryKey: ['searchPage', 'all', 'space', q],
        queryFn: () =>
          invoke('hub:search', {
            query: { kind: 'space', search: q, sort: 'trending' as const, limit: ALL_LIMIT }
          }),
        staleTime: STALE_TIME,
        enabled: enabled && allMode
      },
      {
        queryKey: ['searchPage', 'user', q],
        queryFn: () => invoke('hub:searchUsers', { query: q }),
        staleTime: STALE_TIME,
        enabled: enabled && (allMode || type === 'user')
      },
      {
        queryKey: ['searchPage', 'org', q],
        queryFn: () => invoke('hub:searchOrgs', { query: q }),
        staleTime: STALE_TIME,
        enabled: enabled && (allMode || type === 'org')
      },
      {
        queryKey: ['searchPage', 'paper', q],
        queryFn: () => invoke('hub:searchPapers', { query: q }),
        staleTime: STALE_TIME,
        enabled: enabled && (allMode || type === 'paper')
      },
      {
        queryKey: ['searchPage', 'collection', q],
        queryFn: () => invoke('hub:searchCollections', { query: q }),
        staleTime: STALE_TIME,
        enabled: enabled && (allMode || type === 'collection')
      }
    ]
  })

  const buckets: SearchPageBuckets = enabled
    ? {
        models: allMode ? (models.data?.items ?? []) : [],
        datasets: allMode ? (datasets.data?.items ?? []) : [],
        spaces: allMode ? (spaces.data?.items ?? []) : [],
        users: users.data ?? [],
        orgs: orgs.data ?? [],
        papers: papers.data ?? [],
        collections: collections.data ?? []
      }
    : EMPTY

  const loadingQueries = allMode
    ? [models, datasets, spaces, users, orgs, papers, collections]
    : isRepoType
      ? [repoInfinite]
      : type === 'user'
        ? [users]
        : type === 'org'
          ? [orgs]
          : type === 'paper'
            ? [papers]
            : [collections]

  return {
    buckets,
    isLoading:
      trimmed !== '' &&
      (trimmed !== q || loadingQueries.some((r) => ('isLoading' in r ? r.isLoading : false))),
    repoItems: repoInfinite.data?.pages.flatMap((p) => p.items) ?? [],
    repoHasMore: Boolean(repoInfinite.hasNextPage),
    repoFetchMore: () => {
      void repoInfinite.fetchNextPage()
    },
    repoFetchingMore: repoInfinite.isFetchingNextPage
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/src/hooks/use-search-page.ts
git commit -m "feat(search): add useSearchPage hook for /search"
```

---

### Task 8: SearchPage UI + route

**Files:**
- Create: `apps/desktop/src/renderer/src/pages/SearchPage.tsx`
- Modify: `apps/desktop/src/renderer/src/App.tsx`

- [ ] **Step 1: Create SearchPage**

```tsx
import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownToLine,
  Boxes,
  Building2,
  Database,
  FileText,
  Heart,
  LayoutGrid,
  Library,
  Loader2,
  Search,
  User
} from 'lucide-react'
import type { RepoKind, RepoSummary } from '@oh-my-huggingface/shared'
import { formatCount } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type SearchPageType,
  useSearchPage
} from '@/hooks/use-search-page'
import { resolveLocale, useAppStore } from '@/stores/app'

const TYPES: SearchPageType[] = [
  'all',
  'model',
  'dataset',
  'space',
  'org',
  'user',
  'paper',
  'collection'
]

const KIND_PATH: Record<RepoKind, string> = {
  model: '/models',
  dataset: '/datasets',
  space: '/spaces'
}

function parseType(raw: string | null): SearchPageType {
  if (raw && (TYPES as string[]).includes(raw)) return raw as SearchPageType
  return 'all'
}

function typeLabelKey(type: SearchPageType): string {
  switch (type) {
    case 'all':
      return 'nav:searchPage.all'
    case 'model':
      return 'nav:models'
    case 'dataset':
      return 'nav:datasets'
    case 'space':
      return 'nav:spaces'
    case 'org':
      return 'nav:organizations'
    case 'user':
      return 'nav:users'
    case 'paper':
      return 'nav:papers'
    case 'collection':
      return 'nav:collections'
  }
}

function RepoRow({
  repo,
  locale,
  showKind,
  onOpen
}: {
  repo: RepoSummary
  locale: string
  showKind: boolean
  onOpen: () => void
}): React.JSX.Element {
  const Icon = repo.kind === 'model' ? Boxes : repo.kind === 'dataset' ? Database : LayoutGrid
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] hover:bg-panel-2"
    >
      <Icon className="size-4 shrink-0 text-ink-faint" aria-hidden />
      <span className="min-w-0 flex-1 truncate font-mono text-ink-strong">{repo.id}</span>
      {showKind ? (
        <span className="shrink-0 text-[10px] tracking-wider text-ink-faint uppercase">
          {repo.kind}
        </span>
      ) : (
        <span className="nums flex shrink-0 items-center gap-2 text-[11px] text-ink-faint">
          <span className="flex items-center gap-0.5">
            <Heart className="size-3" aria-hidden />
            {formatCount(repo.likes, locale)}
          </span>
          <span className="flex items-center gap-0.5">
            <ArrowDownToLine className="size-3" aria-hidden />
            {formatCount(repo.downloads, locale)}
          </span>
        </span>
      )}
    </button>
  )
}

export function SearchPage(): React.JSX.Element {
  const { t } = useTranslation('nav')
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const type = parseType(params.get('type'))
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)
  const search = useSearchPage(q, type)

  const setType = (next: SearchPageType): void => {
    const sp = new URLSearchParams(params)
    sp.set('type', next)
    if (q) sp.set('q', q)
    setParams(sp, { replace: true })
  }

  const counts = useMemo(() => {
    const b = search.buckets
    return {
      all: undefined as number | undefined,
      model: type === 'all' ? b.models.length : type === 'model' ? search.repoItems.length : undefined,
      dataset:
        type === 'all' ? b.datasets.length : type === 'dataset' ? search.repoItems.length : undefined,
      space: type === 'all' ? b.spaces.length : type === 'space' ? search.repoItems.length : undefined,
      org: b.orgs.length || undefined,
      user: b.users.length || undefined,
      paper: b.papers.length || undefined,
      collection: b.collections.length || undefined
    }
  }, [search.buckets, search.repoItems.length, type])

  const hasAny =
    type === 'all'
      ? Object.values(search.buckets).some((arr) => arr.length > 0)
      : type === 'model' || type === 'dataset' || type === 'space'
        ? search.repoItems.length > 0
        : type === 'org'
          ? search.buckets.orgs.length > 0
          : type === 'user'
            ? search.buckets.users.length > 0
            : type === 'paper'
              ? search.buckets.papers.length > 0
              : search.buckets.collections.length > 0

  return (
    <div className="flex h-full min-w-0 flex-col">
      <header className="shrink-0 border-b px-5 py-4">
        <h1 className="text-[15px] font-semibold text-ink-strong">{t('searchPage.title')}</h1>
        {q.trim() ? (
          <p className="mt-0.5 text-[12.5px] text-ink-muted">“{q.trim()}”</p>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 max-md:flex-col">
        <nav
          className="flex w-44 shrink-0 flex-col gap-0.5 border-r p-2 max-md:w-full max-md:flex-row max-md:overflow-x-auto max-md:border-r-0 max-md:border-b"
          aria-label={t('searchPage.title')}
        >
          {TYPES.map((item) => {
            const active = item === type
            const count = counts[item === 'model' ? 'model' : item === 'dataset' ? 'dataset' : item === 'space' ? 'space' : item]
            return (
              <button
                key={item}
                type="button"
                onClick={() => setType(item)}
                className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] max-md:shrink-0 ${
                  active ? 'bg-ink text-elevated' : 'text-ink hover:bg-panel-2'
                }`}
              >
                <span>{t(typeLabelKey(item))}</span>
                {count != null && count > 0 ? (
                  <span className={`nums text-[11px] ${active ? 'opacity-70' : 'text-ink-faint'}`}>
                    {count}
                  </span>
                ) : null}
              </button>
            )
          })}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto p-3">
          {!q.trim() ? (
            <EmptyState
              icon={Search}
              title={t('searchPage.emptyQueryTitle')}
              body={t('searchPage.emptyQueryBody')}
            />
          ) : search.isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : !hasAny ? (
            <EmptyState icon={Search} title={t('searchPage.emptyTitle')} body={t('searchPage.emptyBody')} />
          ) : type === 'all' ? (
            <div className="space-y-5">
              {(
                [
                  ['models', 'model', search.buckets.models],
                  ['datasets', 'dataset', search.buckets.datasets],
                  ['spaces', 'space', search.buckets.spaces]
                ] as const
              ).map(([key, kind, items]) =>
                items.length > 0 ? (
                  <section key={key}>
                    <div className="mb-1 flex items-center justify-between px-2">
                      <h2 className="text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
                        {t(typeLabelKey(kind))}
                      </h2>
                      <button
                        type="button"
                        className="text-[11px] text-ink-muted hover:text-ink"
                        onClick={() => setType(kind)}
                      >
                        {t('searchPage.viewMore')}
                      </button>
                    </div>
                    {items.map((repo) => (
                      <RepoRow
                        key={repo.id}
                        repo={repo}
                        locale={locale}
                        showKind
                        onOpen={() => navigate(`${KIND_PATH[repo.kind]}/${repo.id}`)}
                      />
                    ))}
                  </section>
                ) : null
              )}
              {search.buckets.orgs.length > 0 && (
                <section>
                  <div className="mb-1 flex items-center justify-between px-2">
                    <h2 className="text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
                      {t('organizations')}
                    </h2>
                    <button type="button" className="text-[11px] text-ink-muted hover:text-ink" onClick={() => setType('org')}>
                      {t('searchPage.viewMore')}
                    </button>
                  </div>
                  {search.buckets.orgs.map((org) => (
                    <button
                      key={org.name}
                      type="button"
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] hover:bg-panel-2"
                      onClick={() => navigate(`/users/${org.name}`)}
                    >
                      <Building2 className="size-4 shrink-0 text-ink-faint" aria-hidden />
                      <span className="min-w-0 flex-1 truncate font-mono text-ink-strong">{org.name}</span>
                      {org.fullname ? (
                        <span className="max-w-40 truncate text-[11px] text-ink-faint">{org.fullname}</span>
                      ) : null}
                    </button>
                  ))}
                </section>
              )}
              {search.buckets.users.length > 0 && (
                <section>
                  <div className="mb-1 flex items-center justify-between px-2">
                    <h2 className="text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
                      {t('users')}
                    </h2>
                    <button type="button" className="text-[11px] text-ink-muted hover:text-ink" onClick={() => setType('user')}>
                      {t('searchPage.viewMore')}
                    </button>
                  </div>
                  {search.buckets.users.map((user) => (
                    <button
                      key={user.name}
                      type="button"
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] hover:bg-panel-2"
                      onClick={() => navigate(`/users/${user.name}`)}
                    >
                      <User className="size-4 shrink-0 text-ink-faint" aria-hidden />
                      <span className="min-w-0 flex-1 truncate font-mono text-ink-strong">{user.name}</span>
                    </button>
                  ))}
                </section>
              )}
              {search.buckets.papers.length > 0 && (
                <section>
                  <div className="mb-1 flex items-center justify-between px-2">
                    <h2 className="text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
                      {t('papers')}
                    </h2>
                    <button type="button" className="text-[11px] text-ink-muted hover:text-ink" onClick={() => setType('paper')}>
                      {t('searchPage.viewMore')}
                    </button>
                  </div>
                  {search.buckets.papers.map((paper) => (
                    <button
                      key={paper.id}
                      type="button"
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] hover:bg-panel-2"
                      onClick={() => navigate(`/papers/${paper.id}`)}
                    >
                      <FileText className="size-4 shrink-0 text-ink-faint" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-ink-strong">{paper.title}</span>
                    </button>
                  ))}
                </section>
              )}
              {search.buckets.collections.length > 0 && (
                <section>
                  <div className="mb-1 flex items-center justify-between px-2">
                    <h2 className="text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
                      {t('collections')}
                    </h2>
                    <button
                      type="button"
                      className="text-[11px] text-ink-muted hover:text-ink"
                      onClick={() => setType('collection')}
                    >
                      {t('searchPage.viewMore')}
                    </button>
                  </div>
                  {search.buckets.collections.map((col) => (
                    <button
                      key={col.slug}
                      type="button"
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] hover:bg-panel-2"
                      onClick={() => navigate(`/collections/${col.slug}`)}
                    >
                      <Library className="size-4 shrink-0 text-ink-faint" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-ink-strong">{col.title}</span>
                    </button>
                  ))}
                </section>
              )}
            </div>
          ) : type === 'model' || type === 'dataset' || type === 'space' ? (
            <div>
              {search.repoItems.map((repo) => (
                <RepoRow
                  key={repo.id}
                  repo={repo}
                  locale={locale}
                  showKind={false}
                  onOpen={() => navigate(`${KIND_PATH[repo.kind]}/${repo.id}`)}
                />
              ))}
              {search.repoHasMore ? (
                <div className="flex justify-center py-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={search.repoFetchingMore}
                    onClick={() => search.repoFetchMore()}
                  >
                    {search.repoFetchingMore ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      t('searchPage.viewMore')
                    )}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : type === 'org' ? (
            search.buckets.orgs.map((org) => (
              <button
                key={org.name}
                type="button"
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] hover:bg-panel-2"
                onClick={() => navigate(`/users/${org.name}`)}
              >
                <Building2 className="size-4 shrink-0 text-ink-faint" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-mono text-ink-strong">{org.name}</span>
                {org.fullname ? (
                  <span className="max-w-40 truncate text-[11px] text-ink-faint">{org.fullname}</span>
                ) : null}
              </button>
            ))
          ) : type === 'user' ? (
            search.buckets.users.map((user) => (
              <button
                key={user.name}
                type="button"
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] hover:bg-panel-2"
                onClick={() => navigate(`/users/${user.name}`)}
              >
                <User className="size-4 shrink-0 text-ink-faint" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-mono text-ink-strong">{user.name}</span>
              </button>
            ))
          ) : type === 'paper' ? (
            search.buckets.papers.map((paper) => (
              <button
                key={paper.id}
                type="button"
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] hover:bg-panel-2"
                onClick={() => navigate(`/papers/${paper.id}`)}
              >
                <FileText className="size-4 shrink-0 text-ink-faint" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-ink-strong">{paper.title}</span>
              </button>
            ))
          ) : (
            search.buckets.collections.map((col) => (
              <button
                key={col.slug}
                type="button"
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] hover:bg-panel-2"
                onClick={() => navigate(`/collections/${col.slug}`)}
              >
                <Library className="size-4 shrink-0 text-ink-faint" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-ink-strong">{col.title}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
```

If `Button` `variant`/`size` APIs differ in this repo, match existing `Button` usage from another page (e.g. `UserPage`).

- [ ] **Step 2: Register route**

In `App.tsx`:

1. `import { SearchPage } from '@/pages/SearchPage'`
2. Before the catch-all route:

```tsx
<Route path="search" element={<SearchPage />} />
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter oh-my-huggingface-desktop typecheck`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/SearchPage.tsx apps/desktop/src/renderer/src/App.tsx
git commit -m "feat(search): add /search page with sidebar type filters"
```

---

### Task 9: Manual verification

**Files:** none (manual)

- [ ] **Step 1: Run app**

Run: `pnpm --filter oh-my-huggingface-desktop dev`

- [ ] **Step 2: Checklist**

1. ⌘K → type `meta` → see Models, Orgs, Users (and others if returned); empty groups hidden.
2. Select an org → lands on `/users/meta-llama` (or similar) profile.
3. Choose **Search all “meta”** → `/search?q=meta&type=all` with sidebar + typed sections.
4. Click sidebar **Organizations** → URL `type=org`, only orgs listed.
5. Click sidebar **Models** → paginated repo list; **View more** loads next page.
6. Paper / collection rows navigate to `/papers/:id` and `/collections/:slug`.
7. Empty query `/search` shows empty-query EmptyState (no hub spam).
8. zh-CN locale: placeholder + Search all + sidebar labels localized.

- [ ] **Step 3: Final commit only if polish fixes were needed**

Otherwise done.

---

## Spec coverage self-review

| Spec requirement | Task |
|------------------|------|
| `hub:searchOrgs/Papers/Collections` + types | 1–3 |
| Palette groups for org/paper/collection | 4, 6 |
| Search all action above per-kind searchIn | 6 |
| Keep searchIn for model/dataset/space | 6 |
| `/search?q=&type=` sidebar layout | 7–8 |
| All = typed sections; single type filters | 8 |
| Repo pagination on single type | 7–8 |
| Per-bucket failure → [] | 2 |
| Empty q empty-state | 8 |
| i18n en + zh-CN | 5 |
| No main sidebar Search nav | (explicitly omitted) |
| No papers/collections searchIn rows | (explicitly omitted) |
| Schema tests | 1 |
| HubClient unit tests | 2 |

**Placeholder scan:** none intentional.  
**Type consistency:** `OrgSearchResult` / `PaperSearchResult` / `CollectionSearchResult` / `SearchPageType` names match across tasks.
