import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

export const Tabs = TabsPrimitive.Root
export const TabsContent = TabsPrimitive.Content

export function TabsList({ className, ...props }: TabsPrimitive.TabsListProps): React.JSX.Element {
  return (
    <TabsPrimitive.List
      className={cn('flex items-center gap-1 border-b px-1', className)}
      {...props}
    />
  )
}

// HF `.tab-alternate`: a 2px bottom border that fades in gray on hover and
// commits to ink + semibold when active.
export function TabsTrigger({
  className,
  ...props
}: TabsPrimitive.TabsTriggerProps): React.JSX.Element {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        '-mb-px border-b-2 border-transparent px-3.5 py-2 text-[13px] font-medium text-ink-muted transition-colors duration-150',
        'hover:border-border hover:text-ink',
        'data-[state=active]:border-ink data-[state=active]:font-semibold data-[state=active]:text-ink-strong',
        className
      )}
      {...props}
    />
  )
}
