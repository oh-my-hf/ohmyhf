import type { ComponentType } from 'react'
import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownToLine,
  Boxes,
  Building2,
  Database,
  FileText,
  Heart,
  Library,
  LayoutGrid,
  Search,
  User
} from 'lucide-react'
import type {
  CollectionSearchResult,
  OrgSearchResult,
  PaperSearchResult,
  RepoKind,
  RepoSummary,
  UserSearchResult
} from '@oh-my-huggingface/shared'
import { cn, formatCount } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { resolveLocale, useAppStore } from '@/stores/app'
import {
  useSearchPage,
  type SearchPageBuckets,
  type SearchPageType
} from '@/hooks/use-search-page'

type NonRepoType = Exclude<SearchPageType, 'all' | RepoKind>
type BucketKey = keyof SearchPageBuckets

const VALID_TYPES: SearchPageType[] = [
  'all',
  'model',
  'dataset',
  'space',
  'org',
  'user',
  'paper',
  'collection'
]

const REPO_PATH: Record<RepoKind, string> = {
  model: 'models',
  dataset: 'datasets',
  space: 'spaces'
}

const REPO_BUCKET: Record<RepoKind, 'models' | 'datasets' | 'spaces'> = {
  model: 'models',
  dataset: 'datasets',
  space: 'spaces'
}

const TYPE_ICON: Record<SearchPageType, ComponentType<{ className?: string }>> = {
  all: Search,
  model: Boxes,
  dataset: Database,
  space: LayoutGrid,
  org: Building2,
  user: User,
  paper: FileText,
  collection: Library
}

const TYPE_LABEL_KEY: Record<SearchPageType, string> = {
  all: 'nav:searchPage.all',
  model: 'nav:models',
  dataset: 'nav:datasets',
  space: 'nav:spaces',
  org: 'nav:organizations',
  user: 'nav:users',
  paper: 'nav:papers',
  collection: 'nav:collections'
}

const TYPE_BUCKET: Record<Exclude<SearchPageType, 'all'>, BucketKey> = {
  model: 'models',
  dataset: 'datasets',
  space: 'spaces',
  org: 'orgs',
  user: 'users',
  paper: 'papers',
  collection: 'collections'
}

const ALL_SECTIONS = [
  { type: 'model', bucket: 'models' },
  { type: 'dataset', bucket: 'datasets' },
  { type: 'space', bucket: 'spaces' },
  { type: 'org', bucket: 'orgs' },
  { type: 'user', bucket: 'users' },
  { type: 'paper', bucket: 'papers' },
  { type: 'collection', bucket: 'collections' }
] as const satisfies ReadonlyArray<{
  type: Exclude<SearchPageType, 'all'>
  bucket: BucketKey
}>

function isSearchPageType(value: string | null): value is SearchPageType {
  return VALID_TYPES.includes(value as SearchPageType)
}

function isRepoType(type: SearchPageType): type is RepoKind {
  return type === 'model' || type === 'dataset' || type === 'space'
}

function bucketCount(buckets: SearchPageBuckets, bucket: BucketKey): number {
  return buckets[bucket].length
}

function RepoResultRow({
  repo,
  locale,
  onSelect
}: {
  repo: RepoSummary
  locale: string
  onSelect: () => void
}): React.JSX.Element {
  const Icon = TYPE_ICON[repo.kind]
  const meta = [repo.pipelineTag, repo.libraryName, repo.license, repo.sdk].filter(Boolean)

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex w-full items-start gap-3 rounded-lg border border-border-card bg-card-gradient p-3 text-left transition-colors duration-150 outline-none hover:border-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
    >
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-panel-2 ring-1 ring-border-card">
        <Icon className="size-4 text-ink-muted" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[13px] font-medium text-ink-strong">{repo.id}</p>
        {repo.shortDescription ? (
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-muted">
            {repo.shortDescription}
          </p>
        ) : null}
        {meta.length > 0 ? (
          <p className="mt-1.5 truncate text-[11.5px] text-ink-faint">{meta.join(' · ')}</p>
        ) : null}
      </div>
      <div className="nums hidden shrink-0 items-center gap-2 text-[11.5px] text-ink-faint sm:flex">
        <span className="flex items-center gap-0.5">
          <Heart className="size-3" aria-hidden />
          {formatCount(repo.likes, locale)}
        </span>
        <span className="flex items-center gap-0.5">
          <ArrowDownToLine className="size-3" aria-hidden />
          {formatCount(repo.downloads, locale)}
        </span>
      </div>
    </button>
  )
}

function AccountResultRow({
  account,
  type,
  onSelect
}: {
  account: UserSearchResult | OrgSearchResult
  type: 'user' | 'org'
  onSelect: () => void
}): React.JSX.Element {
  const Icon = TYPE_ICON[type]
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-lg border border-border-card bg-card-gradient p-3 text-left transition-colors duration-150 outline-none hover:border-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
    >
      {account.avatarUrl ? (
        <img src={account.avatarUrl} alt="" loading="lazy" decoding="async" className="size-9 shrink-0 rounded-full border" />
      ) : (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-panel-2 ring-1 ring-border-card">
          <Icon className="size-4 text-ink-muted" aria-hidden />
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate font-mono text-[13px] font-medium text-ink-strong">
          {account.name}
        </p>
        {account.fullname ? (
          <p className="truncate text-[12.5px] text-ink-muted">{account.fullname}</p>
        ) : null}
      </div>
    </button>
  )
}

function PaperResultRow({
  paper,
  onSelect
}: {
  paper: PaperSearchResult
  onSelect: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-start gap-3 rounded-lg border border-border-card bg-card-gradient p-3 text-left transition-colors duration-150 outline-none hover:border-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
    >
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-panel-2 ring-1 ring-border-card">
        <FileText className="size-4 text-ink-muted" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[13px] font-medium text-ink-strong">{paper.title}</p>
        <p className="mt-1 truncate font-mono text-[11.5px] text-ink-faint">{paper.id}</p>
      </div>
    </button>
  )
}

function CollectionResultRow({
  collection,
  onSelect
}: {
  collection: CollectionSearchResult
  onSelect: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-start gap-3 rounded-lg border border-border-card bg-card-gradient p-3 text-left transition-colors duration-150 outline-none hover:border-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
    >
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-panel-2 ring-1 ring-border-card">
        <Library className="size-4 text-ink-muted" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[13px] font-medium text-ink-strong">{collection.title}</p>
        {collection.description ? (
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-muted">
            {collection.description}
          </p>
        ) : null}
        <p className="mt-1 truncate font-mono text-[11.5px] text-ink-faint">{collection.slug}</p>
      </div>
    </button>
  )
}

function LoadingResults(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  )
}

export function SearchPage(): React.JSX.Element {
  const { t } = useTranslation(['nav', 'common'])
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)

  const query = searchParams.get('q') ?? ''
  const trimmedQuery = query.trim()
  const rawType = searchParams.get('type')
  const activeType: SearchPageType = isSearchPageType(rawType) ? rawType : 'all'
  const search = useSearchPage(trimmedQuery, activeType)

  // Always show every type's count from preview buckets so switching tabs
  // doesn't blank the other numbers. Active repo tab may show more once paginated.
  const counts = useMemo(() => {
    if (trimmedQuery === '') return new Map<SearchPageType, number>()

    const next = new Map<SearchPageType, number>()
    for (const section of ALL_SECTIONS) {
      let n = bucketCount(search.buckets, section.bucket)
      if (isRepoType(section.type) && activeType === section.type) {
        n = Math.max(n, search.repoItems.length)
      }
      if (n > 0) next.set(section.type, n)
    }
    const allTotal = ALL_SECTIONS.reduce(
      (sum, section) => sum + (next.get(section.type) ?? 0),
      0
    )
    if (allTotal > 0) next.set('all', allTotal)
    return next
  }, [activeType, search.buckets, search.repoItems.length, trimmedQuery])

  const setType = (nextType: SearchPageType): void => {
    const next = new URLSearchParams(searchParams)
    if (trimmedQuery) next.set('q', trimmedQuery)
    else next.delete('q')
    next.set('type', nextType)
    setSearchParams(next, { replace: true })
  }

  const navigateToRepo = (repo: RepoSummary): void => {
    void navigate(`/${REPO_PATH[repo.kind]}/${repo.id}`)
  }

  const renderRows = (typeToRender: Exclude<SearchPageType, 'all'>): React.JSX.Element[] => {
    if (isRepoType(typeToRender)) {
      const repos = activeType === 'all' ? search.buckets[REPO_BUCKET[typeToRender]] : search.repoItems
      return repos.map((repo) => (
        <RepoResultRow
          key={repo.id}
          repo={repo}
          locale={locale}
          onSelect={() => navigateToRepo(repo)}
        />
      ))
    }

    if (typeToRender === 'org') {
      return search.buckets.orgs.map((org) => (
        <AccountResultRow
          key={org.name}
          account={org}
          type="org"
          onSelect={() => void navigate(`/users/${org.name}`)}
        />
      ))
    }

    if (typeToRender === 'user') {
      return search.buckets.users.map((user) => (
        <AccountResultRow
          key={user.name}
          account={user}
          type="user"
          onSelect={() => void navigate(`/users/${user.name}`)}
        />
      ))
    }

    if (typeToRender === 'paper') {
      return search.buckets.papers.map((paper) => (
        <PaperResultRow
          key={paper.id}
          paper={paper}
          onSelect={() => void navigate(`/papers/${paper.id}`)}
        />
      ))
    }

    return search.buckets.collections.map((collection) => (
      <CollectionResultRow
        key={collection.slug}
        collection={collection}
        onSelect={() => void navigate(`/collections/${collection.slug}`)}
      />
    ))
  }

  const renderAllResults = (): React.JSX.Element => (
    <div className="flex flex-col gap-6">
      {ALL_SECTIONS.map((section) => {
        const rows = renderRows(section.type)
        if (rows.length === 0) return null
        const Icon = TYPE_ICON[section.type]
        return (
          <section key={section.type} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-ink-strong">
                <Icon className="size-4 shrink-0 text-ink-muted" aria-hidden />
                <span className="truncate">{t(TYPE_LABEL_KEY[section.type])}</span>
                <span className="nums text-[11.5px] font-normal text-ink-faint">
                  {formatCount(rows.length, locale)}
                </span>
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setType(section.type)}>
                {t('nav:searchPage.viewMore')}
              </Button>
            </div>
            <div className="flex flex-col gap-2">{rows}</div>
          </section>
        )
      })}
    </div>
  )

  const renderSingleTypeResults = (): React.JSX.Element => {
    if (activeType === 'all') return renderAllResults()

    const rows = renderRows(activeType)
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">{rows}</div>
        {isRepoType(activeType) && search.repoHasMore ? (
          <div className="flex justify-center pt-2">
            <Button
              variant="secondary"
              size="sm"
              loading={search.repoFetchingMore}
              onClick={search.repoFetchMore}
            >
              {t('searchPage.loadMore')}
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  const totalResults =
    activeType === 'all'
      ? ALL_SECTIONS.reduce((sum, section) => sum + bucketCount(search.buckets, section.bucket), 0)
      : isRepoType(activeType)
        ? search.repoItems.length
        : bucketCount(search.buckets, TYPE_BUCKET[activeType as NonRepoType])

  let content: React.JSX.Element
  if (trimmedQuery === '') {
    content = (
      <EmptyState
        icon={Search}
        title={t('nav:searchPage.emptyQueryTitle')}
        body={t('nav:searchPage.emptyQueryBody')}
        className="h-full justify-center"
      />
    )
  } else if (search.isLoading) {
    content = <LoadingResults />
  } else if (totalResults === 0) {
    content = (
      <EmptyState
        icon={Search}
        title={t('nav:searchPage.emptyTitle')}
        body={t('nav:searchPage.emptyBody')}
        className="h-full justify-center"
      />
    )
  } else {
    content = renderSingleTypeResults()
  }

  return (
    <div className="flex h-full min-w-0 max-[760px]:flex-col">
      <aside
        aria-label={t('searchPage.title')}
        className="flex w-56 shrink-0 flex-col gap-2 border-r bg-panel/30 p-3 max-[760px]:w-full max-[760px]:border-r-0 max-[760px]:border-b"
      >
        <p className="px-2 text-[11px] font-semibold tracking-wider text-ink-faint uppercase">
          {t('nav:search')}
        </p>
        <div className="flex flex-col gap-1 max-[760px]:flex-row max-[760px]:overflow-x-auto">
          {VALID_TYPES.map((option) => {
            const Icon = TYPE_ICON[option]
            const selected = option === activeType
            const count = counts.get(option)
            return (
              <button
                key={option}
                type="button"
                onClick={() => setType(option)}
                className={cn(
                  'flex h-8 items-center gap-2 rounded-lg px-2.5 text-left text-[12.5px] transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus max-[760px]:shrink-0',
                  selected
                    ? 'bg-select/10 text-select'
                    : 'text-ink-muted hover:bg-panel-2 hover:text-ink'
                )}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{t(TYPE_LABEL_KEY[option])}</span>
                {count !== undefined ? (
                  <span className="nums shrink-0 text-[11px] text-ink-faint">
                    {formatCount(count, locale)}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="animate-fade-rise mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-5">
          <header className="flex flex-col gap-1 border-b border-border-card pb-4">
            <p className="text-[12px] font-medium text-ink-faint">
              {t('nav:searchPage.title', { query: trimmedQuery })}
            </p>
            <h1 className="text-lg leading-tight font-semibold text-ink-strong">
              {trimmedQuery || t('nav:searchPage.emptyQueryTitle')}
            </h1>
          </header>
          {content}
        </div>
      </main>
    </div>
  )
}
