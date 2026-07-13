import { Trans, useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Boxes, Database, GitPullRequest, LayoutGrid, MessageSquare } from 'lucide-react'
import type {
  ActivityDiscussion,
  ActivityItem,
  RepoKind,
  RepoSummary
} from '@oh-my-huggingface/shared'
import { formatRelativeTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ProfileAvatar } from '@/components/profile/ProfileAvatar'
import { UserLink } from '@/components/profile/UserLink'
import { PostCard } from '@/components/home/FeedItems'

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

/** i18n key for the actor's verb line, per repo-event kind. */
const VERB_KEY: Record<'like' | 'update' | 'publish' | 'new-repo', string> = {
  like: 'feed.acted.liked',
  update: 'feed.acted.updated',
  publish: 'feed.acted.published',
  'new-repo': 'feed.acted.published'
}

function ActorHeader({
  actor,
  actorAvatarUrl,
  actorIsPro,
  time,
  locale
}: {
  actor: string
  actorAvatarUrl?: string
  actorIsPro?: boolean
  time?: string
  locale: string
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <UserLink username={actor} ariaLabel={actor} className="shrink-0 rounded-full">
        <ProfileAvatar
          name={actor}
          url={actorAvatarUrl}
          className="size-5 text-[10px]"
          isPro={actorIsPro === true}
          frame="compact"
        />
      </UserLink>
      <span className="nums text-[11.5px] text-ink-faint">{formatRelativeTime(time, locale)}</span>
    </div>
  )
}

function RepoActivityCard({
  kind,
  actor,
  actorAvatarUrl,
  actorIsPro,
  time,
  repo,
  locale
}: {
  kind: 'like' | 'update' | 'publish' | 'new-repo'
  actor: string
  actorAvatarUrl?: string
  actorIsPro?: boolean
  time?: string
  repo: RepoSummary
  locale: string
}): React.JSX.Element {
  const { t } = useTranslation(['home', 'common'])
  const navigate = useNavigate()
  const Icon = KIND_ICON[repo.kind]
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-card bg-card-gradient p-4">
      <div className="min-w-0 text-[12.5px] text-ink-muted">
        <Trans
          i18nKey={VERB_KEY[kind]}
          ns="home"
          values={{ actor }}
          components={{ author: <UserLink username={actor} className="font-medium text-ink" /> }}
        />
      </div>
      <button
        type="button"
        onClick={() => navigate(`/${KIND_PATH[repo.kind]}/${repo.id}`)}
        className="group flex w-full items-center gap-3 rounded-md border border-border-card bg-bg/40 p-2.5 text-left transition-colors duration-150 outline-none hover:border-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      >
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-bg ring-1 ring-border">
          <Icon className="size-3.5 text-ink-muted" aria-hidden />
        </div>
        <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink-strong transition-colors duration-150 group-hover:text-hover-title">
          {repo.id}
        </span>
        <Badge>{t(`common:kind.${repo.kind}`)}</Badge>
      </button>
      <ActorHeader
        actor={actor}
        actorAvatarUrl={actorAvatarUrl}
        actorIsPro={actorIsPro}
        time={time}
        locale={locale}
      />
    </div>
  )
}

function DiscussionActivityCard({
  actor,
  actorAvatarUrl,
  actorIsPro,
  time,
  discussion,
  locale
}: {
  actor: string
  actorAvatarUrl?: string
  actorIsPro?: boolean
  time?: string
  discussion: ActivityDiscussion
  locale: string
}): React.JSX.Element {
  const { t } = useTranslation(['home', 'common'])
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-card bg-card-gradient p-4">
      <div className="min-w-0 text-[12.5px] text-ink-muted">
        <Trans
          i18nKey="feed.acted.discussion"
          ns="home"
          values={{ actor, repo: discussion.repoId }}
          components={{
            author: <UserLink username={actor} className="font-medium text-ink" />,
            repo: <span className="font-mono text-ink-strong" />
          }}
        />
      </div>
      <button
        type="button"
        onClick={() =>
          navigate(
            `/${KIND_PATH[discussion.repoKind]}/${discussion.repoId}/discussions/${discussion.num}`
          )
        }
        className="group flex w-full items-center gap-2.5 rounded-md border border-border-card bg-bg/40 p-2.5 text-left transition-colors duration-150 outline-none hover:border-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      >
        <GitPullRequest className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-strong group-hover:text-hover-title">
          {discussion.title || t('feed.acted.untitledDiscussion')}
        </span>
        <span className="nums flex shrink-0 items-center gap-1 text-[11px] text-ink-faint">
          <MessageSquare className="size-3" aria-hidden />
          {discussion.numComments ?? 0}
        </span>
      </button>
      <ActorHeader
        actor={actor}
        actorAvatarUrl={actorAvatarUrl}
        actorIsPro={actorIsPro}
        time={time}
        locale={locale}
      />
    </div>
  )
}

/** Renders one personalized-feed activity item by kind. */
export function ActivityCard({
  item,
  locale
}: {
  item: ActivityItem
  locale: string
}): React.JSX.Element {
  if (item.kind === 'social-post') return <PostCard post={item.post} locale={locale} />
  if (item.kind === 'discussion') {
    return (
      <DiscussionActivityCard
        actor={item.actor}
        actorAvatarUrl={item.actorAvatarUrl}
        actorIsPro={item.actorIsPro}
        time={item.time}
        discussion={item.discussion}
        locale={locale}
      />
    )
  }
  return (
    <RepoActivityCard
      kind={item.kind}
      actor={item.actor}
      actorAvatarUrl={item.actorAvatarUrl}
      actorIsPro={item.actorIsPro}
      time={item.time}
      repo={item.repo}
      locale={locale}
    />
  )
}
