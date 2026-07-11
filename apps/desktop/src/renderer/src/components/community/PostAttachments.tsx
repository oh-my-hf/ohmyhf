import type { PostAttachment } from '@oh-my-huggingface/shared'
import { cn } from '@/lib/utils'

/**
 * Renders a post's media attachments (images/videos). The Hub stores these
 * separately from the markdown body, so they are laid out here beneath the
 * text. In a compact context (feed cards) the grid is tighter and videos are
 * muted, non-controllable previews; the full view gets controls.
 */
export function PostAttachments({
  attachments,
  compact = false,
  className
}: {
  attachments: PostAttachment[]
  compact?: boolean
  className?: string
}): React.JSX.Element | null {
  if (attachments.length === 0) return null

  return (
    <div
      className={cn(
        'grid gap-2',
        attachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1',
        className
      )}
    >
      {attachments.map((att, i) =>
        att.type === 'video' ? (
          <video
            key={`${att.url}:${i}`}
            src={att.url}
            controls={!compact}
            muted={compact}
            playsInline
            preload="metadata"
            className={cn(
              'w-full rounded-lg border border-border-card bg-panel object-cover',
              compact ? 'max-h-48' : 'max-h-[32rem]'
            )}
          />
        ) : (
          <img
            key={`${att.url}:${i}`}
            src={att.url}
            alt=""
            loading="lazy"
            decoding="async"
            className={cn(
              'w-full rounded-lg border border-border-card bg-panel object-cover',
              compact ? 'max-h-48' : 'max-h-[32rem] object-contain'
            )}
          />
        )
      )}
    </div>
  )
}
