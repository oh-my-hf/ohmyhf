import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface ProgressProps extends Omit<ComponentProps<'div'>, 'children'> {
  /** 0..1 */
  value?: number
  className?: string
  indeterminate?: boolean
}

export function Progress({
  value,
  className,
  indeterminate,
  'aria-valuetext': ariaValueText,
  ...props
}: ProgressProps): React.JSX.Element {
  const { t } = useTranslation('common')
  const pending = indeterminate || value === undefined
  const pct = Math.max(0, Math.min(1, value ?? 0)) * 100
  return (
    <div
      {...props}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pending ? undefined : Math.round(pct)}
      aria-valuetext={
        ariaValueText ?? (pending ? t('common:progress.indeterminate') : `${Math.round(pct)}%`)
      }
      aria-busy={pending}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-panel-2', className)}
    >
      <div
        className={cn(
          'h-full w-full origin-left rounded-full bg-select transition-transform duration-300 ease-out motion-reduce:transition-none',
          pending && 'animate-pulse motion-reduce:animate-none'
        )}
        style={{ transform: pending ? 'scaleX(1)' : `scaleX(${pct / 100})` }}
      />
    </div>
  )
}
