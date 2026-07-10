import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Select = SelectPrimitive.Root
export const SelectValue = SelectPrimitive.Value

export function SelectTrigger({
  className,
  children,
  ...props
}: SelectPrimitive.SelectTriggerProps): React.JSX.Element {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        'inline-flex h-9 items-center justify-between gap-2 rounded-lg border bg-field px-2.5 text-[13px] text-ink',
        'transition-colors duration-150 hover:bg-panel focus-visible:outline-2 focus-visible:outline-focus',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon>
        <ChevronDown className="size-3.5 text-ink-muted" aria-hidden />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export function SelectContent({
  className,
  children,
  ...props
}: SelectPrimitive.SelectContentProps): React.JSX.Element {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={4}
        className={cn(
          'animate-pop z-50 min-w-32 rounded-lg border bg-elevated p-1 shadow-overlay',
          className
        )}
        {...props}
      >
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

export function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.SelectItemProps): React.JSX.Element {
  return (
    <SelectPrimitive.Item
      className={cn(
        'flex cursor-default items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] text-ink outline-none select-none',
        'data-[highlighted]:bg-panel-2 data-[highlighted]:text-ink-strong data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator>
        <Check className="size-3.5 text-select" aria-hidden />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}
