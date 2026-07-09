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

/**
 * Phase D: side-by-side model comparison.
 * TODO(phase-d): pull benchmark scores from model-index card metadata into rows.
 */
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
          <h1 className="text-[15px] font-semibold">{t('compare:title')}</h1>
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
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="w-32 border-b bg-panel p-2.5" />
                  {ids.map((id, i) => (
                    <th key={id} className="min-w-44 border-b bg-panel p-2.5 text-left align-top">
                      <div className="flex items-start gap-1">
                        <span className="min-w-0 flex-1 font-medium break-all">
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
                  <tr key={row.label} className="border-b last:border-b-0">
                    <td className="bg-panel/50 p-2.5 font-medium text-ink-muted">{row.label}</td>
                    {ids.map((id, i) => (
                      <td key={id} className="p-2.5 align-top">
                        {results[i]?.isLoading ? <Skeleton className="h-4 w-16" /> : row.render(i)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11.5px] text-ink-faint">{t('compare:benchmarksTodo')}</p>
      </div>
    </div>
  )
}
