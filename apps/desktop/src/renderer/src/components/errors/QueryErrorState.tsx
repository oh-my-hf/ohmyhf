import { useTranslation } from 'react-i18next'
import { CircleAlert, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { describeError } from '@/lib/errors'
import { Button } from '@/components/ui/button'

interface QueryErrorStateProps {
  error: unknown
  onRetry?: () => void
  title?: string
  compact?: boolean
  className?: string
}

/** Plain-language remote-data failure with an explicit recovery action. */
export function QueryErrorState({
  error,
  onRetry,
  title,
  compact = false,
  className
}: QueryErrorStateProps): React.JSX.Element {
  const { t } = useTranslation(['errors', 'common'])

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 text-center',
        compact ? 'py-6' : 'min-h-48 py-12',
        className
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-error/10 ring-1 ring-error/15">
        <CircleAlert className="size-[18px] text-error" aria-hidden />
      </div>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-[13.5px] font-medium text-ink-strong">
          {title ?? t('errors:query.title')}
        </p>
        <p className="text-[12.5px] leading-relaxed text-ink-muted">{describeError(t, error)}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCcw className="size-3.5" aria-hidden />
          {t('common:retry')}
        </Button>
      ) : null}
    </div>
  )
}
