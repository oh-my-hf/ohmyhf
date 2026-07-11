import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EyeOff, MoreVertical, Quote, Reply } from 'lucide-react'
import type { PostComment } from '@oh-my-huggingface/shared'
import { HUB_HIDE_REASONS } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { cn, formatRelativeTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useToasts } from '@/components/ui/toaster'
import { CommentComposer } from '@/components/community/CommentComposer'
import { MarkdownView } from '@/components/browse/MarkdownView'
import { ReactionBar } from '@/components/community/ReactionBar'
import { ProfileAvatar } from '@/components/profile/ProfileAvatar'
import { UserLink } from '@/components/profile/UserLink'
import { useHubSession } from '@/hooks/use-hub-session'
import { resolveLocale, useAppStore } from '@/stores/app'

/** Shared per-thread context handed to each CommentCard (mutations + gating live in the parent). */
interface ThreadContext {
  author: string
  slug: string
  postUrl: string
  locale: string
  currentUser?: string
  hubSession: boolean
  canHide: (comment: PostComment) => boolean
  onReact: (commentId: string, emoji: string, active: boolean) => void
  reactPending: boolean
  onHide: (comment: PostComment) => void
  onQuote?: (content: string) => void
  replyingTo?: string
  setReplyingTo: (id?: string) => void
  onReplied: () => void
}

/**
 * The comment thread under a community post. Comments come from the Hub post
 * page (there is no JSON endpoint), so they load independently of the post
 * summary. With a Hub web session each comment supports emoji reactions,
 * threaded replies (nested one level, like the Hub), quoting, and hiding
 * (post owner / comment author). Hidden comments show a placeholder.
 */
export function PostComments({
  author,
  slug,
  postUrl,
  onQuote
}: {
  author: string
  slug: string
  postUrl: string
  /** Quote a comment into the MAIN composer (only when a reply composer is shown). */
  onQuote?: (content: string) => void
}): React.JSX.Element | null {
  const { t } = useTranslation(['profile', 'detail'])
  const auth = useAppStore((s) => s.auth)
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)
  const hubSession = useHubSession()
  const push = useToasts((s) => s.push)
  const queryClient = useQueryClient()
  const currentUser = auth.status === 'signedIn' ? auth.user.name : undefined
  const [replyingTo, setReplyingTo] = useState<string>()
  const [hideTarget, setHideTarget] = useState<PostComment>()

  const queryKey = ['post-comments', author, slug]
  const refetch = (): void => void queryClient.invalidateQueries({ queryKey })
  const comments = useQuery({
    queryKey,
    queryFn: () => invoke('hub:postComments', { author, slug }),
    enabled: author !== '' && slug !== ''
  })

  const react = useMutation({
    mutationFn: (v: { commentId: string; emoji: string; active: boolean }) =>
      invoke('hub:postCommentReactionSet', {
        author,
        slug,
        commentId: v.commentId,
        reaction: v.emoji,
        active: v.active
      }),
    onError: (err) => push(t('profile:reactions.error', { error: err.message }), 'error'),
    onSettled: refetch
  })

  const hide = useMutation({
    mutationFn: (v: { commentId: string; reason?: string }) =>
      invoke('hub:postCommentHide', { author, slug, commentId: v.commentId, reason: v.reason }),
    onSuccess: () => {
      setHideTarget(undefined)
      push(t('profile:post.hide.done'), 'success')
      refetch()
    },
    onError: (err) => push(t('profile:post.hide.error', { error: err.message }), 'error')
  })

  if (comments.isPending) return <Skeleton className="h-16 w-full" />
  const items = comments.data ?? []
  if (items.length === 0) return null

  const ctx: ThreadContext = {
    author,
    slug,
    postUrl,
    locale,
    currentUser,
    hubSession,
    // Post owner can hide any comment; anyone can hide their own.
    canHide: (comment) =>
      hubSession &&
      !comment.hidden &&
      currentUser !== undefined &&
      (currentUser === author || currentUser === comment.author),
    onReact: (commentId, emoji, active) => react.mutate({ commentId, emoji, active }),
    reactPending: react.isPending,
    onHide: setHideTarget,
    onQuote,
    replyingTo,
    setReplyingTo,
    onReplied: () => {
      setReplyingTo(undefined)
      push(t('profile:post.comment.posted'), 'success')
      refetch()
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((comment) => (
        <CommentCard key={comment.id} comment={comment} depth={0} ctx={ctx} />
      ))}

      <Dialog open={hideTarget !== undefined} onOpenChange={(open) => !open && setHideTarget(undefined)}>
        <DialogContent>
          <DialogTitle className="flex items-center gap-2 text-[14px] font-semibold">
            <EyeOff className="size-4" aria-hidden />
            {t('profile:post.hide.title')}
          </DialogTitle>
          <DialogDescription className="mt-2 text-[13px] text-ink-muted">
            {t('profile:post.hide.selectReason')}
          </DialogDescription>
          {hideTarget && <HideReasonForm comment={hideTarget} hide={hide} onCancel={() => setHideTarget(undefined)} />}
        </DialogContent>
      </Dialog>
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
  const { t } = useTranslation(['profile', 'detail'])
  const canQuote = ctx.onQuote !== undefined && comment.content.trim() !== ''
  const canHide = ctx.canHide(comment)
  const replies = comment.replies ?? []
  // Only top-level comments accept replies, so the thread stays one level deep.
  const canReply = ctx.hubSession && depth === 0

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
        {!comment.hidden && (canQuote || canHide) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto size-6 text-ink-faint"
                aria-label={t('profile:post.actions')}
              >
                <MoreVertical className="size-3.5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canQuote && (
                <DropdownMenuItem onSelect={() => ctx.onQuote?.(comment.content)}>
                  <Quote className="size-3.5" aria-hidden />
                  {t('detail:discussions.quoteReply')}
                </DropdownMenuItem>
              )}
              {canHide && (
                <DropdownMenuItem
                  className="text-error data-[highlighted]:text-error"
                  onSelect={() => ctx.onHide(comment)}
                >
                  <EyeOff className="size-3.5" aria-hidden />
                  {t('profile:post.hide.action')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {comment.hidden ? (
        <p className="text-[12.5px] text-ink-faint italic">
          {comment.hiddenReason
            ? t('profile:post.hide.hiddenWithReason', { reason: comment.hiddenReason })
            : t('profile:post.hide.hidden')}
        </p>
      ) : (
        <>
          <MarkdownView markdown={comment.content} kind="model" repoId={`${ctx.author}/${ctx.slug}`} />
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <ReactionBar
              reactions={comment.reactions}
              postUrl={ctx.postUrl}
              locale={ctx.locale}
              currentUser={ctx.currentUser}
              onToggle={
                ctx.hubSession
                  ? (emoji, active) => ctx.onReact(comment.id, emoji, active)
                  : undefined
              }
              pending={ctx.reactPending}
            />
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

      {/* Threads with replies keep a persistent reply-in-thread box (like the Hub). */}
      {canReply && !comment.hidden && replies.length > 0 && ctx.replyingTo !== comment.id && (
        <button
          type="button"
          className="mt-2.5 h-9 w-full rounded-lg border bg-field px-2.5 text-left text-[13px] text-ink-faint shadow-field-inset transition-colors duration-150 hover:border-focus/50 focus-visible:border-focus/50 focus-visible:ring-2 focus-visible:ring-focus/25 focus-visible:outline-none"
          onClick={() => ctx.setReplyingTo(comment.id)}
        >
          {t('profile:post.replyInThread')}
        </button>
      )}

      {canReply && ctx.replyingTo === comment.id && (
        <div className="mt-2.5 border-t pt-2.5">
          <CommentComposer
            kind="model"
            repoId={`${ctx.author}/${ctx.slug}`}
            placeholder={t('profile:post.replyPlaceholder', { user: comment.author })}
            focusOnMount
            submit={(text) =>
              invoke('hub:postComment', {
                author: ctx.author,
                slug: ctx.slug,
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

/** Reason radios + irreversible warning for the hide confirmation dialog. */
function HideReasonForm({
  comment,
  hide,
  onCancel
}: {
  comment: PostComment
  hide: { isPending: boolean; mutate: (v: { commentId: string; reason?: string }) => void }
  onCancel: () => void
}): React.JSX.Element {
  const { t } = useTranslation(['profile', 'common'])
  const [reason, setReason] = useState<string>()

  return (
    <div className="mt-3 flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[12px] font-medium text-ink-strong">
          {t('profile:post.hide.reason')}
        </legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {HUB_HIDE_REASONS.map((r) => (
            <label key={r} className="flex items-center gap-1.5 text-[13px]">
              <input
                type="radio"
                name="hide-reason"
                checked={reason === r}
                onChange={() => setReason(r)}
                className="accent-error"
              />
              {r}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-[12px] text-ink">
        {t('profile:post.hide.warning')}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          {t('common:cancel')}
        </Button>
        <Button
          variant="danger"
          size="sm"
          loading={hide.isPending}
          onClick={() => hide.mutate({ commentId: comment.id, reason })}
        >
          <EyeOff className={cn('size-3.5')} aria-hidden />
          {t('profile:post.hide.confirm')}
        </Button>
      </div>
    </div>
  )
}
