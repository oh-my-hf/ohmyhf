import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, FileWarning, MessageSquare } from 'lucide-react'
import type { PostReaction, PostSummary } from '@oh-my-huggingface/shared'
import { invoke, openExternal } from '@/lib/ipc'
import { formatCount, formatRelativeTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useToasts } from '@/components/ui/toaster'
import { MarkdownView } from '@/components/browse/MarkdownView'
import { CommentComposer } from '@/components/community/CommentComposer'
import { ReactionBar } from '@/components/community/ReactionBar'
import { ProfileAvatar } from '@/components/profile/ProfileAvatar'
import { UserLink } from '@/components/profile/UserLink'
import { WRITE_DISCUSSIONS_SCOPE, scopeMissing } from '@/lib/scopes'
import { resolveLocale, useAppStore } from '@/stores/app'

/** Full view of a single community post (/posts/:author/:slug). */
export function PostPage(): React.JSX.Element {
  const { t } = useTranslation(['profile', 'common'])
  const navigate = useNavigate()
  const params = useParams()
  const author = params.author ?? ''
  const slug = params.slug ?? ''
  const auth = useAppStore((s) => s.auth)
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)

  const post = useQuery({
    queryKey: ['post', author, slug],
    queryFn: () => invoke('hub:postDetail', { author, slug }),
    enabled: author !== '' && slug !== ''
  })
  const data = post.data

  const me = auth.status === 'signedIn' ? auth.user.name : undefined
  const canReact = auth.status === 'signedIn' && !scopeMissing(auth, WRITE_DISCUSSIONS_SCOPE)
  const react = useMutation({
    mutationFn: (emoji: string) => invoke('hub:postReact', { author, slug, reaction: emoji }),
    onSuccess: (reactions: PostReaction[]) => {
      // Patch the cached post with the Hub's authoritative reaction breakdown
      // (avoids a full refetch and keeps the picker snappy).
      queryClient.setQueryData<PostSummary>(['post', author, slug], (prev) =>
        prev
          ? { ...prev, reactions, numReactions: reactions.reduce((n, r) => n + r.count, 0) }
          : prev
      )
    },
    onError: (err) => push(err.message, 'error')
  })

  return (
    <div className="h-full overflow-y-auto">
      <article className="animate-fade-rise mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-5">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="size-3.5" aria-hidden />
            {t('common:back')}
          </Button>
        </div>

        {post.isPending && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {post.isError && (
          <EmptyState
            icon={FileWarning}
            title={t('profile:post.error.title')}
            body={post.error.message}
            action={
              <Button size="sm" onClick={() => void post.refetch()}>
                {t('common:retry')}
              </Button>
            }
          />
        )}

        {data && (
          <>
            <header className="flex items-center gap-3">
              <ProfileAvatar
                name={data.author}
                url={data.authorAvatarUrl}
                className="size-10 text-[14px]"
              />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline gap-1.5">
                  <UserLink
                    username={data.author}
                    className="truncate text-[13.5px] font-medium text-ink-strong"
                  />
                  {data.authorFullname !== undefined && data.authorFullname !== '' && (
                    <span className="truncate text-[12.5px] text-ink-muted">
                      {data.authorFullname}
                    </span>
                  )}
                </div>
                <div className="nums text-[11.5px] text-ink-faint">
                  {formatRelativeTime(data.publishedAt, locale)}
                </div>
              </div>
            </header>

            <MarkdownView markdown={data.content} kind="model" repoId={`${author}/${slug}`} />

            <footer className="flex flex-col gap-3 border-t pt-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="nums flex items-center gap-1 text-[12px] text-ink-faint">
                  <MessageSquare className="size-3.5" aria-hidden />
                  {formatCount(data.numComments ?? 0, locale)}
                </span>
                <ReactionBar
                  reactions={data.reactions}
                  me={me}
                  canReact={canReact}
                  pending={react.isPending}
                  locale={locale}
                  onReact={(emoji) => react.mutate(emoji)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" size="sm" onClick={() => openExternal(data.url)}>
                  <ExternalLink className="size-3.5" aria-hidden />
                  {t('common:openOnHub')}
                </Button>
                {/* The post payload carries no comment bodies, so reading stays on the Hub. */}
                <p className="text-[12px] text-ink-faint">{t('profile:post.commentsOnHub')}</p>
              </div>
            </footer>

            <section className="flex flex-col gap-2">
              {auth.status === 'signedIn' ? (
                <CommentComposer
                  key={`${author}/${slug}`}
                  kind="model"
                  repoId={`${author}/${slug}`}
                  placeholder={t('profile:post.commentPlaceholder')}
                  submit={(comment) => invoke('hub:postComment', { author, slug, comment })}
                  onSubmitted={() => {
                    push(t('profile:post.commentPosted'), 'success')
                    void queryClient.invalidateQueries({ queryKey: ['post', author, slug] })
                  }}
                />
              ) : (
                <p className="text-center text-[12.5px] text-ink-muted">
                  {t('profile:post.signInToComment')}
                </p>
              )}
            </section>
          </>
        )}
      </article>
    </div>
  )
}
