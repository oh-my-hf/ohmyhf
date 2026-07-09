import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/utils'

export const DropdownMenu = DropdownPrimitive.Root
export const DropdownMenuTrigger = DropdownPrimitive.Trigger
export const DropdownMenuSeparator = (
  props: DropdownPrimitive.DropdownMenuSeparatorProps
): React.JSX.Element => <DropdownPrimitive.Separator className="my-1 h-px bg-border" {...props} />

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: DropdownPrimitive.DropdownMenuContentProps): React.JSX.Element {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'animate-pop z-50 min-w-40 rounded-md border bg-bg p-1 shadow-overlay',
          className
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  )
}

export function DropdownMenuItem({
  className,
  ...props
}: DropdownPrimitive.DropdownMenuItemProps): React.JSX.Element {
  return (
    <DropdownPrimitive.Item
      className={cn(
        'flex cursor-default items-center gap-2 rounded px-2 py-1.5 text-[13px] text-ink outline-none select-none',
        'data-[highlighted]:bg-panel data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      {...props}
    />
  )
}
