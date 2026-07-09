import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDownToLine, Heart, Lock, ShieldAlert } from 'lucide-react'
import type { RepoKind, RepoSummary, SearchQuery } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { cn, formatCount, formatParams, paramBucketOf } from '@/lib/utils'
import { useDebounced } from '@/hooks/use-debounced'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { resolveLocale, useAppStore } from '@/stores/app'

const ROW_HEIGHT = 56

interface RepoListProps {
  kind: RepoKind
  selectedId: string | undefined
  onSelect: (repo: RepoSummary) => void
}

export function RepoList({ kind, selectedId, onSelect }: RepoListProps): React.JSX.Element {
  const { t } = useTranslation(['browse', 'common'])
  const filters = useAppStore((s) => s.filters[kind])
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)
  const search = useDebounced(filters.search, 250)
  const parentRef = useRef<HTMLDivElement>(null)

  const query: SearchQuery = useMemo(
    () => ({
      kind,
      search: search || undefined,
      pipelineTag: filters.pipelineTag,
      library: filters.library,
      license: filters.license,
      sort: filters.sort,
      limit: 30
    }),
    [kind, search, filters.pipelineTag, filters.library, filters.license, filters.sort]
  )

  const { data, error, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useInfiniteQuery({
      queryKey: ['search', query],
      queryFn: ({ pageParam }) =>
        invoke('hub:search', { query: pageParam ? { ...query, cursor: pageParam } : query }),
      initialPageParam: '',
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? null
    })

  const items = useMemo(() => {
    const all = data?.pages.flatMap((p) => p.items) ?? []
    if (!filters.paramBucket) return all
    // Parameter-count filtering is client-side (the public API has no param filter).
    return all.filter((item) => paramBucketOf(item.paramCount) === filters.paramBucket)
  }, [data, filters.paramBucket])

  const virtualizer = useVirtualizer({
    count: items.length + (hasNextPage ? 1 : 0),
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8
  })

  const virtualItems = virtualizer.getVirtualItems()
  useEffect(() => {
    const last = virtualItems.at(-1)
    if (last && last.index >= items.length - 1 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage()
    }
  }, [virtualItems, items.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  const selectByOffset = useCallback(
    (offset: number): void => {
      if (items.length === 0) return
      const currentIndex = items.findIndex((i) => i.id === selectedId)
      const next = items[Math.max(0, Math.min(items.length - 1, currentIndex + offset))]
      if (next) {
        onSelect(next)
        virtualizer.scrollToIndex(Math.max(0, currentIndex + offset), { align: 'auto' })
      }
    },
    [items, selectedId, onSelect, virtualizer]
  )

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault()
      selectByOffset(1)
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault()
      selectByOffset(-1)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-1 p-2">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="flex h-[52px] flex-col justify-center gap-1.5 px-2">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    const rateLimited = /429|rate.?limit/i.test(error.message)
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="max-w-72 text-[13px] text-ink-muted">
          {rateLimited ? t('browse:error.rateLimited') : t('common:error.network')}
        </p>
        <Button size="sm" onClick={() => void refetch()}>
          {t('common:retry')}
        </Button>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 p-8 text-center">
        <p className="text-[13.5px] font-medium">{t('browse:empty.title')}</p>
        <p className="text-[12.5px] text-ink-muted">{t('browse:empty.body')}</p>
      </div>
    )
  }

  return (
    <div
      ref={parentRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="min-h-0 flex-1 overflow-y-auto outline-none"
      role="listbox"
      aria-label={t(`searchPlaceholder.${kind}`)}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualItems.map((row) => {
          const repo = items[row.index]
          if (!repo) {
            return (
              <div
                key="loader"
                className="absolute inset-x-0 flex items-center justify-center text-[12px] text-ink-faint"
                style={{ top: row.start, height: ROW_HEIGHT }}
              >
                {isFetchingNextPage ? t('common:loading') : t('browse:endOfResults')}
              </div>
            )
          }
          const selected = repo.id === selectedId
          return (
            <button
              key={repo.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(repo)}
              className={cn(
                'absolute inset-x-1 flex flex-col justify-center gap-0.5 rounded-md px-2.5 text-left transition-colors duration-100',
                selected ? 'bg-primary/10' : 'hover:bg-panel'
              )}
              style={{ top: row.start + 2, height: ROW_HEIGHT - 4 }}
            >
              <div className="flex w-full items-center gap-1.5">
                <span className={cn('min-w-0 truncate text-[13px]', selected && 'text-primary')}>
                  {repo.author && <span className="text-ink-muted">{repo.author}/</span>}
                  <span className="font-medium">{repo.name}</span>
                </span>
                {repo.private && (
                  <Lock className="size-3 shrink-0 text-warning" aria-label={t('common:private')} />
                )}
                {repo.gated ? (
                  <ShieldAlert
                    className="size-3 shrink-0 text-warning"
                    aria-label={t('common:gated')}
                  />
                ) : null}
              </div>
              <div className="flex w-full items-center gap-2 text-[11.5px] text-ink-faint">
                {(repo.pipelineTag ?? repo.sdk) && (
                  <Badge variant="outline" className="px-1.5 text-[10.5px]">
                    {repo.pipelineTag ?? repo.sdk}
                  </Badge>
                )}
                {repo.paramCount !== undefined && (
                  <span className="font-mono">{formatParams(repo.paramCount)}</span>
                )}
                <span className="ml-auto flex items-center gap-0.5" title={t('browse:likes')}>
                  <Heart className="size-3" aria-hidden />
                  {formatCount(repo.likes, locale)}
                </span>
                {kind !== 'space' && (
                  <span className="flex items-center gap-0.5" title={t('browse:downloads')}>
                    <ArrowDownToLine className="size-3" aria-hidden />
                    {formatCount(repo.downloads, locale)}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
