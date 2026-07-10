import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: TooltipPrimitive.TooltipContentProps): React.JSX.Element {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          // Inverted bubble (cta: near-black in light, near-white in dark) so the
          // floating tip carries the same strong contrast in both themes.
          'animate-pop z-50 rounded-md bg-cta px-2 py-1 text-[12px] text-cta-ink shadow-sm',
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}
