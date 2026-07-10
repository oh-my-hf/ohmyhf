import { cn } from '@/lib/utils'

/** The hub sometimes returns avatar paths relative to the site root. */
function absoluteAvatarUrl(url: string): string {
  return url.startsWith('/') ? `https://huggingface.co${url}` : url
}

/**
 * Round user/org avatar with an initial-letter fallback.
 * Size and (for the fallback) text size come from the caller via className.
 */
export function ProfileAvatar({
  name,
  url,
  className
}: {
  name: string
  url?: string
  className?: string
}): React.JSX.Element {
  if (url !== undefined && url !== '') {
    return (
      <img
        src={absoluteAvatarUrl(url)}
        alt=""
        className={cn('shrink-0 rounded-full border object-cover', className)}
        draggable={false}
      />
    )
  }
  return (
    <div
      className={cn(
        'bg-aurora flex shrink-0 items-center justify-center rounded-full font-semibold text-ink-strong uppercase ring-1 ring-border-card',
        className
      )}
      aria-hidden
    >
      {name.slice(0, 1)}
    </div>
  )
}
