import { Component, useState, type ErrorInfo, type ReactNode } from 'react'
import i18next from 'i18next'
import { AlertTriangle, Copy, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { sanitizeErrorDetails } from '@/lib/errors'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error?: Error
}

function RuntimeFailure({ error }: { error: Error }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const details = sanitizeErrorDetails(error)

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(details)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <main className="flex h-full min-h-96 items-center justify-center bg-bg p-8">
      <section
        role="alert"
        className="flex w-full max-w-xl flex-col gap-4 rounded-lg border border-border-card bg-elevated p-6 text-ink"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-error/10">
            <AlertTriangle className="size-4.5 text-error" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-ink-strong">
              {i18next.t('errors:boundary.title')}
            </h1>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              {i18next.t('errors:boundary.body')}
            </p>
          </div>
        </div>
        {details ? (
          <details className="rounded-lg bg-panel p-3 text-[12px] text-ink-muted">
            <summary className="cursor-pointer font-medium text-ink">
              {i18next.t('errors:details')}
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono">
              {details}
            </pre>
          </details>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          {details ? (
            <Button variant="secondary" size="sm" onClick={() => void copy()}>
              <Copy className="size-3.5" aria-hidden />
              {copied ? i18next.t('common:copied') : i18next.t('errors:copyDetails')}
            </Button>
          ) : null}
          <Button variant="cta" size="sm" onClick={() => window.location.reload()}>
            <RotateCcw className="size-3.5" aria-hidden />
            {i18next.t('errors:reload')}
          </Button>
        </div>
      </section>
    </main>
  )
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {}

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Renderer error boundary caught an exception', error, info.componentStack)
  }

  override render(): ReactNode {
    return this.state.error ? <RuntimeFailure error={this.state.error} /> : this.props.children
  }
}
