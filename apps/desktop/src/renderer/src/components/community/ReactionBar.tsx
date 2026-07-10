import { useTranslation } from 'react-i18next'
import { SmilePlus } from 'lucide-react'
import type { PostReaction } from '@oh-my-huggingface/shared'
import { cn, formatCount } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Hugging Face's post-reaction palette (matches the web picker). */
const REACTION_EMOJIS = ['👍', '❤️', '🤗', '🔥', '🚀', '👀', '😎', '🧠'] as const

/**
 * Post reaction pills plus an add-reaction picker. Reacting is a toggle: clicking
 * a pill the caller already owns removes it. Read-only when the caller can't react
 * (signed out, or missing the write-discussions scope) — the pills still render so
 * the counts stay visible. `stopPropagation` keeps clicks off a clickable parent card.
 */
export function ReactionBar({
  reactions,
  me,
  canReact,
  pending = false,
  locale,
  onReact
}: {
  reactions: PostReaction[]
  me?: string
  canReact: boolean
  pending?: boolean
  locale: string
  onReact: (emoji: string) => void
}): React.JSX.Element | null {
  const { t } = useTranslation(['home', 'common'])
  const mine = (r: PostReaction): boolean => me !== undefined && r.users.includes(me)
  const interactive = canReact && !pending

  if (reactions.length === 0 && !canReact) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          disabled={!interactive}
          aria-pressed={mine(r)}
          onClick={(e) => {
            e.stopPropagation()
            onReact(r.emoji)
          }}
          className={cn(
            'nums inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] transition-colors duration-150',
            mine(r)
              ? 'border-select bg-select/10 text-select'
              : 'border-border-card bg-panel-2 text-ink-muted',
            interactive ? 'cursor-pointer hover:border-border' : 'cursor-default'
          )}
        >
          <span aria-hidden>{r.emoji}</span>
          {formatCount(r.count, locale)}
        </button>
      ))}

      {canReact ? (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  disabled={pending}
                  aria-label={t('home:reactions.add')}
                  onClick={(e) => e.stopPropagation()}
                >
                  <SmilePlus className="size-3.5" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{t('home:reactions.add')}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent
            align="start"
            className="min-w-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex max-w-[11rem] flex-wrap gap-0.5">
              {REACTION_EMOJIS.map((emoji) => (
                <DropdownMenuItem
                  key={emoji}
                  className="justify-center px-2 py-1 text-[16px]"
                  onSelect={() => onReact(emoji)}
                >
                  <span aria-hidden>{emoji}</span>
                </DropdownMenuItem>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}
