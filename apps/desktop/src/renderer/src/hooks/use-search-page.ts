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
import { useAppStore } from '@/stores/app'

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
  const browsePageSize = useAppStore((s) => s.settings.browsePageSize)

  // Full list for a single repo tab (paginated). Sidebar counts always use the
  // preview queries below so every type keeps a number when switching tabs.
  const repoInfinite = useInfiniteQuery({
    queryKey: ['searchPage', 'repo', type, q, browsePageSize],
    queryFn: ({ pageParam }) =>
      invoke('hub:search', {
        query: {
          kind: type as RepoKind,
          search: q,
          sort: 'trending' as const,
          limit: browsePageSize,
          ...(pageParam ? { cursor: pageParam } : {})
        }
      }),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? null,
    staleTime: STALE_TIME,
    enabled: enabled && isRepoType
  })

  const [models, datasets, spaces, users, orgs, papers, collections] = useQueries({
    queries: [
      {
        queryKey: ['searchPage', 'preview', 'model', q],
        queryFn: () =>
          invoke('hub:search', {
            query: { kind: 'model', search: q, sort: 'trending' as const, limit: ALL_LIMIT }
          }),
        staleTime: STALE_TIME,
        enabled
      },
      {
        queryKey: ['searchPage', 'preview', 'dataset', q],
        queryFn: () =>
          invoke('hub:search', {
            query: { kind: 'dataset', search: q, sort: 'trending' as const, limit: ALL_LIMIT }
          }),
        staleTime: STALE_TIME,
        enabled
      },
      {
        queryKey: ['searchPage', 'preview', 'space', q],
        queryFn: () =>
          invoke('hub:search', {
            query: { kind: 'space', search: q, sort: 'trending' as const, limit: ALL_LIMIT }
          }),
        staleTime: STALE_TIME,
        enabled
      },
      {
        queryKey: ['searchPage', 'user', q],
        queryFn: () => invoke('hub:searchUsers', { query: q }),
        staleTime: STALE_TIME,
        enabled
      },
      {
        queryKey: ['searchPage', 'org', q],
        queryFn: () => invoke('hub:searchOrgs', { query: q }),
        staleTime: STALE_TIME,
        enabled
      },
      {
        queryKey: ['searchPage', 'paper', q],
        queryFn: () => invoke('hub:searchPapers', { query: q }),
        staleTime: STALE_TIME,
        enabled
      },
      {
        queryKey: ['searchPage', 'collection', q],
        queryFn: () => invoke('hub:searchCollections', { query: q }),
        staleTime: STALE_TIME,
        enabled
      }
    ]
  })

  const buckets: SearchPageBuckets = enabled
    ? {
        models: models.data?.items ?? [],
        datasets: datasets.data?.items ?? [],
        spaces: spaces.data?.items ?? [],
        users: users.data ?? [],
        orgs: orgs.data ?? [],
        papers: papers.data ?? [],
        collections: collections.data ?? []
      }
    : EMPTY

  // Content loading only — don't block the page on sidebar preview fetches.
  const contentLoading = allMode
    ? [models, datasets, spaces, users, orgs, papers, collections].some((r) => r.isLoading)
    : isRepoType
      ? repoInfinite.isLoading
      : type === 'user'
        ? users.isLoading
        : type === 'org'
          ? orgs.isLoading
          : type === 'paper'
            ? papers.isLoading
            : collections.isLoading

  return {
    buckets,
    isLoading: trimmed !== '' && (trimmed !== q || contentLoading),
    repoItems: repoInfinite.data?.pages.flatMap((page) => page.items) ?? [],
    repoHasMore: Boolean(repoInfinite.hasNextPage),
    repoFetchMore: () => {
      void repoInfinite.fetchNextPage()
    },
    repoFetchingMore: repoInfinite.isFetchingNextPage
  }
}
