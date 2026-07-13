import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** Key-hint chip for shortcut hints (palette footer, tooltips, help overlay). */
export function Kbd({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement>): React.JSX.Element {
  return (
    <kbd
      className={cn(
        'inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] border bg-panel-2 px-1 font-sans text-[10px] leading-none text-ink-faint',
        className
      )}
      {...props}
    >
      {children}
    </kbd>
  )
}
