import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  body?: string
  /** Optional call to action rendered under the copy. */
  action?: ReactNode
  className?: string
}

/** Shared empty state: quiet icon coin, one-line teach, optional action. */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className
}: EmptyStateProps): React.JSX.Element {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      <div className="flex size-10 items-center justify-center rounded-full bg-panel ring-1 ring-border">
        <Icon className="size-[18px] text-ink-faint" aria-hidden />
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-[13.5px] font-medium text-ink">{title}</p>
        {body ? (
          <p className="max-w-sm text-[12.5px] leading-relaxed text-ink-muted">{body}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
