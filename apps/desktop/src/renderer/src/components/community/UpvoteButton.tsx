import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { ChevronUp } from 'lucide-react'
import { classifyError, isHubSessionRequired } from '@/lib/errors'
import { openExternal } from '@/lib/ipc'
import { cn, formatCount } from '@/lib/utils'
import { useToasts } from '@/components/ui/toaster'
import { useHubSession } from '@/hooks/use-hub-session'
import { resolveLocale, useAppStore } from '@/stores/app'

export interface UpvoteButtonProps {
  /** Server-side upvote count; the local optimistic delta is layered on top. */
  upvotes: number
  /** Initial "I upvoted this" state when the API reports it (collections do; papers don't). */
  initialUpvoted?: boolean
  /** Toggle the upvote; rejects on failure so the optimistic delta reverts. */
  onToggle: (next: boolean) => Promise<unknown>
  /** Hub URL for the no-session fallback. */
  hubUrl: string
  /** Layout: inline chip (papers list) vs standalone pill. */
  size?: 'sm' | 'md'
}

/**
 * HF-style upvote control for papers and collections. Upvoting is a social
 * write the Hub blocks for access tokens (live-verified 2026-07-11), so it
 * runs through the web session when connected and falls back to opening the
 * Hub otherwise. Optimistic count with revert-on-error.
 */
export function UpvoteButton({
  upvotes,
  initialUpvoted,
  onToggle,
  hubUrl,
  size = 'md'
}: UpvoteButtonProps): React.JSX.Element {
  const { t } = useTranslation(['papers', 'common', 'detail'])
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const openSettings = useAppStore((s) => s.openSettings)
  const locale = resolveLocale(settings, appInfo)
  const push = useToasts((s) => s.push)
  const hubSession = useHubSession()
  // null = follow the server truth (initialUpvoted); a boolean is the local intent.
  const [upvoted, setUpvoted] = useState<boolean | null>(null)
  const active = upvoted ?? initialUpvoted ?? false

  const toggle = useMutation({
    mutationFn: (next: boolean) => Promise.resolve(onToggle(next)),
    onError: (err, next) => {
      setUpvoted(!next)
      if (isHubSessionRequired(err) || classifyError(err).status === 401) {
        push(t('papers:upvote.sessionExpired'), 'error', {
          action: { label: t('detail:like.reconnect'), onClick: () => openSettings('account') }
        })
        return
      }
      push(t('papers:upvote.error', { error: err.message }), 'error')
    }
  })

  const base = active ? (initialUpvoted ? 0 : 1) : initialUpvoted ? -1 : 0
  const count = upvotes + (upvoted === null ? 0 : base)

  const onClick = (): void => {
    if (toggle.isPending) return
    if (!hubSession) {
      push(t('papers:upvote.onHub'), 'info', {
        action: { label: t('common:openOnHub'), onClick: () => openExternal(hubUrl) }
      })
      openExternal(hubUrl)
      return
    }
    const next = !active
    setUpvoted(next)
    toggle.mutate(next)
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? t('papers:upvote.remove') : t('papers:upvote.add')}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        'inline-flex select-none flex-col items-center justify-center rounded-lg border leading-none transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
        size === 'md' ? 'gap-0.5 px-2.5 py-1.5' : 'gap-0.5 px-2 py-1',
        active
          ? 'border-select/40 bg-select/10 text-select'
          : 'bg-linear-to-b from-btn-from to-btn-to text-ink hover:shadow-btn-inset'
      )}
    >
      <ChevronUp className={cn(size === 'md' ? 'size-4' : 'size-3.5')} aria-hidden />
      <span className={cn('nums font-medium', size === 'md' ? 'text-[12px]' : 'text-[11px]')}>
        {formatCount(count, locale)}
      </span>
    </button>
  )
}
