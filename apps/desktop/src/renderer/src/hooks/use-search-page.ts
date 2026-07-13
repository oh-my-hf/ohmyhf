import { useInfiniteQuery, useQueries } from '@tanstack/react-query'
import type {
  CollectionSearchResult,
  OrgSearchResult,
  PaperSearchResult,
  RepoKind,
  RepoSummary,
  UserSearchResult
} from '@oh-my-huggingface/shared'
import { normalizeHubEndpoint } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { useDebounced } from '@/hooks/use-debounced'
import { useAppStore } from '@/stores/app'

const STALE_TIME = 60_000
const ALL_LIMIT = 10

export type SearchPageType =
  'all' | 'model' | 'dataset' | 'space' | 'org' | 'user' | 'paper' | 'collection'

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
  isError: boolean
  error?: unknown
  failedTypes: Exclude<SearchPageType, 'all'>[]
  partialError: boolean
  retry: () => void
  /** Repo infinite query — only active when type is a repo kind. */
  repoItems: RepoSummary[]
  repoHasMore: boolean
  repoFetchMore: () => void
  repoFetchingMore: boolean
  repoLoadMoreError?: unknown
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
  const endpointKey = normalizeHubEndpoint(useAppStore((s) => s.settings.hubEndpoint))

  // Full list for a single repo tab (paginated). Sidebar counts always use the
  // preview queries below so every type keeps a number when switching tabs.
  const repoInfinite = useInfiniteQuery({
    queryKey: ['searchPage', 'repo', type, q, browsePageSize, endpointKey],
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
        queryKey: ['searchPage', 'preview', 'model', q, endpointKey],
        queryFn: () =>
          invoke('hub:search', {
            query: { kind: 'model', search: q, sort: 'trending' as const, limit: ALL_LIMIT }
          }),
        staleTime: STALE_TIME,
        enabled
      },
      {
        queryKey: ['searchPage', 'preview', 'dataset', q, endpointKey],
        queryFn: () =>
          invoke('hub:search', {
            query: { kind: 'dataset', search: q, sort: 'trending' as const, limit: ALL_LIMIT }
          }),
        staleTime: STALE_TIME,
        enabled
      },
      {
        queryKey: ['searchPage', 'preview', 'space', q, endpointKey],
        queryFn: () =>
          invoke('hub:search', {
            query: { kind: 'space', search: q, sort: 'trending' as const, limit: ALL_LIMIT }
          }),
        staleTime: STALE_TIME,
        enabled
      },
      {
        queryKey: ['searchPage', 'user', q, endpointKey],
        queryFn: () => invoke('hub:searchUsers', { query: q }),
        staleTime: STALE_TIME,
        enabled
      },
      {
        queryKey: ['searchPage', 'org', q, endpointKey],
        queryFn: () => invoke('hub:searchOrgs', { query: q }),
        staleTime: STALE_TIME,
        enabled
      },
      {
        queryKey: ['searchPage', 'paper', q, endpointKey],
        queryFn: () => invoke('hub:searchPapers', { query: q }),
        staleTime: STALE_TIME,
        enabled
      },
      {
        queryKey: ['searchPage', 'collection', q, endpointKey],
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

  const previewEntries = [
    { type: 'model', result: models },
    { type: 'dataset', result: datasets },
    { type: 'space', result: spaces },
    { type: 'user', result: users },
    { type: 'org', result: orgs },
    { type: 'paper', result: papers },
    { type: 'collection', result: collections }
  ] as const
  // Keep usable cached data visible when a background refresh fails. A source
  // is unavailable only when it has no result to show at all.
  const failedEntries = previewEntries.filter(
    ({ result }) => result.isError && result.data === undefined
  )
  const failedTypes = failedEntries.map(({ type: failedType }) => failedType)
  const activePreview = previewEntries.find(({ type: candidate }) => candidate === type)?.result
  const activeResult = isRepoType ? repoInfinite : activePreview
  const settledQuery = enabled && trimmed === q
  const allFailed = allMode && failedEntries.length === previewEntries.length
  const activeIsError = isRepoType
    ? repoInfinite.isError && repoInfinite.data === undefined
    : Boolean(activeResult?.isError && activeResult.data === undefined)
  const isError = settledQuery && (allMode ? allFailed : activeIsError)
  const error = allMode ? failedEntries[0]?.result.error : activeResult?.error

  const retry = (): void => {
    if (allMode) {
      for (const { result } of failedEntries) void result.refetch()
      return
    }
    void activeResult?.refetch()
  }

  return {
    buckets,
    isLoading: trimmed !== '' && (trimmed !== q || contentLoading),
    isError,
    error,
    failedTypes,
    partialError: settledQuery && allMode && failedEntries.length > 0 && !allFailed,
    retry,
    repoItems: repoInfinite.data?.pages.flatMap((page) => page.items) ?? [],
    repoHasMore: Boolean(repoInfinite.hasNextPage),
    repoFetchMore: () => {
      void repoInfinite.fetchNextPage()
    },
    repoFetchingMore: repoInfinite.isFetchingNextPage,
    repoLoadMoreError: repoInfinite.isFetchNextPageError ? repoInfinite.error : undefined
  }
}
