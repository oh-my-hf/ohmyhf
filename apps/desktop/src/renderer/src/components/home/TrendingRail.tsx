import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { ArrowDownToLine, Boxes, Database, Heart, LayoutGrid, TrendingUp } from 'lucide-react'
import type { Page, RepoKind, RepoSummary } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { cn, formatCount, formatRelativeTime } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { UserLink } from '@/components/profile/UserLink'
import { resolveLocale, useAppStore } from '@/stores/app'

const STALE_TIME = 5 * 60_000
const ALL_MODE_LIMIT = 12

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

type Segment = 'all' | RepoKind

function useTrending(kind: RepoKind): UseQueryResult<Page<RepoSummary>> {
  return useQuery({
    queryKey: ['home', 'trending', kind],
    queryFn: () => invoke('hub:search', { query: { kind, sort: 'trending', limit: 6 } }),
    staleTime: STALE_TIME
  })
}

function TrendingRow({ repo, locale }: { repo: RepoSummary; locale: string }): React.JSX.Element {
  const navigate = useNavigate()
  const Icon = KIND_ICON[repo.kind]
  const slash = repo.id.indexOf('/')
  const owner = slash > 0 ? repo.id.slice(0, slash) : null
  return (
    <button
      type="button"
      onClick={() => navigate(`/${KIND_PATH[repo.kind]}/${repo.id}`)}
      className="group flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left transition-colors duration-150 outline-none hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {repo.kind === 'space' && repo.emoji ? (
          <span className="w-4 shrink-0 text-center text-[12px] leading-none" aria-hidden>
            {repo.emoji}
          </span>
        ) : (
          <Icon className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
        )}
        <span className="truncate font-mono text-[13px] tracking-tight text-ink-strong transition-colors duration-150 group-hover:text-hover-title">
          {owner !== null ? (
            <>
              <UserLink username={owner}>{owner}</UserLink>
              {repo.id.slice(slash)}
            </>
          ) : (
            repo.id
          )}
        </span>
      </span>
      <span className="nums flex items-center gap-1.5 pl-[22px] text-[11px] text-ink-faint">
        <span className="flex items-center gap-0.5">
          <Heart className="size-3" aria-hidden />
          {formatCount(repo.likes, locale)}
        </span>
        <span className="text-decor" aria-hidden>
          ·
        </span>
        <span className="flex items-center gap-0.5">
          <ArrowDownToLine className="size-3" aria-hidden />
          {formatCount(repo.downloads, locale)}
        </span>
        {repo.updatedAt ? (
          <>
            <span className="text-decor" aria-hidden>
              ·
            </span>
            <span>{formatRelativeTime(repo.updatedAt, locale)}</span>
          </>
        ) : null}
      </span>
    </button>
  )
}

export function TrendingRail(): React.JSX.Element {
  const { t } = useTranslation(['home', 'nav'])
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)
  const [segment, setSegment] = useState<Segment>('all')

  const models = useTrending('model')
  const datasets = useTrending('dataset')
  const spaces = useTrending('space')

  const rows = useMemo<RepoSummary[]>(() => {
    if (segment !== 'all') {
      const active = segment === 'model' ? models : segment === 'dataset' ? datasets : spaces
      return active.data?.items ?? []
    }
    return [
      ...(models.data?.items ?? []),
      ...(datasets.data?.items ?? []),
      ...(spaces.data?.items ?? [])
    ]
      .sort((a, b) => (b.trendingScore ?? b.likes) - (a.trendingScore ?? a.likes))
      .slice(0, ALL_MODE_LIMIT)
  }, [segment, models, datasets, spaces])

  const anyPending = models.isPending || datasets.isPending || spaces.isPending
  const showSkeleton = rows.length === 0 && anyPending

  const segments: Array<{ id: Segment; label: string }> = [
    { id: 'all', label: t('home:trending.all') },
    { id: 'model', label: t('nav:models') },
    { id: 'dataset', label: t('nav:datasets') },
    { id: 'space', label: t('nav:spaces') }
  ]

  return (
    <aside className="hidden w-80 shrink-0 overflow-y-auto border-l min-[1100px]:block">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-ink-muted" aria-hidden />
          <h2 className="text-smd font-semibold text-ink-strong">{t('home:trending.title')}</h2>
        </div>
        <div className="flex items-center gap-0.5">
          {segments.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={segment === s.id}
              onClick={() => setSegment(s.id)}
              className={cn(
                'h-6 rounded-md px-2 text-[11.5px] font-medium transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
                segment === s.id
                  ? 'bg-panel-2 text-ink-strong'
                  : 'text-ink-muted hover:bg-panel-2 hover:text-ink'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        {showSkeleton ? (
          <div className="flex flex-col gap-1.5">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-2 py-4 text-[12px] text-ink-faint">{t('home:trending.empty')}</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {rows.map((repo) => (
              <TrendingRow key={`${repo.kind}:${repo.id}`} repo={repo} locale={locale} />
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
