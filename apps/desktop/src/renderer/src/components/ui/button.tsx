import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// HF button vocabulary: `cta` is the signature near-black pill that inverts on
// hover (reserve it for standalone md/lg actions — Download, sign-in, dialog
// confirms); `secondary` is the gradient workhorse with an inset-shadow press.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 font-medium transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-1 whitespace-nowrap',
  {
    variants: {
      variant: {
        cta: 'rounded-full border border-transparent bg-cta text-cta-ink hover:border-cta hover:bg-bg hover:text-ink-strong active:bg-panel-2',
        secondary:
          'rounded-lg border bg-linear-to-b from-btn-from to-btn-to text-ink hover:shadow-btn-inset active:bg-panel-2 active:shadow-btn-inset',
        ghost: 'rounded-lg text-ink-muted hover:bg-panel-2 hover:text-ink active:bg-panel-2',
        danger:
          'rounded-lg bg-error text-white hover:bg-[color-mix(in_oklch,var(--c-error)_92%,black)] active:bg-[color-mix(in_oklch,var(--c-error)_85%,black)]',
        outline: 'rounded-lg border text-ink hover:bg-panel active:bg-panel-2'
      },
      size: {
        sm: 'h-7 px-2.5 text-[12.5px]',
        md: 'h-8 px-3 text-[13px]',
        lg: 'h-9 px-4 text-smd',
        icon: 'h-8 w-8'
      }
    },
    defaultVariants: { variant: 'secondary', size: 'md' }
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        // Loading reads as busy (70%), not unavailable (50%); twMerge keeps the last.
        className={cn(
          buttonVariants({ variant, size }),
          loading && 'disabled:opacity-70',
          className
        )}
        // Loading always disables, even when callers pass an explicit disabled={false}.
        disabled={(disabled || loading) ?? undefined}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
        {children}
      </Comp>
    )
  }
)
Button.displayName = 'Button'
