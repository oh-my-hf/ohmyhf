import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full rounded-lg border bg-field px-2.5 py-2 text-[13px] text-ink shadow-field-inset transition-colors duration-150',
      'placeholder:text-ink-faint',
      'focus-visible:border-focus/50 focus-visible:ring-2 focus-visible:ring-focus/25 focus-visible:outline-none',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'
