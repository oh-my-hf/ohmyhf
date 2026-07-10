import { useQueries } from '@tanstack/react-query'
import type { RepoKind, RepoSummary, UserSearchResult } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { useDebounced } from '@/hooks/use-debounced'

const STALE_TIME = 60_000

export interface GlobalSearchResults {
  models: RepoSummary[]
  datasets: RepoSummary[]
  spaces: RepoSummary[]
  users: UserSearchResult[]
  isLoading: boolean
}

/** Debounced hub-wide search across repos and users for the command palette. */
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

  const [models, datasets, spaces, users] = useQueries({
    queries: [
      repoQuery('model'),
      repoQuery('dataset'),
      repoQuery('space'),
      {
        queryKey: ['globalSearch', 'user', q],
        queryFn: () => invoke('hub:searchUsers', { query: q }),
        staleTime: STALE_TIME,
        enabled
      }
    ]
  })

  return {
    models: models.data?.items ?? [],
    datasets: datasets.data?.items ?? [],
    spaces: spaces.data?.items ?? [],
    users: users.data ?? [],
    // The debounce gap counts as loading so the palette never flashes "empty".
    isLoading:
      trimmed !== '' &&
      (trimmed !== q || [models, datasets, spaces, users].some((r) => r.isLoading))
  }
}
