import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { Heart } from 'lucide-react'
import type { RepoKind } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { cn, formatCount } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useToasts } from '@/components/ui/toaster'
import { resolveLocale, useAppStore } from '@/stores/app'

export interface LikeButtonProps {
  kind: RepoKind
  repoId: string
  /** Server-side like count; the local optimistic bump is layered on top. */
  likes: number
}

/**
 * Heart toggle for liking a repo on the Hub. The Hub doesn't tell us whether
 * this account already liked the repo, so the toggle starts unliked and tracks
 * local intent only; it bumps the count optimistically and reverts on error.
 * Hidden entirely when signed out.
 */
export function LikeButton({ kind, repoId, likes }: LikeButtonProps): React.JSX.Element | null {
  const { t } = useTranslation('detail')
  const auth = useAppStore((s) => s.auth)
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)
  const push = useToasts((s) => s.push)

  // Derived-state reset: forget the local like when the repo under the button changes.
  // `base` remembers the likes prop at toggle time so the optimistic +1 only applies
  // until the server count moves (a refetch then already includes this like).
  const key = `${kind}/${repoId}`
  const [state, setState] = useState({ key, liked: false, base: likes })
  if (state.key !== key) setState({ key, liked: false, base: likes })
  const liked = state.key === key && state.liked

  const toggle = useMutation({
    mutationFn: (next: boolean) => invoke('hub:likeSet', { kind, repoId, liked: next }),
    // Snapshot the pre-toggle state (onMutate runs before onClick's setState lands).
    onMutate: () => state,
    onError: (err, _next, prev) => {
      // Revert the optimistic bump.
      if (prev) setState(prev)
      push(t('detail:like.error', { error: err.message }), 'error')
    }
  })

  if (auth.status !== 'signedIn') return null

  const count = liked && likes === state.base ? likes + 1 : likes
  const onClick = (): void => {
    if (toggle.isPending) return
    const next = !liked
    setState({ key, liked: next, base: likes })
    toggle.mutate(next)
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={liked}
      aria-label={liked ? t('detail:like.unlike') : t('detail:like.like')}
      onClick={onClick}
    >
      <Heart className={cn('size-4', liked && 'fill-error text-error')} aria-hidden />
      <span className="nums text-[12px]">{formatCount(count, locale)}</span>
    </Button>
  )
}
