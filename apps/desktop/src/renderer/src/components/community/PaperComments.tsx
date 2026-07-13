import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Reply } from 'lucide-react'
import { hubPaperUrl, normalizeHubEndpoint, type PostComment } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { formatRelativeTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToasts } from '@/components/ui/toaster'
import { QueryErrorState } from '@/components/errors/QueryErrorState'
import { CommentComposer } from '@/components/community/CommentComposer'
import { MarkdownView } from '@/components/browse/MarkdownView'
import { ReactionBar } from '@/components/community/ReactionBar'
import { ProfileAvatar } from '@/components/profile/ProfileAvatar'
import { UserLink } from '@/components/profile/UserLink'
import { useHubSession } from '@/hooks/use-hub-session'
import { resolveLocale, useAppStore } from '@/stores/app'

/** Shared per-thread context handed to each CommentCard. */
interface ThreadContext {
  paperId: string
  paperUrl: string
  locale: string
  currentUser?: string
  /** Reactions need a Hub web session (undocumented but live-verified 401-not-404, 2026-07-13). */
  hubSession: boolean
  onReact: (commentId: string, emoji: string, active: boolean) => void
  reactPending: boolean
  canReply: boolean
  replyingTo?: string
  setReplyingTo: (id?: string) => void
  onReplied: () => void
}

/**
 * The existing comment thread on a Daily Papers entry, visible to everyone
 * (only the composers and reaction toggle are sign-in / Hub-session gated).
 */
export function PaperComments({ paperId }: { paperId: string }): React.JSX.Element {
  const { t } = useTranslation(['papers', 'profile'])
  const auth = useAppStore((s) => s.auth)
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)
  const endpointKey = normalizeHubEndpoint(settings.hubEndpoint)
  const hubSession = useHubSession()
  const currentUser = auth.status === 'signedIn' ? auth.user.name : undefined
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)
  const [replyingTo, setReplyingTo] = useState<string>()

  const queryKey = ['paper-comments', paperId, endpointKey]
  const comments = useQuery({
    queryKey,
    queryFn: () => invoke('hub:paperComments', { paperId }),
    enabled: paperId !== ''
  })

  const react = useMutation({
    mutationFn: (v: { commentId: string; emoji: string; active: boolean }) =>
      invoke('hub:paperCommentReactionSet', {
        paperId,
        commentId: v.commentId,
        reaction: v.emoji,
        active: v.active
      }),
    onError: (err) => push(t('profile:reactions.error', { error: err.message }), 'error'),
    onSettled: () => void queryClient.invalidateQueries({ queryKey })
  })

  if (comments.isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    )
  }

  if (comments.isError) {
    return (
      <QueryErrorState
        error={comments.error}
        onRetry={() => void comments.refetch()}
        title={t('papers:comments.loadError')}
        compact
      />
    )
  }

  const items = comments.data
  const ctx: ThreadContext = {
    paperId,
    paperUrl: hubPaperUrl(paperId, settings.hubEndpoint),
    locale,
    currentUser,
    hubSession,
    onReact: (commentId, emoji, active) => react.mutate({ commentId, emoji, active }),
    reactPending: react.isPending,
    canReply: auth.status === 'signedIn',
    replyingTo,
    setReplyingTo,
    onReplied: () => {
      setReplyingTo(undefined)
      push(t('papers:comment.posted'), 'success')
      void queryClient.invalidateQueries({ queryKey })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? (
        <p className="text-[12.5px] text-ink-faint">{t('papers:comments.empty')}</p>
      ) : (
        items.map((comment) => <CommentCard key={comment.id} comment={comment} depth={0} ctx={ctx} />)
      )}
      {auth.status === 'signedIn' && (
        <CommentComposer
          key={paperId}
          kind="model"
          repoId={paperId}
          placeholder={t('papers:comment.placeholder')}
          submit={(comment) => invoke('hub:paperComment', { paperId, comment })}
          onSubmitted={ctx.onReplied}
        />
      )}
    </div>
  )
}

/** One comment card plus its nested replies (the Hub threads one level deep). */
function CommentCard({
  comment,
  depth,
  ctx
}: {
  comment: PostComment
  depth: number
  ctx: ThreadContext
}): React.JSX.Element {
  const { t } = useTranslation(['profile'])
  const replies = comment.replies ?? []
  // Only top-level comments accept replies, so the thread stays one level deep.
  const canReply = ctx.canReply && depth === 0

  return (
    <div className="rounded-lg border border-border-card bg-card-gradient p-3">
      <div className="mb-2 flex items-center gap-2 text-[12px] text-ink-muted">
        <ProfileAvatar
          name={comment.author}
          url={comment.authorAvatarUrl}
          className="size-5 text-[10px]"
          isPro={comment.authorIsPro === true}
          frame="compact"
        />
        <UserLink username={comment.author} className="font-medium text-ink-strong" />
        <span className="text-ink-faint">{formatRelativeTime(comment.createdAt, ctx.locale)}</span>
      </div>

      {comment.hidden ? (
        <p className="text-[12.5px] text-ink-faint italic">
          {comment.hiddenReason
            ? t('profile:post.hide.hiddenWithReason', { reason: comment.hiddenReason })
            : t('profile:post.hide.hidden')}
        </p>
      ) : (
        <>
          <MarkdownView markdown={comment.content} kind="model" repoId={ctx.paperId} />
          {(comment.reactions.length > 0 || ctx.hubSession || canReply) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {(comment.reactions.length > 0 || ctx.hubSession) && (
                <ReactionBar
                  reactions={comment.reactions}
                  postUrl={ctx.paperUrl}
                  locale={ctx.locale}
                  currentUser={ctx.currentUser}
                  onToggle={
                    ctx.hubSession
                      ? (emoji, active) => ctx.onReact(comment.id, emoji, active)
                      : undefined
                  }
                  pending={ctx.reactPending}
                />
              )}
              {canReply && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 px-1.5 text-ink-faint"
                  onClick={() =>
                    ctx.setReplyingTo(ctx.replyingTo === comment.id ? undefined : comment.id)
                  }
                >
                  <Reply className="size-3.5" aria-hidden />
                  {t('profile:post.reply')}
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {/* Nested replies, indented with a rail. */}
      {replies.length > 0 && (
        <div className="mt-3 flex flex-col gap-3 border-l-2 border-border-card pl-3">
          {replies.map((reply) => (
            <CommentCard key={reply.id} comment={reply} depth={depth + 1} ctx={ctx} />
          ))}
        </div>
      )}

      {canReply && ctx.replyingTo === comment.id && (
        <div className="mt-2.5 border-t pt-2.5">
          <CommentComposer
            kind="model"
            repoId={ctx.paperId}
            placeholder={t('profile:post.replyPlaceholder', { user: comment.author })}
            focusOnMount
            submit={(text) =>
              invoke('hub:paperComment', {
                paperId: ctx.paperId,
                comment: text,
                replyToCommentId: comment.id
              })
            }
            onSubmitted={ctx.onReplied}
          />
        </div>
      )}
    </div>
  )
}
