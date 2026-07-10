import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueries } from '@tanstack/react-query'
import { Columns3, Plus, X } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { formatCount, formatDate, formatParams } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { resolveLocale, useAppStore } from '@/stores/app'

const MAX_MODELS = 4

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function formatMetricValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : value.toFixed(2)
  }
  if (typeof value === 'string' && value.trim() !== '') return value
  if (typeof value === 'boolean') return String(value)
  return undefined
}

/**
 * Extracts "<dataset> · <metric>" → formatted value pairs from the untrusted,
 * unknown-shaped `model-index` card metadata.
 */
function benchmarksOf(cardData: Record<string, unknown> | undefined): Map<string, string> {
  const out = new Map<string, string>()
  const index = cardData?.['model-index']
  if (!Array.isArray(index)) return out
  for (const entry of index as unknown[]) {
    if (!isRecord(entry) || !Array.isArray(entry.results)) continue
    for (const result of entry.results as unknown[]) {
      if (!isRecord(result)) continue
      const dataset =
        isRecord(result.dataset) && typeof result.dataset.name === 'string'
          ? result.dataset.name
          : undefined
      if (!Array.isArray(result.metrics)) continue
      for (const metric of result.metrics as unknown[]) {
        if (!isRecord(metric)) continue
        const metricLabel =
          typeof metric.name === 'string' && metric.name !== ''
            ? metric.name
            : typeof metric.type === 'string' && metric.type !== ''
              ? metric.type
              : undefined
        if (!metricLabel) continue
        const value = formatMetricValue(metric.value)
        if (value === undefined) continue
        const label = dataset ? `${dataset} · ${metricLabel}` : metricLabel
        if (!out.has(label)) out.set(label, value)
      }
    }
  }
  return out
}

/** Phase D: side-by-side model comparison. */
export function ComparePage(): React.JSX.Element {
  const { t } = useTranslation(['compare', 'common'])
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)
  const [ids, setIds] = useState<string[]>([])
  const [draft, setDraft] = useState('')

  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['repo', 'model' as const, id],
      queryFn: () => invoke('hub:repoDetail', { kind: 'model', repoId: id })
    }))
  })

  const add = (): void => {
    const id = draft.trim()
    if (!id || ids.includes(id) || ids.length >= MAX_MODELS) return
    if (!/^[\w.-]+\/[\w.-]+$/.test(id)) return
    setIds([...ids, id])
    setDraft('')
  }

  // Union of benchmark rows across the compared models, in first-seen order.
  const benchmarks = results.map((r) => benchmarksOf(r.data?.cardData))
  const benchmarkLabels: string[] = []
  for (const map of benchmarks) {
    for (const label of map.keys()) {
      if (!benchmarkLabels.includes(label)) benchmarkLabels.push(label)
    }
  }

  const rows: Array<{ label: string; render: (i: number) => React.ReactNode }> = [
    {
      label: t('compare:attr.params'),
      render: (i) => {
        const v = results[i]?.data?.paramCount
        return v !== undefined ? <span className="font-mono">{formatParams(v)}</span> : '–'
      }
    },
    { label: t('compare:attr.license'), render: (i) => results[i]?.data?.license ?? '–' },
    { label: t('compare:attr.task'), render: (i) => results[i]?.data?.pipelineTag ?? '–' },
    { label: t('compare:attr.library'), render: (i) => results[i]?.data?.libraryName ?? '–' },
    {
      label: t('compare:attr.downloads'),
      render: (i) => {
        const v = results[i]?.data?.downloads
        return v !== undefined ? formatCount(v, locale) : '–'
      }
    },
    {
      label: t('compare:attr.likes'),
      render: (i) => {
        const v = results[i]?.data?.likes
        return v !== undefined ? formatCount(v, locale) : '–'
      }
    },
    {
      label: t('compare:attr.updated'),
      render: (i) => formatDate(results[i]?.data?.lastModified, locale) || '–'
    },
    {
      label: t('compare:attr.tags'),
      render: (i) => (
        <div className="flex flex-wrap gap-1">
          {(results[i]?.data?.tags ?? [])
            .filter((tag) => !tag.includes(':'))
            .slice(0, 8)
            .map((tag) => (
              <Badge key={tag} variant="outline" className="font-mono text-[10px]">
                {tag}
              </Badge>
            ))}
        </div>
      )
    }
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-5">
        <div>
          <h1 className="text-smd font-semibold text-ink-strong">{t('compare:title')}</h1>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">{t('compare:hint')}</p>
        </div>
        <div className="flex max-w-md gap-1.5">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder={t('compare:addPlaceholder')}
            disabled={ids.length >= MAX_MODELS}
          />
          <Button
            variant="secondary"
            size="icon"
            aria-label={t('compare:add')}
            onClick={add}
            disabled={draft.trim() === '' || ids.length >= MAX_MODELS}
          >
            <Plus className="size-4" aria-hidden />
          </Button>
        </div>
        {ids.length >= MAX_MODELS && (
          <p className="text-[12px] text-ink-faint">{t('compare:max')}</p>
        )}

        {ids.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center">
            <Columns3 className="size-7 text-ink-faint" aria-hidden />
            <p className="text-[12.5px] text-ink-muted">{t('compare:empty')}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="text-ink-muted">
                    <th className="w-32 border-b border-border-card bg-panel p-2.5" />
                    {ids.map((id, i) => (
                      <th
                        key={id}
                        className="min-w-44 border-b border-border-card bg-panel p-2.5 text-left align-top"
                      >
                        <div className="flex items-start gap-1">
                          <span className="min-w-0 flex-1 font-mono font-medium break-all text-ink-strong">
                            {results[i]?.isLoading ? <Skeleton className="h-4 w-24" /> : id}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-5"
                            aria-label={t('compare:remove')}
                            onClick={() => setIds(ids.filter((x) => x !== id))}
                          >
                            <X className="size-3.5" aria-hidden />
                          </Button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.label} className="border-b border-border-card last:border-b-0">
                      <td className="bg-panel/50 p-2.5 font-medium text-ink-muted">{row.label}</td>
                      {ids.map((id, i) => (
                        <td key={id} className="p-2.5 align-top">
                          {results[i]?.isLoading ? (
                            <Skeleton className="h-4 w-16" />
                          ) : (
                            row.render(i)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <section className="flex flex-col gap-2">
              <h2 className="text-[13.5px] font-semibold text-ink-strong">
                {t('compare:benchmarks.title')}
              </h2>
              {benchmarkLabels.length === 0 ? (
                <p className="text-[12px] text-ink-muted">{t('compare:benchmarks.none')}</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full border-collapse text-[13px]">
                    <tbody>
                      {benchmarkLabels.map((label) => (
                        <tr key={label} className="border-b border-border-card last:border-b-0">
                          <td className="w-64 bg-panel/50 p-2.5 font-medium text-ink-muted">
                            <div className="max-w-60 truncate" title={label}>
                              {label}
                            </div>
                          </td>
                          {ids.map((id, i) => (
                            <td key={id} className="nums min-w-44 p-2.5 align-top font-mono">
                              {results[i]?.isLoading ? (
                                <Skeleton className="h-4 w-12" />
                              ) : (
                                (benchmarks[i]?.get(label) ?? '—')
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
