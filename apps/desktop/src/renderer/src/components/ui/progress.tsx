import { cn } from '@/lib/utils'

interface ProgressProps {
  /** 0..1 */
  value: number
  className?: string
  indeterminate?: boolean
}

export function Progress({ value, className, indeterminate }: ProgressProps): React.JSX.Element {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(pct)}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-panel-2', className)}
    >
      <div
        className={cn(
          'h-full rounded-full bg-select transition-[width] duration-300 ease-out',
          indeterminate && 'animate-pulse'
        )}
        style={{ width: indeterminate ? '100%' : `${pct}%` }}
      />
    </div>
  )
}
