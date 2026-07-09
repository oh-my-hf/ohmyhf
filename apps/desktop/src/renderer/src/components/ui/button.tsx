import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1 whitespace-nowrap',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-ink hover:bg-accent active:bg-accent',
        secondary: 'bg-panel text-ink hover:bg-panel-2 active:bg-panel-2 border',
        ghost: 'text-ink-muted hover:bg-panel hover:text-ink active:bg-panel-2',
        danger: 'bg-error text-primary-ink hover:opacity-90 active:opacity-80',
        outline: 'border text-ink hover:bg-panel active:bg-panel-2'
      },
      size: {
        sm: 'h-7 px-2 text-[12.5px]',
        md: 'h-8 px-3 text-[13px]',
        lg: 'h-9 px-4 text-[14px]',
        icon: 'h-8 w-8'
      }
    },
    defaultVariants: { variant: 'secondary', size: 'md' }
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled ?? loading ?? undefined}
        {...props}
      >
        {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
        {children}
      </Comp>
    )
  }
)
Button.displayName = 'Button'
