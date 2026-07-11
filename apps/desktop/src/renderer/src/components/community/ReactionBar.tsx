import { useTranslation } from 'react-i18next'
import { SmilePlus } from 'lucide-react'
import type { PostReaction } from '@oh-my-huggingface/shared'
import { HUB_REACTION_EMOJIS } from '@oh-my-huggingface/shared'
import { cn, formatCount } from '@/lib/utils'
import { openExternal } from '@/lib/ipc'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export interface ReactionBarProps {
  reactions: PostReaction[]
  /** Hub URL used by the no-session fallback ("react on the Hub"). */
  postUrl: string
  locale: string
  /** Signed-in username, to highlight the caller's own reactions. */
  currentUser?: string
  /**
   * Toggle handler; providing it makes the bar interactive (requires a Hub
   * web session — POST .../reaction 401s for every token kind, live-verified
   * 2026-07-11). Without it the bar is read-only counts + a Hub link.
   */
  onToggle?: (emoji: string, active: boolean) => void
  /** Disables the chips while a toggle is in flight. */
  pending?: boolean
}

/**
 * Per-emoji reactions for posts and discussion comments. Interactive when
 * `onToggle` is given (chips toggle, the picker adds new emoji); read-only
 * with an open-on-Hub affordance otherwise. `stopPropagation` keeps clicks
 * from also triggering a clickable parent card.
 */
export function ReactionBar({
  reactions,
  postUrl,
  locale,
  currentUser,
  onToggle,
  pending
}: ReactionBarProps): React.JSX.Element {
  const { t } = useTranslation(['home', 'common'])
  const mine = (r: PostReaction): boolean =>
    currentUser !== undefined && r.users.includes(currentUser)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {reactions.map((r) =>
        onToggle ? (
          <button
            key={r.emoji}
            type="button"
            aria-pressed={mine(r)}
            disabled={pending}
            aria-label={t('home:reactions.toggle', { emoji: r.emoji })}
            onClick={(e) => {
              e.stopPropagation()
              onToggle(r.emoji, !mine(r))
            }}
            className={cn(
              'nums inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-60',
              mine(r)
                ? 'border-select/40 bg-select/10 text-select'
                : 'border-border-card bg-panel-2 text-ink-muted hover:border-border hover:text-ink'
            )}
          >
            <span aria-hidden>{r.emoji}</span>
            {formatCount(r.count, locale)}
          </button>
        ) : (
          <span
            key={r.emoji}
            className="nums inline-flex items-center gap-1 rounded-full border border-border-card bg-panel-2 px-2 py-0.5 text-[12px] text-ink-muted"
          >
            <span aria-hidden>{r.emoji}</span>
            {formatCount(r.count, locale)}
          </span>
        )
      )}
      {onToggle ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              disabled={pending}
              aria-label={t('home:reactions.react')}
              onClick={(e) => e.stopPropagation()}
            >
              <SmilePlus className="size-3.5" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="grid grid-cols-4 gap-0.5 p-1.5">
            {HUB_REACTION_EMOJIS.map((emoji) => {
              const existing = reactions.find((r) => r.emoji === emoji)
              const active = existing !== undefined && mine(existing)
              return (
                <button
                  key={emoji}
                  type="button"
                  aria-pressed={active}
                  aria-label={t('home:reactions.toggle', { emoji })}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggle(emoji, !active)
                  }}
                  className={cn(
                    'flex size-8 items-center justify-center rounded text-[16px] transition-colors duration-100 outline-none hover:bg-panel focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
                    active && 'bg-select/10 ring-1 ring-select/40'
                  )}
                >
                  {emoji}
                </button>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={t('home:reactions.onHub')}
              onClick={(e) => {
                e.stopPropagation()
                openExternal(postUrl)
              }}
            >
              <SmilePlus className="size-3.5" aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('home:reactions.onHub')}</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
