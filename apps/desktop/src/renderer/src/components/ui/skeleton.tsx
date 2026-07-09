import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={cn('animate-skeleton rounded-md bg-panel-2', className)} {...props} />
}
