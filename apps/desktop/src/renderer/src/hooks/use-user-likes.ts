import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { RepoKind, RepoSummary } from '@oh-my-huggingface/shared'
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
  const queryClient = useQueryClient()

  const likes = useQuery({
    queryKey: ['user-likes', username],
    queryFn: () => invoke('hub:userLikes', { username: username ?? '' }),
    enabled: username !== undefined,
    staleTime: 5 * 60_000
  })

  const data = likes.data
  const isLiked = useCallback(
    (kind: RepoKind, repoId: string): boolean =>
      data?.some((r) => r.kind === kind && r.id === repoId) ?? false,
    [data]
  )

  const setLiked = useCallback(
    (kind: RepoKind, repoId: string, liked: boolean): void => {
      queryClient.setQueryData<RepoSummary[]>(['user-likes', username], (prev) => {
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
    [queryClient, username]
  )

  return { isPending: username !== undefined && likes.isPending, isLiked, setLiked }
}
