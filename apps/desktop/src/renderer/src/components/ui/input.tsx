import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-lg border bg-field px-2.5 text-[13px] text-ink shadow-field-inset transition-colors duration-150',
        'placeholder:text-ink-faint',
        'focus-visible:border-focus/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/25',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'
