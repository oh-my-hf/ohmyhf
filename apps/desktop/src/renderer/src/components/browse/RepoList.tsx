import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDownToLine, Heart, Lock, ShieldAlert } from 'lucide-react'
import type { RepoKind, RepoSummary, SearchQuery } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { hardwareBucketOf } from '@/lib/catalog'
import { TAG_HUE_VAR, taskHue } from '@/lib/tag-colors'
import { cn, formatCount, formatParams, paramBucketOf } from '@/lib/utils'
import { useDebounced } from '@/hooks/use-debounced'
import { Kbd } from '@/components/ui/kbd'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { FilterPanel } from '@/components/browse/FilterPanel'
import { SpaceCard } from '@/components/browse/SpaceCard'
import { resolveLocale, useAppStore } from '@/stores/app'

const ROW_HEIGHT = 56
/** Spaces render as a 2-up card gallery; each virtual row holds one card pair. */
const SPACE_ROW_HEIGHT = 118

/** How a row was selected — clicks push history, keyboard bursts replace. */
export type SelectVia = 'pointer' | 'keyboard'

interface RepoListProps {
  kind: RepoKind
  selectedId: string | undefined
  onSelect: (repo: RepoSummary, via: SelectVia) => void
}

export function RepoList({ kind, selectedId, onSelect }: RepoListProps): React.JSX.Element {
  const { t } = useTranslation(['browse', 'common'])
  const filters = useAppStore((s) => s.filters[kind])
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const filterPanelOpen = useAppStore((s) => s.filterPanelOpen)
  const locale = resolveLocale(settings, appInfo)
  const search = useDebounced(filters.search, 250)
  const parentRef = useRef<HTMLDivElement>(null)
  const isSpace = kind === 'space'
  const perRow = isSpace ? 2 : 1

  const query: SearchQuery = useMemo(() => {
    // The Hub indexes languages as plain tags ("en"), so the language filter joins raw tags.
    const languageTag = filters.language
      ? kind === 'dataset'
        ? `language:${filters.language}`
        : filters.language
      : undefined
    const tags = [...(filters.tags ?? []), ...(languageTag ? [languageTag] : [])]
    return {
      kind,
      search: search || undefined,
      pipelineTag: filters.pipelineTag,
      library: filters.library,
      license: filters.license,
      tags: tags.length > 0 ? tags : undefined,
      inferenceProvider: filters.inferenceProvider,
      sort: filters.sort,
      limit: 30
    }
  }, [
    kind,
    search,
    filters.pipelineTag,
    filters.library,
    filters.license,
    filters.tags,
    filters.language,
    filters.inferenceProvider,
    filters.sort
  ])

  const { data, error, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useInfiniteQuery({
      queryKey: ['search', query],
      queryFn: ({ pageParam }) =>
        invoke('hub:search', { query: pageParam ? { ...query, cursor: pageParam } : query }),
      initialPageParam: '',
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? null
    })

  const items = useMemo(() => {
    let all = data?.pages.flatMap((p) => p.items) ?? []
    // Parameter-count filtering is client-side (the public API has no param filter).
    if (filters.paramBucket) {
      all = all.filter((item) => paramBucketOf(item.paramCount) === filters.paramBucket)
    }
    // Space status/hardware are client-side too — the search API exposes neither.
    if (isSpace && filters.runningOnly) {
      all = all.filter((item) => item.runtimeStage === 'RUNNING')
    }
    if (isSpace && filters.hardware) {
      all = all.filter((item) => hardwareBucketOf(item.hardware) === filters.hardware)
    }
    return all
  }, [data, isSpace, filters.paramBucket, filters.runningOnly, filters.hardware])

  const rowCount = Math.ceil(items.length / perRow)
  const rowHeight = isSpace ? SPACE_ROW_HEIGHT : ROW_HEIGHT

  const virtualizer = useVirtualizer({
    count: rowCount + (hasNextPage ? 1 : 0),
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 8
  })

  // estimateSize changes with the kind; flush cached row measurements.
  useEffect(() => {
    virtualizer.measure()
  }, [virtualizer, rowHeight])

  const virtualItems = virtualizer.getVirtualItems()
  useEffect(() => {
    const last = virtualItems.at(-1)
    if (last && last.index >= rowCount - 1 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage()
    }
  }, [virtualItems, rowCount, hasNextPage, isFetchingNextPage, fetchNextPage])

  const selectByOffset = useCallback(
    (offset: number): void => {
      if (items.length === 0) return
      const currentIndex = items.findIndex((i) => i.id === selectedId)
      const nextIndex = Math.max(0, Math.min(items.length - 1, currentIndex + offset))
      const next = items[nextIndex]
      if (next) {
        onSelect(next, 'keyboard')
        virtualizer.scrollToIndex(Math.floor(nextIndex / perRow), { align: 'auto' })
      }
    },
    [items, selectedId, onSelect, virtualizer, perRow]
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

  let content: React.JSX.Element
  if (isLoading) {
    content = (
      <div className="flex flex-col gap-1 p-2">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="flex h-[52px] flex-col justify-center gap-1.5 px-2">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    )
  } else if (error) {
    const rateLimited = /429|rate.?limit/i.test(error.message)
    content = (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="max-w-72 text-[13px] text-ink-muted">
          {rateLimited ? t('browse:error.rateLimited') : t('common:error.network')}
        </p>
        <Button size="sm" onClick={() => void refetch()}>
          {t('common:retry')}
        </Button>
      </div>
    )
  } else if (items.length === 0) {
    content = (
      <div className="flex flex-col items-center gap-1 p-8 text-center">
        <p className="text-[13.5px] font-medium">{t('browse:empty.title')}</p>
        <p className="text-[12.5px] text-ink-muted">{t('browse:empty.body')}</p>
      </div>
    )
  } else {
    content = (
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
            if (row.index >= rowCount) {
              return (
                <div
                  key="loader"
                  className="absolute inset-x-0 flex items-center justify-center text-[12px] text-ink-faint"
                  style={{ top: row.start, height: rowHeight }}
                >
                  {isFetchingNextPage ? t('common:loading') : t('browse:endOfResults')}
                </div>
              )
            }
            if (isSpace) {
              const pair = items.slice(row.index * perRow, row.index * perRow + perRow)
              return (
                <div
                  key={row.key}
                  role="presentation"
                  className="absolute inset-x-2 grid grid-cols-2 gap-2"
                  style={{ top: row.start + 3, height: SPACE_ROW_HEIGHT - 6 }}
                >
                  {pair.map((repo) => (
                    <SpaceCard
                      key={repo.id}
                      repo={repo}
                      selected={repo.id === selectedId}
                      onSelect={(r) => onSelect(r, 'pointer')}
                      locale={locale}
                    />
                  ))}
                </div>
              )
            }
            const repo = items[row.index]
            if (!repo) return null
            const selected = repo.id === selectedId
            const chipLabel = repo.pipelineTag ?? repo.sdk
            return (
              <button
                key={repo.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onSelect(repo, 'pointer')}
                className={cn(
                  'group absolute inset-x-1 flex flex-col justify-center gap-0.5 rounded-lg px-2.5 text-left transition-colors duration-100',
                  selected ? 'bg-select/10' : 'hover:bg-panel'
                )}
                style={{ top: row.start + 2, height: ROW_HEIGHT - 4 }}
              >
                <div className="flex w-full items-center gap-1.5">
                  {/* Mono repo id with the HF hover recolor (indigo light / yellow dark). */}
                  <span
                    className={cn(
                      'min-w-0 truncate font-mono text-[12.5px] tracking-tight text-ink-strong transition-colors duration-100 group-hover:text-hover-title',
                      selected && 'text-select'
                    )}
                  >
                    {repo.author && <span>{repo.author}/</span>}
                    <span className="font-medium">{repo.name}</span>
                  </span>
                  {repo.private && (
                    <Lock
                      className="size-3 shrink-0 text-warning"
                      aria-label={t('common:private')}
                    />
                  )}
                  {repo.gated ? (
                    <ShieldAlert
                      className="size-3 shrink-0 text-warning"
                      aria-label={t('common:gated')}
                    />
                  ) : null}
                </div>
                <div className="flex w-full items-center gap-1.5 text-[11.5px] text-ink-faint">
                  {chipLabel && (
                    <span className="flex min-w-0 items-center gap-1">
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ background: TAG_HUE_VAR[taskHue(chipLabel)] }}
                        aria-hidden
                      />
                      <span className="truncate">{chipLabel}</span>
                    </span>
                  )}
                  {repo.paramCount !== undefined && (
                    <>
                      {chipLabel && (
                        <span className="text-decor" aria-hidden>
                          ·
                        </span>
                      )}
                      <span className="nums font-mono text-[11px]">
                        {formatParams(repo.paramCount)}
                      </span>
                    </>
                  )}
                  <span className="ml-auto flex items-center gap-0.5" title={t('browse:likes')}>
                    <Heart className="size-3" aria-hidden />
                    {formatCount(repo.likes, locale)}
                  </span>
                  <span className="text-decor" aria-hidden>
                    ·
                  </span>
                  <span className="flex items-center gap-0.5" title={t('browse:downloads')}>
                    <ArrowDownToLine className="size-3" aria-hidden />
                    {formatCount(repo.downloads, locale)}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // Relative wrapper hosts the filter sidebar, which overlays the result list.
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {content}
      {!isLoading && !error && items.length > 0 && (
        <div className="flex shrink-0 items-center gap-1 border-t border-border-card px-3 py-1.5 text-[10.5px] text-ink-faint">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          <Kbd>J</Kbd>
          <Kbd>K</Kbd>
          <span className="ml-0.5">{t('browse:listHint')}</span>
        </div>
      )}
      {filterPanelOpen && <FilterPanel kind={kind} />}
    </div>
  )
}
