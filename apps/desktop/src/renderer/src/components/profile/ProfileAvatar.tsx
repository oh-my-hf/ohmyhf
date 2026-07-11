import { cn } from '@/lib/utils'
import { ProSparkleIcon } from '@/components/profile/ProSparkleIcon'

/** The hub sometimes returns avatar paths relative to the site root. */
function absoluteAvatarUrl(url: string): string {
  return url.startsWith('/') ? `https://huggingface.co${url}` : url
}

export type ProfileAvatarFrame = 'profile' | 'compact'

/**
 * Round user/org avatar with an initial-letter fallback.
 * Size and (for the fallback) text size come from the caller via className.
 * When `isPro`, wraps the avatar in the Hub Pro gradient ring + sparkle.
 */
export function ProfileAvatar({
  name,
  url,
  className,
  isPro,
  frame = 'compact'
}: {
  name: string
  url?: string
  className?: string
  isPro?: boolean
  frame?: ProfileAvatarFrame
}): React.JSX.Element {
  const face =
    url !== undefined && url !== '' ? (
      <img
        src={absoluteAvatarUrl(url)}
        alt=""
        className={cn(
          'shrink-0 rounded-full object-cover',
          isPro === true
            ? frame === 'profile'
              ? 'border-[3px] border-white dark:border-gray-950'
              : 'bg-white dark:bg-gray-950'
            : 'border',
          className
        )}
        draggable={false}
      />
    ) : (
      <div
        className={cn(
          'bg-aurora flex shrink-0 items-center justify-center rounded-full font-semibold text-ink-strong uppercase',
          isPro === true
            ? frame === 'profile'
              ? 'border-[3px] border-white dark:border-gray-950'
              : undefined
            : 'ring-1 ring-border-card',
          className
        )}
        aria-hidden
      >
        {name.slice(0, 1)}
      </div>
    )

  if (isPro !== true) {
    return face
  }

  const ringClass =
    frame === 'profile'
      ? 'bg-linear-to-br from-pink-300 via-green-400 to-yellow-300 p-[3px] dark:from-pink-500/70 dark:via-green-500/70 dark:to-yellow-500/70'
      : 'bg-linear-to-br from-pink-500 via-green-500 to-yellow-500 p-px'

  const sparkleClass =
    frame === 'profile'
      ? 'absolute top-[8%] left-0 text-[1.2em] text-white dark:text-gray-950'
      : 'absolute -right-0.5 -bottom-0.5 text-[0.7em] text-white dark:text-gray-950'

  return (
    <div className="relative inline-flex shrink-0">
      <div className={cn('relative rounded-full', ringClass)}>
        {face}
        <ProSparkleIcon className={sparkleClass} />
      </div>
    </div>
  )
}
