import { useTranslation } from 'react-i18next'
import { SmilePlus } from 'lucide-react'
import type { PostReaction } from '@oh-my-huggingface/shared'
import { formatCount } from '@/lib/utils'
import { openExternal } from '@/lib/ipc'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Read-only post reactions. Only Hugging Face's first-party web session can
 * react to community posts — no OAuth scope covers POST /api/posts/.../reaction
 * (it 401s even with write-discussions), so the app shows the per-emoji counts
 * and sends the user to the Hub to actually react. `stopPropagation` keeps the
 * Hub link from also triggering a clickable parent card.
 */
export function ReactionBar({
  reactions,
  postUrl,
  locale
}: {
  reactions: PostReaction[]
  postUrl: string
  locale: string
}): React.JSX.Element {
  const { t } = useTranslation(['home', 'common'])
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {reactions.map((r) => (
        <span
          key={r.emoji}
          className="nums inline-flex items-center gap-1 rounded-full border border-border-card bg-panel-2 px-2 py-0.5 text-[12px] text-ink-muted"
        >
          <span aria-hidden>{r.emoji}</span>
          {formatCount(r.count, locale)}
        </span>
      ))}
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
    </div>
  )
}
