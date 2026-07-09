import { create } from 'zustand'
import { CheckCircle2, CircleAlert, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastVariant = 'info' | 'success' | 'error'

interface Toast {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastState {
  toasts: Toast[]
  push: (message: string, variant?: ToastVariant) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message, variant = 'info') => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

const ICONS = {
  info: Info,
  success: CheckCircle2,
  error: CircleAlert
} as const

export function Toaster(): React.JSX.Element {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.variant]
        return (
          <button
            key={toast.id}
            type="button"
            onClick={() => dismiss(toast.id)}
            className={cn(
              'pointer-events-auto flex items-start gap-2 rounded-lg border bg-bg p-3 text-left text-[13px] text-ink shadow-overlay',
              'animate-toast-in transition-opacity duration-200'
            )}
          >
            <Icon
              className={cn(
                'mt-px size-4 shrink-0',
                toast.variant === 'success' && 'text-success',
                toast.variant === 'error' && 'text-error',
                toast.variant === 'info' && 'text-info'
              )}
              aria-hidden
            />
            <span className="min-w-0 break-words">{toast.message}</span>
          </button>
        )
      })}
    </div>
  )
}
