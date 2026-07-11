import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

interface ProgressProps extends Omit<ComponentProps<'div'>, 'children'> {
  /** 0..1 */
  value: number
  className?: string
  indeterminate?: boolean
}

export function Progress({
  value,
  className,
  indeterminate,
  ...props
}: ProgressProps): React.JSX.Element {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div
      {...props}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(pct)}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-panel-2', className)}
    >
      <div
        className={cn(
          'h-full w-full origin-left rounded-full bg-select transition-transform duration-300 ease-out',
          indeterminate && 'animate-pulse'
        )}
        style={{ transform: indeterminate ? 'scaleX(1)' : `scaleX(${pct / 100})` }}
      />
    </div>
  )
}
