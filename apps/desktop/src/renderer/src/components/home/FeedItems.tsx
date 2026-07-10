import { Trans, useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import {
  Boxes,
  Database,
  ExternalLink,
  FileText,
  Heart,
  MessageSquare,
  ThumbsUp
} from 'lucide-react'
import type { PaperSummary, PostSummary, RepoKind, RepoSummary } from '@oh-my-huggingface/shared'
import { openExternal } from '@/lib/ipc'
import { formatCount, formatRelativeTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const KIND_PATH: Record<RepoKind, string> = {
  model: 'models',
  dataset: 'datasets',
  space: 'spaces'
}

const KIND_ICON: Record<RepoKind, React.ComponentType<{ className?: string }>> = {
  model: Boxes,
  dataset: Database,
  space: Boxes
}

/** The hub sometimes returns avatar paths relative to the site root. */
function absoluteAvatarUrl(url: string): string {
  return url.startsWith('/') ? `https://huggingface.co${url}` : url
}

export function PostCard({
  post,
  locale
}: {
  post: PostSummary
  locale: string
}): React.JSX.Element {
  const { t } = useTranslation(['home', 'common'])
  const open = (): void => openExternal(post.url)
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
      className="flex cursor-pointer flex-col gap-3 rounded-lg border bg-panel p-4 transition-colors duration-150 outline-none hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
    >
      <header className="flex items-center gap-2.5">
        {post.authorAvatarUrl ? (
          <img
            src={absoluteAvatarUrl(post.authorAvatarUrl)}
            alt=""
            className="size-8 shrink-0 rounded-full border"
            draggable={false}
          />
        ) : (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-panel-2 text-[12px] font-semibold text-ink-muted uppercase ring-1 ring-border">
            {post.author.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-[13px] font-medium">{post.author}</span>
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
      {/* Raw markdown-ish text; rendered clamped as plain text on purpose. */}
      <p className="line-clamp-6 text-[13px] leading-relaxed break-words whitespace-pre-wrap">
        {post.content}
      </p>
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
              className="h-6 w-6"
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
      className="flex w-full items-center gap-3 rounded-lg border bg-panel px-4 py-3 text-left transition-colors duration-150 outline-none hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
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
              author: <span className="font-medium text-ink" />,
              repo: <span className="font-medium text-ink" />
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
      className="flex w-full items-center gap-3 rounded-lg border bg-panel px-4 py-3 text-left transition-colors duration-150 outline-none hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
    >
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-bg ring-1 ring-border">
        <FileText className="size-3.5 text-ink-muted" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-1 text-[13px] font-medium">{paper.title}</div>
        <div className="nums flex items-center gap-2 text-[11.5px] text-ink-faint">
          <span className="flex items-center gap-0.5">
            <ThumbsUp className="size-3" aria-hidden />
            {formatCount(paper.upvotes, locale)}
          </span>
          <span>{formatRelativeTime(paper.publishedAt, locale)}</span>
        </div>
      </div>
      <Badge>{t('common:kind.paper')}</Badge>
    </button>
  )
}
