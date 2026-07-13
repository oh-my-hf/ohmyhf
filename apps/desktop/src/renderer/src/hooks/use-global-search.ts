import { useQueries } from '@tanstack/react-query'
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
  const endpointKey = normalizeHubEndpoint(useAppStore((s) => s.settings.hubEndpoint))

  const repoQuery = (kind: RepoKind) => ({
    queryKey: ['globalSearch', kind, q, endpointKey],
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
        queryKey: ['globalSearch', 'user', q, endpointKey],
        queryFn: () => invoke('hub:searchUsers', { query: q }),
        staleTime: STALE_TIME,
        enabled
      },
      {
        queryKey: ['globalSearch', 'org', q, endpointKey],
        queryFn: () => invoke('hub:searchOrgs', { query: q }),
        staleTime: STALE_TIME,
        enabled
      },
      {
        queryKey: ['globalSearch', 'paper', q, endpointKey],
        queryFn: () => invoke('hub:searchPapers', { query: q }),
        staleTime: STALE_TIME,
        enabled
      },
      {
        queryKey: ['globalSearch', 'collection', q, endpointKey],
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
    isLoading: trimmed !== '' && (trimmed !== q || asyncQueries.some((r) => r.isLoading))
  }
}
