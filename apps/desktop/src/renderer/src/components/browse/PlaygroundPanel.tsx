import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/app'

/**
 * Phase E stub, wired end-to-end: real IPC → @huggingface/inference chatCompletion.
 * TODO(phase-e): token streaming, task-specific UIs (text-to-image, ASR…).
 */
export function PlaygroundPanel({ repoId }: { repoId: string }): React.JSX.Element {
  const { t } = useTranslation('detail')
  const auth = useAppStore((s) => s.auth)
  const [input, setInput] = useState('')

  const run = useMutation({
    mutationFn: () => invoke('inference:run', { request: { model: repoId, input } })
  })

  if (auth.status !== 'signedIn') {
    return (
      <div className="p-6 text-center text-[13px] text-ink-muted">{t('playground.signIn')}</div>
    )
  }

  const result = run.data

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex flex-col gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('playground.placeholder')}
          rows={4}
          className="w-full resize-y rounded-md border bg-bg p-2.5 text-[13px] placeholder:text-ink-faint focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:outline-none"
        />
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            disabled={input.trim() === ''}
            loading={run.isPending}
            onClick={() => run.mutate()}
          >
            <Play className="size-3.5" aria-hidden />
            {run.isPending ? t('playground.running') : t('playground.run')}
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-panel p-3">
        {!result && !run.isPending && (
          <p className="text-[13px] text-ink-faint">{t('playground.empty')}</p>
        )}
        {result?.ok && <p className="text-[13px] whitespace-pre-wrap">{result.output}</p>}
        {result && !result.ok && (
          <p className="text-[13px] text-error">
            {t('playground.unavailable', { error: result.error ?? '' })}
          </p>
        )}
      </div>
    </div>
  )
}
