import { useEffect, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import {
  Boxes,
  Database,
  ExternalLink,
  FileText,
  Heart,
  LayoutGrid,
  MessageSquare,
  ThumbsUp
} from 'lucide-react'
import type { PaperSummary, PostSummary, RepoKind, RepoSummary } from '@oh-my-huggingface/shared'
import { openExternal } from '@/lib/ipc'
import { cn, formatCount, formatRelativeTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MarkdownView } from '@/components/browse/MarkdownView'
import { ProfileAvatar } from '@/components/profile/ProfileAvatar'
import { UserLink } from '@/components/profile/UserLink'

const KIND_PATH: Record<RepoKind, string> = {
  model: 'models',
  dataset: 'datasets',
  space: 'spaces'
}

const KIND_ICON: Record<RepoKind, React.ComponentType<{ className?: string }>> = {
  model: Boxes,
  dataset: Database,
  space: LayoutGrid
}

/** True while the element's content overflows its max-height clamp. */
function useIsClamped(): { ref: React.RefObject<HTMLDivElement | null>; clamped: boolean } {
  const ref = useRef<HTMLDivElement>(null)
  const [clamped, setClamped] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const observer = new ResizeObserver(() => {
      setClamped(el.scrollHeight > el.clientHeight + 1)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { ref, clamped }
}

export function PostCard({
  post,
  locale
}: {
  post: PostSummary
  locale: string
}): React.JSX.Element {
  const { t } = useTranslation(['home', 'common'])
  const navigate = useNavigate()
  const { ref: clampRef, clamped } = useIsClamped()
  const open = (): void => {
    void navigate(`/posts/${post.author}/${post.slug}`)
  }
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        // Only react to keys on the card itself, not on inner interactive elements.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
      className="flex cursor-pointer flex-col gap-3 rounded-lg border border-border-card bg-card-gradient p-4 transition-colors duration-150 outline-none hover:border-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
    >
      <header className="flex items-center gap-2.5">
        <UserLink username={post.author} ariaLabel={post.author} className="shrink-0 rounded-full">
          <ProfileAvatar
            name={post.author}
            url={post.authorAvatarUrl}
            className="size-8 text-[12px]"
            isPro={post.authorIsPro === true}
            frame="compact"
          />
        </UserLink>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <UserLink username={post.author} className="truncate text-[13px] font-medium" />
            {post.authorFullname ? (
              <span className="truncate text-[12px] text-ink-muted">{post.authorFullname}</span>
            ) : null}
          </div>
          <div className="nums text-[11.5px] text-ink-faint">
            {formatRelativeTime(post.publishedAt, locale)}
          </div>
        </div>
        <Badge>{t('home:kind.post')}</Badge>
      </header>
      <div
        ref={clampRef}
        className={cn(
          'relative max-h-40 overflow-hidden',
          // Fade the text itself (theme-proof), and only when actually clamped.
          clamped &&
            '[mask-image:linear-gradient(to_bottom,black_calc(100%-2.5rem),transparent)]'
        )}
        onClick={(e) => {
          // Links inside markdown open externally; don't also navigate the card.
          if ((e.target as HTMLElement).closest('a')) e.stopPropagation()
        }}
      >
        <MarkdownView markdown={post.content} />
      </div>
      <footer className="nums flex items-center gap-3 text-[11.5px] text-ink-faint">
        <span className="flex items-center gap-1">
          <MessageSquare className="size-3.5" aria-hidden />
          {formatCount(post.numComments ?? 0, locale)}
        </span>
        <span className="flex items-center gap-1">
          <Heart className="size-3.5" aria-hidden />
          {formatCount(post.numReactions ?? 0, locale)}
        </span>
        <span className="flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={t('common:openOnHub')}
              onClick={(e) => {
                e.stopPropagation()
                openExternal(post.url)
              }}
            >
              <ExternalLink className="size-3.5" aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('common:openOnHub')}</TooltipContent>
        </Tooltip>
      </footer>
    </article>
  )
}

export function RepoEventRow({
  repo,
  locale
}: {
  repo: RepoSummary
  locale: string
}): React.JSX.Element {
  const { t } = useTranslation(['home', 'common'])
  const navigate = useNavigate()
  const Icon = KIND_ICON[repo.kind]
  return (
    <button
      type="button"
      onClick={() => navigate(`/${KIND_PATH[repo.kind]}/${repo.id}`)}
      className="group flex w-full items-center gap-3 rounded-lg border border-border-card bg-card-gradient p-4 text-left transition-colors duration-150 outline-none hover:border-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
    >
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-bg ring-1 ring-border">
        <Icon className="size-3.5 text-ink-muted" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-ink-muted">
          <Trans
            i18nKey="feed.updated"
            ns="home"
            values={{ author: repo.author, repo: repo.id }}
            components={{
              author: <UserLink username={repo.author} className="font-medium text-ink" />,
              repo: (
                <span className="font-mono text-ink-strong transition-colors duration-150 group-hover:text-hover-title" />
              )
            }}
          />
        </div>
        <div className="nums text-[11.5px] text-ink-faint">
          {formatRelativeTime(repo.updatedAt, locale)}
        </div>
      </div>
      <Badge>{t(`common:kind.${repo.kind}`)}</Badge>
    </button>
  )
}

export function PaperRow({
  paper,
  locale
}: {
  paper: PaperSummary
  locale: string
}): React.JSX.Element {
  const { t } = useTranslation(['home', 'common'])
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => navigate(`/papers/${paper.id}`)}
      className="group flex w-full items-center gap-3 rounded-lg border border-border-card bg-card-gradient p-4 text-left transition-colors duration-150 outline-none hover:border-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
    >
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-bg ring-1 ring-border">
        <FileText className="size-3.5 text-ink-muted" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-1 text-[13px] font-medium text-ink-strong">{paper.title}</div>
        <div className="nums flex items-center gap-1.5 text-[11.5px] text-ink-faint">
          <span className="flex items-center gap-0.5">
            <ThumbsUp className="size-3" aria-hidden />
            {formatCount(paper.upvotes, locale)}
          </span>
          {paper.publishedAt ? (
            <>
              <span className="text-decor" aria-hidden>
                ·
              </span>
              <span>{formatRelativeTime(paper.publishedAt, locale)}</span>
            </>
          ) : null}
        </div>
      </div>
      <Badge>{t('common:kind.paper')}</Badge>
    </button>
  )
}
