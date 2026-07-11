import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import type { RepoKind } from '@oh-my-huggingface/shared'
import { Button } from '@/components/ui/button'
import { useToasts } from '@/components/ui/toaster'
import { MarkdownEditor } from '@/components/browse/MarkdownEditor'
import { appendQuote } from '@/lib/quote'
import { WRITE_DISCUSSIONS_SCOPE, scopeMissing } from '@/lib/scopes'
import { useAppStore } from '@/stores/app'

export interface CommentComposerProps {
  /** Context passed through to the Markdown preview for link resolution. */
  kind: RepoKind
  repoId: string
  placeholder: string
  /** Performs the actual Hub call; the composer owns the draft lifecycle. */
  submit: (comment: string) => Promise<void>
  /** Runs after a successful submission (toast, refetch, …). */
  onSubmitted?: () => void
  /**
   * Quote-reply request from a comment's "quote" button; bump `nonce` to inject
   * `text` as a blockquote and focus the editor (re-quoting the same text works
   * because the nonce changes).
   */
  quote?: { text: string; nonce: number }
  /** Focus the editor as soon as the composer mounts (inline reply boxes). */
  focusOnMount?: boolean
}

/**
 * Markdown comment box shared by the community surfaces (posts, papers).
 * Clears the draft optimistically on send and restores it if the Hub rejects,
 * so a failed submission never eats the user's text.
 */
export function CommentComposer({
  kind,
  repoId,
  placeholder,
  submit,
  onSubmitted,
  quote,
  focusOnMount
}: CommentComposerProps): React.JSX.Element {
  const { t } = useTranslation(['detail', 'auth'])
  const auth = useAppStore((s) => s.auth)
  const push = useToasts((s) => s.push)
  const [draft, setDraft] = useState('')
  const [focusSignal, setFocusSignal] = useState(0)

  // Bump the signal after mount (the editor ignores its initial prop value).
  useEffect(() => {
    if (focusOnMount) setFocusSignal((n) => n + 1)
  }, [focusOnMount])

  // Consume a quote-reply request: append the blockquote to the draft and
  // focus the editor. Keyed on nonce so re-quoting the same comment re-fires.
  const lastQuoteNonce = useRef(quote?.nonce)
  useEffect(() => {
    if (quote === undefined || quote.nonce === lastQuoteNonce.current) return
    lastQuoteNonce.current = quote.nonce
    setDraft((prev) => appendQuote(prev, quote.text))
    setFocusSignal((n) => n + 1)
  }, [quote])

  const send = useMutation({
    mutationFn: submit,
    onSuccess: () => onSubmitted?.(),
    onError: (err, comment) => {
      // Restore the optimistically cleared draft unless the user typed anew.
      setDraft((current) => (current === '' ? comment : current))
      push(err.message, 'error')
    }
  })

  if (scopeMissing(auth, WRITE_DISCUSSIONS_SCOPE)) {
    return <p className="text-[12.5px] text-ink-faint">{t('auth:missingWriteScope')}</p>
  }

  const sendNow = (): void => {
    const comment = draft.trim()
    if (comment === '' || send.isPending) return
    setDraft('')
    send.mutate(comment)
  }

  return (
    <div className="flex flex-col gap-2">
      <MarkdownEditor
        value={draft}
        onChange={setDraft}
        kind={kind}
        repoId={repoId}
        placeholder={placeholder}
        onSubmit={sendNow}
        focusSignal={focusSignal}
      />
      <div className="flex justify-end">
        <Button
          variant="cta"
          size="sm"
          disabled={draft.trim() === ''}
          loading={send.isPending}
          onClick={sendNow}
        >
          {send.isPending ? t('detail:discussions.sending') : t('detail:discussions.send')}
        </Button>
      </div>
    </div>
  )
}
