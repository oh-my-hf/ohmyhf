import { useTranslation } from 'react-i18next'
import type { RepoDetail } from '@oh-my-huggingface/shared'
import { formatBytes, formatCount, formatDate, formatParams } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { resolveLocale, useAppStore } from '@/stores/app'

export function InfoPanel({ detail }: { detail: RepoDetail }): React.JSX.Element {
  const { t } = useTranslation('detail')
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)

  const rows: Array<[string, React.ReactNode]> = []
  if (detail.paramCount !== undefined)
    rows.push([t('info.params'), <span className="font-mono">{formatParams(detail.paramCount)}</span>])
  if (detail.license) rows.push([t('info.license'), detail.license])
  if (detail.pipelineTag) rows.push([t('info.task'), detail.pipelineTag])
  if (detail.libraryName) rows.push([t('info.library'), detail.libraryName])
  if (detail.sdk) rows.push([t('info.sdk'), detail.sdk])
  if (detail.sha)
    rows.push([t('info.sha'), <span className="font-mono text-[12px]">{detail.sha.slice(0, 12)}</span>])
  if (detail.lastModified) rows.push([t('info.updated'), formatDate(detail.lastModified, locale)])
  if (detail.createdAt) rows.push([t('info.created'), formatDate(detail.createdAt, locale)])
  if (detail.usedStorage !== undefined && detail.usedStorage > 0)
    rows.push([t('info.storage'), formatBytes(detail.usedStorage)])
  if (detail.downloadsAllTime !== undefined && detail.downloadsAllTime > 0)
    rows.push([
      t('info.downloadsAllTime'),
      <span className="nums">{formatCount(detail.downloadsAllTime, locale)}</span>
    ])

  return (
    <div className="flex flex-col gap-5 p-4">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-[13px]">
        {rows.map(([label, value], i) => (
          <div key={i} className="contents">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {detail.tags.length > 0 && (
        <div>
          <div className="mb-2 text-[12px] font-medium text-ink-muted">{t('info.tags')}</div>
          <div className="flex max-w-[72ch] flex-wrap gap-1.5">
            {detail.tags.slice(0, 40).map((tag) => (
              <Badge key={tag} variant="outline" className="font-mono text-[10.5px]">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
