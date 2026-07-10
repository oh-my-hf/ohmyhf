import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { Heart } from 'lucide-react'
import type { RepoKind } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { cn, formatCount } from '@/lib/utils'
import { useToasts } from '@/components/ui/toaster'
import { useUserLikes } from '@/hooks/use-user-likes'
import { resolveLocale, useAppStore } from '@/stores/app'

export interface LikeButtonProps {
  kind: RepoKind
  repoId: string
  /** Server-side like count; the local optimistic bump is layered on top. */
  likes: number
}

/**
 * HF-style split pill for liking a repo on the Hub: heart+label segment plus a
 * count segment. The heart initializes from the account's real like list
 * (neutral while that loads), flips optimistically and reverts on error.
 * Hidden entirely when signed out.
 */
export function LikeButton({ kind, repoId, likes }: LikeButtonProps): React.JSX.Element | null {
  const { t } = useTranslation('detail')
  const auth = useAppStore((s) => s.auth)
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)
  const push = useToasts((s) => s.push)
  const userLikes = useUserLikes()
  const serverLiked = userLikes.isPending ? undefined : userLikes.isLiked(kind, repoId)

  // Derived-state reset: forget local like intent when the repo under the
  // button changes. `base` is the server truth adopted before any local toggle
  // (it tells us whether the likes prop already counts this account); `likesAt`
  // snapshots the likes prop at toggle time so the optimistic bump only applies
  // until the server count moves (a refetch then already includes the toggle).
  const key = `${kind}/${repoId}`
  const [state, setState] = useState<{
    key: string
    liked: boolean | null
    base: boolean | null
    likesAt: number
  }>({ key, liked: null, base: null, likesAt: likes })
  if (state.key !== key) setState({ key, liked: null, base: null, likesAt: likes })
  if (state.key === key && state.base === null && state.liked === null && serverLiked !== undefined)
    setState({ ...state, base: serverLiked })

  const liked = state.liked ?? state.base ?? false

  const toggle = useMutation({
    mutationFn: (next: boolean) => invoke('hub:likeSet', { kind, repoId, liked: next }),
    // Snapshot the pre-toggle state (onMutate runs before onClick's setState lands).
    onMutate: () => state,
    onSuccess: (_res, next) => userLikes.setLiked(kind, repoId, next),
    onError: (err, _next, prev) => {
      // Revert the optimistic bump — unless the user moved to another repo.
      if (prev && prev.key === key) setState(prev)
      push(t('detail:like.error', { error: err.message }), 'error')
    }
  })

  if (auth.status !== 'signedIn') return null

  // No local toggle (or the server count moved since it): the prop is truth.
  const adjust =
    state.liked === null || likes !== state.likesAt
      ? 0
      : (state.liked ? 1 : 0) - (state.base === true ? 1 : 0)
  const count = likes + adjust

  const onClick = (): void => {
    if (toggle.isPending) return
    const next = !liked
    setState({ ...state, liked: next, likesAt: likes })
    toggle.mutate(next)
  }

  return (
    <span className="inline-flex h-8 items-stretch overflow-hidden rounded-lg border">
      <button
        type="button"
        aria-pressed={liked}
        aria-label={liked ? t('detail:like.unlike') : t('detail:like.like')}
        onClick={onClick}
        className="flex select-none items-center gap-1.5 bg-linear-to-b from-btn-from to-btn-to px-2 text-[12.5px] font-medium text-ink outline-none transition-colors duration-150 hover:shadow-btn-inset focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
      >
        <Heart className={cn('size-3.5', liked && 'fill-error text-error')} aria-hidden />
        {liked ? t('detail:like.unlike') : t('detail:like.like')}
      </button>
      <span className="flex items-center border-l bg-bg px-2 text-[12px] text-ink-muted nums">
        {formatCount(count, locale)}
      </span>
    </span>
  )
}
