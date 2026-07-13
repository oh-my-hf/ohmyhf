import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { normalizeHubEndpoint, type RepoKind, type RepoSummary } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { useAppStore } from '@/stores/app'

export interface UserLikes {
  /** True while the signed-in account's like list is still loading. */
  isPending: boolean
  isLiked: (kind: RepoKind, repoId: string) => boolean
  /** Reconcile the cached list after a successful hub:likeSet. */
  setLiked: (kind: RepoKind, repoId: string, liked: boolean) => void
}

/**
 * The signed-in account's likes on the Hub, cached so hearts can initialize
 * from the real server state instead of always starting un-liked.
 */
export function useUserLikes(): UserLikes {
  const auth = useAppStore((s) => s.auth)
  const username = auth.status === 'signedIn' ? auth.user.name : undefined
  const endpointKey = normalizeHubEndpoint(useAppStore((s) => s.settings.hubEndpoint))
  const likesQueryKey = useMemo(
    () => ['user-likes', username, endpointKey] as const,
    [username, endpointKey]
  )
  const queryClient = useQueryClient()

  const likes = useQuery({
    queryKey: likesQueryKey,
    queryFn: () => invoke('hub:userLikes', { username: username ?? '' }),
    enabled: username !== undefined,
    staleTime: 5 * 60_000
  })

  const data = likes.data
  // Membership set: the drained like list can span many pages, so avoid an
  // O(n) scan per heart on every render.
  const likedKeys = useMemo(
    () => (data ? new Set(data.map((r) => `${r.kind}:${r.id}`)) : undefined),
    [data]
  )
  const isLiked = useCallback(
    (kind: RepoKind, repoId: string): boolean => likedKeys?.has(`${kind}:${repoId}`) ?? false,
    [likedKeys]
  )

  const setLiked = useCallback(
    (kind: RepoKind, repoId: string, liked: boolean): void => {
      queryClient.setQueryData<RepoSummary[]>(likesQueryKey, (prev) => {
        if (prev === undefined) return prev
        const rest = prev.filter((r) => !(r.kind === kind && r.id === repoId))
        if (!liked) return rest
        const slash = repoId.indexOf('/')
        // Stub entry: only kind+id matter for isLiked; a refetch fills the rest.
        const stub: RepoSummary = {
          id: repoId,
          kind,
          author: slash > 0 ? repoId.slice(0, slash) : repoId,
          name: slash > 0 ? repoId.slice(slash + 1) : repoId,
          likes: 0,
          downloads: 0,
          private: false,
          gated: false,
          tags: []
        }
        return [stub, ...rest]
      })
    },
    [queryClient, likesQueryKey]
  )

  return { isPending: username !== undefined && likes.isPending, isLiked, setLiked }
}
