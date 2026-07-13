import { useState } from 'react'
import { AlertTriangle, Copy, RotateCcw } from 'lucide-react'
import { sanitizeErrorDetails } from '@/lib/errors'

interface BootstrapFailureProps {
  error: unknown
}

const COPY_RESET_MS = 2_000
const BOOTSTRAP_COPY = {
  en: {
    title: 'The app could not start',
    body: 'Local settings or the interface could not be initialized. Reloading usually recovers; if the problem continues, copy the redacted details below.',
    details: 'Technical details (redacted)',
    copied: 'Copied',
    copy: 'Copy details',
    reload: 'Reload'
  },
  zh: {
    title: '应用启动失败',
    body: '无法读取本地设置或初始化界面。重新加载通常可以恢复；如问题持续，可复制下方已脱敏的错误信息。',
    details: '技术详情（已脱敏）',
    copied: '已复制',
    copy: '复制错误信息',
    reload: '重新加载'
  }
} as const

function isChineseLocale(): boolean {
  const languages = navigator.languages.length > 0 ? navigator.languages : [navigator.language]
  return languages.some((language) => language.toLowerCase().startsWith('zh'))
}

/** Recovery UI intentionally has no i18next dependency: it renders when i18n itself fails. */
export function BootstrapFailure({ error }: BootstrapFailureProps): React.JSX.Element {
  const zh = isChineseLocale()
  const text = zh ? BOOTSTRAP_COPY.zh : BOOTSTRAP_COPY.en
  const [copied, setCopied] = useState(false)
  const details = sanitizeErrorDetails(error)

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(details)
      setCopied(true)
      window.setTimeout(() => setCopied(false), COPY_RESET_MS)
    } catch {
      setCopied(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-8 text-ink">
      <section
        role="alert"
        className="flex w-full max-w-xl flex-col gap-4 rounded-lg border border-border-card bg-elevated p-6"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-error/10">
            <AlertTriangle className="size-4.5 text-error" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-ink-strong">{text.title}</h1>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{text.body}</p>
          </div>
        </div>

        {details ? (
          <details className="rounded-lg bg-panel p-3 text-[12px] text-ink-muted">
            <summary className="cursor-pointer font-medium text-ink">{text.details}</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono">
              {details}
            </pre>
          </details>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          {details ? (
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-linear-to-b from-btn-from to-btn-to px-3 text-[13px] font-medium outline-none hover:shadow-btn-inset focus-visible:outline-2 focus-visible:outline-focus"
            >
              <Copy className="size-3.5" aria-hidden />
              {copied ? text.copied : text.copy}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-transparent bg-cta px-3 text-[13px] font-medium text-cta-ink outline-none hover:border-cta hover:bg-bg hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-focus"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            {text.reload}
          </button>
        </div>
      </section>
    </main>
  )
}
