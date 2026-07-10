import type { HTMLAttributes } from 'react'
import type { LucideIcon } from 'lucide-react'
import { TAG_HUE_VAR, type TagHue } from '@/lib/tag-colors'
import { cn } from '@/lib/utils'

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  /** Category hue for the leading icon tile (HF `.tag-ico` pattern). */
  hue?: TagHue
  icon?: LucideIcon
}

/**
 * HF-style tag: 28px pill-adjacent chip with a faint vertical gradient and,
 * optionally, a 32×28 leading icon tile tinted by category hue.
 */
export function Tag({ hue, icon: Icon, className, children, ...props }: TagProps): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex h-7 max-w-full items-center overflow-hidden rounded-lg border border-border/70',
        'bg-linear-to-b from-btn-from to-btn-to text-[12px] leading-none whitespace-nowrap text-ink',
        className
      )}
      {...props}
    >
      {Icon && hue ? (
        <span
          className="flex h-full w-8 shrink-0 items-center justify-center border-r border-border/60"
          style={{
            backgroundImage: `linear-gradient(to bottom, color-mix(in oklch, ${TAG_HUE_VAR[hue]} 12%, var(--c-bg)), var(--c-bg))`
          }}
          aria-hidden
        >
          <Icon className="size-3.5" style={{ color: TAG_HUE_VAR[hue] }} />
        </span>
      ) : null}
      <span className="truncate px-2">{children}</span>
    </span>
  )
}
