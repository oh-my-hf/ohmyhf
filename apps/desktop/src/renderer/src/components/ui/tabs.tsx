import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

export const Tabs = TabsPrimitive.Root
export const TabsContent = TabsPrimitive.Content

export function TabsList({ className, ...props }: TabsPrimitive.TabsListProps): React.JSX.Element {
  return (
    <TabsPrimitive.List
      className={cn('flex items-center gap-0.5 border-b px-1', className)}
      {...props}
    />
  )
}

export function TabsTrigger({
  className,
  ...props
}: TabsPrimitive.TabsTriggerProps): React.JSX.Element {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'relative -mb-px rounded-t px-3 py-2 text-[13px] font-medium text-ink-muted transition-colors duration-150',
        'hover:text-ink data-[state=active]:text-ink',
        'data-[state=active]:after:absolute data-[state=active]:after:inset-x-2 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-full data-[state=active]:after:bg-primary',
        className
      )}
      {...props}
    />
  )
}
