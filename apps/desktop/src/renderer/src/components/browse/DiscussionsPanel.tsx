import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, GitPullRequest, MessageSquare } from 'lucide-react'
import type { DiscussionSummary, RepoKind } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { formatRelativeTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToasts } from '@/components/ui/toaster'
import { MarkdownView } from '@/components/browse/MarkdownView'
import { resolveLocale, useAppStore } from '@/stores/app'

const STATUS_VARIANT = {
  open: 'success',
  closed: 'error',
  merged: 'primary',
  draft: 'neutral'
} as const

function Thread({
  kind,
  repoId,
  num,
  onBack
}: {
  kind: RepoKind
  repoId: string
  num: number
  onBack: () => void
}): React.JSX.Element {
  const { t } = useTranslation(['detail', 'common'])
  const auth = useAppStore((s) => s.auth)
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)
  const [reply, setReply] = useState('')
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)

  const thread = useQuery({
    queryKey: ['discussion', kind, repoId, num],
    queryFn: () => invoke('hub:discussionDetail', { kind, repoId, num })
  })

  const send = useMutation({
    mutationFn: () => invoke('hub:discussionComment', { kind, repoId, num, comment: reply }),
    onSuccess: () => {
      setReply('')
      void queryClient.invalidateQueries({ queryKey: ['discussion', kind, repoId, num] })
    },
    onError: (err) => push(err.message, 'error')
  })

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label={t('common:back')}>
          <ArrowLeft className="size-4" aria-hidden />
        </Button>
        <span className="min-w-0 truncate text-[13.5px] font-medium">{thread.data?.title}</span>
        {thread.data && (
          <Badge variant={STATUS_VARIANT[thread.data.status]}>
            {t(`detail:discussions.status.${thread.data.status}`)}
          </Badge>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {thread.isLoading && <Skeleton className="h-24" />}
        <div className="flex flex-col gap-3">
          {thread.data?.events
            .filter((e) => e.content)
            .map((event) => (
              <div key={event.id} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center gap-2 text-[12px] text-ink-muted">
                  <span className="font-medium text-ink">{event.author}</span>
                  <span>{formatRelativeTime(event.createdAt, locale)}</span>
                </div>
                <MarkdownView markdown={event.content ?? ''} kind={kind} repoId={repoId} />
              </div>
            ))}
        </div>
      </div>
      <div className="border-t p-3">
        {auth.status === 'signedIn' ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={t('detail:discussions.replyPlaceholder')}
              rows={3}
              className="w-full resize-y rounded-md border bg-bg p-2.5 text-[13px] placeholder:text-ink-faint focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:outline-none"
            />
            <div className="flex justify-end">
              <Button
                variant="primary"
                size="sm"
                disabled={reply.trim() === ''}
                loading={send.isPending}
                onClick={() => send.mutate()}
              >
                {send.isPending ? t('detail:discussions.sending') : t('detail:discussions.send')}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-center text-[12.5px] text-ink-muted">
            {t('detail:discussions.signInToReply')}
          </p>
        )}
      </div>
    </div>
  )
}

export function DiscussionsPanel({
  kind,
  repoId
}: {
  kind: RepoKind
  repoId: string
}): React.JSX.Element {
  const { t } = useTranslation(['detail', 'common'])
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)
  const [selected, setSelected] = useState<number | null>(null)

  const list = useQuery({
    queryKey: ['discussions', kind, repoId],
    queryFn: () => invoke('hub:discussions', { kind, repoId })
  })

  if (selected !== null) {
    return <Thread kind={kind} repoId={repoId} num={selected} onBack={() => setSelected(null)} />
  }

  return (
    <div className="h-full overflow-y-auto p-1.5">
      {list.isLoading && (
        <div className="flex flex-col gap-1 p-1">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      )}
      {list.data?.items.length === 0 && (
        <div className="p-6 text-center text-[13px] text-ink-muted">
          {t('detail:discussions.empty')}
        </div>
      )}
      {list.data?.items.map((discussion: DiscussionSummary) => (
        <button
          key={discussion.num}
          type="button"
          onClick={() => setSelected(discussion.num)}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-panel"
        >
          {discussion.isPullRequest ? (
            <GitPullRequest className="size-4 shrink-0 text-info" aria-label={t('detail:discussions.pullRequest')} />
          ) : (
            <MessageSquare className="size-4 shrink-0 text-ink-faint" aria-hidden />
          )}
          <span className="min-w-0 flex-1 truncate text-[13px]">{discussion.title}</span>
          <Badge variant={STATUS_VARIANT[discussion.status]}>
            {t(`detail:discussions.status.${discussion.status}`)}
          </Badge>
          <span className="w-20 shrink-0 text-right text-[11.5px] text-ink-faint">
            {formatRelativeTime(discussion.createdAt, locale)}
          </span>
        </button>
      ))}
    </div>
  )
}
