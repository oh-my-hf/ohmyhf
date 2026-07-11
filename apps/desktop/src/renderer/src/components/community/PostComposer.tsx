import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PenLine } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { Button } from '@/components/ui/button'
import { useToasts } from '@/components/ui/toaster'
import { MarkdownEditor } from '@/components/browse/MarkdownEditor'
import { useHubSession } from '@/hooks/use-hub-session'

/**
 * Compose a new community post. Posting is cookie-session only AND gated by the
 * Hub's posting beta (/api/posts/can-post), so the composer only appears when a
 * web session is connected and the account may post. Collapsed to a button
 * until the user starts writing.
 */
export function PostComposer(): React.JSX.Element | null {
  const { t } = useTranslation(['home', 'common'])
  const hubSession = useHubSession()
  const push = useToasts((s) => s.push)
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')

  // Only ask the Hub whether posting is allowed once a web session exists —
  // without one the answer is always "no" and the composer stays hidden.
  const canPost = useQuery({
    queryKey: ['post-can-create'],
    queryFn: () => invoke('hub:postCanCreate', undefined),
    enabled: hubSession,
    staleTime: 5 * 60_000
  })

  const create = useMutation({
    mutationFn: (content: string) => invoke('hub:postCreate', { content }),
    onSuccess: () => {
      setDraft('')
      setOpen(false)
      push(t('home:compose.posted'), 'success')
      void queryClient.invalidateQueries({ queryKey: ['home', 'posts'] })
      void queryClient.invalidateQueries({ queryKey: ['posts'] })
    },
    onError: (err) => push(t('home:compose.error', { error: err.message }), 'error')
  })

  if (!hubSession || canPost.data?.canPost !== true) return null

  const send = (): void => {
    const content = draft.trim()
    if (content === '' || create.isPending) return
    create.mutate(content)
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" className="self-start" onClick={() => setOpen(true)}>
        <PenLine className="size-3.5" aria-hidden />
        {t('home:compose.new')}
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-card bg-card-gradient p-3">
      <MarkdownEditor
        value={draft}
        onChange={setDraft}
        kind="model"
        repoId=""
        placeholder={t('home:compose.placeholder')}
        onSubmit={send}
      />
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false)
            setDraft('')
          }}
        >
          {t('common:cancel')}
        </Button>
        <Button
          variant="cta"
          size="sm"
          disabled={draft.trim() === ''}
          loading={create.isPending}
          onClick={send}
        >
          {t('home:compose.submit')}
        </Button>
      </div>
    </div>
  )
}
