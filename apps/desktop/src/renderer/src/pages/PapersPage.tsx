import { useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ExternalLink, FileText, ThumbsUp } from 'lucide-react'
import { invoke, openExternal } from '@/lib/ipc'
import { cn, formatCount, formatRelativeTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { resolveLocale, useAppStore } from '@/stores/app'

const ROW_HEIGHT = 64

export function PapersPage(): React.JSX.Element {
  const { t } = useTranslation(['papers', 'common'])
  const navigate = useNavigate()
  const params = useParams()
  const selectedId = params['*'] || undefined
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)
  const parentRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['papers'],
    queryFn: ({ pageParam }) => invoke('hub:papers', pageParam ? { cursor: pageParam } : {}),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null
  })

  const papers = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data])
  const selected = papers.find((p) => p.id === selectedId)

  const virtualizer = useVirtualizer({
    count: papers.length + (hasNextPage ? 1 : 0),
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6
  })
  const virtualItems = virtualizer.getVirtualItems()
  useEffect(() => {
    const last = virtualItems.at(-1)
    if (last && last.index >= papers.length - 1 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage()
    }
  }, [virtualItems, papers.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <div className="flex h-full min-w-0">
      <section className="flex w-[24rem] shrink-0 flex-col border-r max-[1000px]:w-80">
        <h1 className="px-4 pt-4 pb-2 text-[15px] font-semibold">{t('papers:title')}</h1>
        {isLoading ? (
          <div className="flex flex-col gap-1 p-2">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : (
          <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualItems.map((row) => {
                const paper = papers[row.index]
                if (!paper) {
                  return (
                    <div
                      key="loader"
                      className="absolute inset-x-0 flex items-center justify-center text-[12px] text-ink-faint"
                      style={{ top: row.start, height: ROW_HEIGHT }}
                    >
                      {t('common:loading')}
                    </div>
                  )
                }
                const isSelected = paper.id === selectedId
                return (
                  <button
                    key={paper.id}
                    type="button"
                    onClick={() => navigate(`/papers/${paper.id}`, { replace: true })}
                    className={cn(
                      'absolute inset-x-1 flex flex-col justify-center gap-1 rounded-md px-2.5 text-left transition-colors duration-100',
                      isSelected ? 'bg-primary/10' : 'hover:bg-panel'
                    )}
                    style={{ top: row.start + 2, height: ROW_HEIGHT - 4 }}
                  >
                    <span
                      className={cn(
                        'line-clamp-2 text-[13px] leading-tight font-medium',
                        isSelected && 'text-primary'
                      )}
                    >
                      {paper.title}
                    </span>
                    <span className="nums flex items-center gap-2 text-[11.5px] text-ink-faint">
                      <span className="flex items-center gap-0.5">
                        <ThumbsUp className="size-3" aria-hidden />
                        {formatCount(paper.upvotes, locale)}
                      </span>
                      <span>{formatRelativeTime(paper.publishedAt, locale)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </section>

      <section className="min-w-0 flex-1 overflow-y-auto">
        {selected ? (
          <article className="mx-auto flex max-w-[72ch] flex-col gap-4 p-6">
            <h1 className="text-xl leading-snug font-semibold text-balance">{selected.title}</h1>
            <div className="nums flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-muted">
              <span className="flex items-center gap-1">
                <ThumbsUp className="size-3.5" aria-hidden />
                {formatCount(selected.upvotes, locale)}
              </span>
              {selected.publishedAt && (
                <span>
                  {t('papers:published', {
                    time: formatRelativeTime(selected.publishedAt, locale)
                  })}
                </span>
              )}
            </div>
            {selected.authors.length > 0 && (
              <p className="text-[12.5px] text-ink-muted">
                <span className="font-medium text-ink">{t('papers:authors')}: </span>
                {selected.authors.join(', ')}
              </p>
            )}
            {selected.thumbnail && (
              <img
                src={selected.thumbnail}
                alt=""
                className="max-h-64 w-full rounded-lg border object-cover"
              />
            )}
            <p className="text-[13.5px] leading-[1.7] text-pretty">{selected.summary}</p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openExternal(`https://arxiv.org/abs/${selected.id}`)}
              >
                <ExternalLink className="size-3.5" aria-hidden />
                {t('papers:readOnArxiv')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openExternal(`https://huggingface.co/papers/${selected.id}`)}
              >
                <ExternalLink className="size-3.5" aria-hidden />
                {t('papers:readOnHub')}
              </Button>
            </div>
          </article>
        ) : (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState icon={FileText} title={t('papers:empty')} />
          </div>
        )}
      </section>
    </div>
  )
}
