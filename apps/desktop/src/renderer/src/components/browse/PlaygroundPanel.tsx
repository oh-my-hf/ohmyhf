import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { Play, Square } from 'lucide-react'
import type { InferenceStreamEvent } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { useIpcEvent } from '@/hooks/use-ipc-event'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAppStore } from '@/stores/app'

function isAuthError(message: string): boolean {
  return /\b401\b|\b403\b|unauthorized|forbidden|auth/i.test(message)
}

export function PlaygroundPanel({ repoId }: { repoId: string }): React.JSX.Element {
  const { t } = useTranslation('detail')
  const auth = useAppStore((s) => s.auth)
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  /** Id of the in-flight stream; events for other ids (stale runs) are ignored. */
  const streamId = useRef<string | null>(null)
  const outputRef = useRef<HTMLDivElement>(null)

  // One-shot fallback for backends without streaming support.
  const fallback = useMutation({
    mutationFn: () => invoke('inference:run', { request: { model: repoId, input } }),
    onSuccess: (res) => {
      if (res.ok) setOutput(res.output ?? '')
      else setError(res.error ?? t('common:error.generic'))
    },
    onError: (err) => setError(err.message)
  })
  const runFallback = fallback.mutate

  const onStreamEvent = useCallback(
    (evt: InferenceStreamEvent): void => {
      if (evt.id !== streamId.current) return
      if (evt.delta) setOutput((prev) => prev + evt.delta)
      if (evt.error) {
        streamId.current = null
        setStreaming(false)
        if (/not implemented/i.test(evt.error)) runFallback()
        else setError(evt.error)
      } else if (evt.done) {
        streamId.current = null
        setStreaming(false)
      }
    },
    [runFallback]
  )
  useIpcEvent('evt:inference', onStreamEvent)

  // Pin the transcript to the latest token while text streams in.
  useEffect(() => {
    const el = outputRef.current
    if (el && streaming) el.scrollTop = el.scrollHeight
  }, [output, streaming])

  // Abandoning the tab mid-stream cancels the request in main.
  useEffect(
    () => () => {
      if (streamId.current) void invoke('inference:cancel', { id: streamId.current })
    },
    []
  )

  const start = async (): Promise<void> => {
    const id = crypto.randomUUID()
    streamId.current = id
    setOutput('')
    setError(null)
    setStreaming(true)
    try {
      await invoke('inference:stream', { id, request: { model: repoId, input } })
    } catch (err) {
      if (streamId.current !== id) return
      streamId.current = null
      setStreaming(false)
      const message = err instanceof Error ? err.message : String(err)
      if (/not implemented/i.test(message)) runFallback()
      else setError(message)
    }
  }

  const stop = (): void => {
    const id = streamId.current
    if (id) void invoke('inference:cancel', { id })
    streamId.current = null
    setStreaming(false)
  }

  if (auth.status !== 'signedIn') {
    return (
      <div className="p-6 text-center text-[13px] text-ink-muted">{t('playground.signIn')}</div>
    )
  }

  const busy = streaming || fallback.isPending

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex flex-col gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !busy && input.trim() !== '') {
              e.preventDefault()
              void start()
            }
          }}
          placeholder={t('playground.placeholder')}
          rows={4}
          className="resize-y"
        />
        <div className="flex justify-end">
          {streaming ? (
            <Button variant="secondary" size="sm" onClick={stop}>
              <Square className="size-3.5" aria-hidden />
              {t('playground.stop')}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={input.trim() === ''}
              loading={fallback.isPending}
              onClick={() => void start()}
            >
              <Play className="size-3.5" aria-hidden />
              {fallback.isPending ? t('playground.running') : t('playground.run')}
            </Button>
          )}
        </div>
      </div>
      <div
        ref={outputRef}
        className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-panel p-3"
      >
        {!busy && output === '' && error === null && (
          <p className="text-[13px] text-ink-faint">{t('playground.empty')}</p>
        )}
        {busy && output === '' && (
          <p className="text-[13px] text-ink-faint">{t('playground.running')}</p>
        )}
        {output !== '' && <p className="text-[13px] whitespace-pre-wrap">{output}</p>}
        {error !== null &&
          (isAuthError(error) ? (
            <p className="text-[13px] text-ink-muted">{t('playground.signIn')}</p>
          ) : (
            <p className="text-[13px] text-error">{t('playground.unavailable', { error })}</p>
          ))}
      </div>
    </div>
  )
}
