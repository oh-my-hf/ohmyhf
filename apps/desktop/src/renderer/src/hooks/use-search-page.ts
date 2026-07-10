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
          sort: 'trending' as const,
          limit: 30,
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
      (trimmed !== q || loadingQueries.some((result) => result.isLoading)),
    repoItems: repoInfinite.data?.pages.flatMap((page) => page.items) ?? [],
    repoHasMore: Boolean(repoInfinite.hasNextPage),
    repoFetchMore: () => {
      void repoInfinite.fetchNextPage()
    },
    repoFetchingMore: repoInfinite.isFetchingNextPage
  }
}
