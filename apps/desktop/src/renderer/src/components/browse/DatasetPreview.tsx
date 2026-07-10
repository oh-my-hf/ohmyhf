import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Database, ExternalLink } from 'lucide-react'
import { invoke, openExternal } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

const PAGE_SIZE = 25

function Unavailable({ repoId }: { repoId: string }): React.JSX.Element {
  const { t } = useTranslation(['detail', 'common'])
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <Database className="size-8 text-ink-faint" aria-hidden />
      <p className="max-w-96 text-[12.5px] text-ink-muted">
        {t('detail:datasetPreview.unavailable')}
      </p>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => openExternal(`https://huggingface.co/datasets/${repoId}`)}
      >
        <ExternalLink className="size-3.5" aria-hidden />
        {t('common:openOnHub')}
      </Button>
    </div>
  )
}

function TableSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5 p-3">
      <Skeleton className="h-7" />
      {Array.from({ length: 10 }, (_, i) => (
        <Skeleton key={i} className="h-6" />
      ))}
    </div>
  )
}

export function DatasetPreview({ repoId }: { repoId: string }): React.JSX.Element {
  const { t } = useTranslation('detail')
  const [config, setConfig] = useState<string | null>(null)
  const [split, setSplit] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  const splits = useQuery({
    queryKey: ['datasetSplits', repoId],
    queryFn: () => invoke('hub:datasetSplits', { repoId }),
    retry: false
  })

  const configs = useMemo(
    () => [...new Set((splits.data ?? []).map((s) => s.config))],
    [splits.data]
  )
  const activeConfig = config && configs.includes(config) ? config : configs[0]
  const splitOptions = useMemo(
    () => (splits.data ?? []).filter((s) => s.config === activeConfig).map((s) => s.split),
    [splits.data, activeConfig]
  )
  const activeSplit = split && splitOptions.includes(split) ? split : splitOptions[0]

  const rows = useQuery({
    queryKey: ['datasetRows', repoId, activeConfig, activeSplit, page],
    queryFn: () =>
      invoke('hub:datasetRows', {
        repoId,
        config: activeConfig ?? '',
        split: activeSplit ?? '',
        offset: page * PAGE_SIZE,
        length: PAGE_SIZE
      }),
    enabled: Boolean(activeConfig && activeSplit),
    placeholderData: keepPreviousData,
    retry: false
  })

  if (splits.isError || rows.isError) return <Unavailable repoId={repoId} />
  if (splits.isPending) return <TableSkeleton />
  if (splits.data.length === 0) return <Unavailable repoId={repoId} />

  const from = page * PAGE_SIZE + 1
  const to = page * PAGE_SIZE + (rows.data?.rows.length ?? 0)
  const total = rows.data?.total
  const hasNext = total !== undefined ? to < total : (rows.data?.rows.length ?? 0) === PAGE_SIZE

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Select
          value={activeConfig}
          onValueChange={(v) => {
            setConfig(v)
            setSplit(null)
            setPage(0)
          }}
        >
          <SelectTrigger className="min-w-32" aria-label={t('datasetPreview.config')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {configs.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={activeSplit}
          onValueChange={(v) => {
            setSplit(v)
            setPage(0)
          }}
        >
          <SelectTrigger className="min-w-28" aria-label={t('datasetPreview.split')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {splitOptions.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {rows.isPending && <TableSkeleton />}
        {rows.data && (
          <table
            className={cn(
              'w-full border-collapse font-mono text-[12px] transition-opacity duration-150',
              rows.isPlaceholderData && 'opacity-60'
            )}
          >
            <thead>
              <tr>
                {rows.data.columns.map((col) => (
                  <th
                    key={col}
                    className="sticky top-0 z-10 border-b border-border-card bg-panel px-3 py-2 text-left text-[11px] font-medium whitespace-nowrap text-ink-muted"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.data.rows.map((row, i) => (
                <tr key={i} className="border-b border-border-card align-top last:border-b-0 hover:bg-panel/60">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-1.5">
                      <div className="max-w-80 truncate" title={cell}>
                        {cell}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {rows.data && (
        <div className="flex items-center justify-between gap-2 border-t px-3 py-1.5">
          <span className="text-[12px] text-ink-muted">
            {total !== undefined
              ? t('datasetPreview.range', { from, to, total })
              : t('datasetPreview.rangeNoTotal', { from, to })}
          </span>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t('datasetPreview.prev')}
              disabled={page === 0 || rows.isFetching}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t('datasetPreview.next')}
              disabled={!hasNext || rows.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
