import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PostAttachment } from '@oh-my-huggingface/shared'
import { cn } from '@/lib/utils'
import { Lightbox } from '@/components/ui/lightbox'

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
  const { t } = useTranslation('common')
  const [lightbox, setLightbox] = useState<string>()
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
          <button
            key={`${att.url}:${i}`}
            type="button"
            aria-label={t('common:zoomImage')}
            className={cn(
              'w-full cursor-zoom-in rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              compact ? 'max-h-48' : 'max-h-[32rem]'
            )}
            onClick={(e) => {
              // Feed cards navigate on click; the lightbox takes precedence.
              e.stopPropagation()
              setLightbox(att.url)
            }}
          >
            <img
              src={att.url}
              alt=""
              loading="lazy"
              decoding="async"
              className={cn(
                'h-full w-full rounded-lg border border-border-card bg-panel object-cover',
                !compact && 'object-contain'
              )}
            />
          </button>
        )
      )}
      <Lightbox src={lightbox} onClose={() => setLightbox(undefined)} />
    </div>
  )
}
