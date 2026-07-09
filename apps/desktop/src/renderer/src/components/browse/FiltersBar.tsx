import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import type { RepoKind, RepoSort } from '@oh-my-huggingface/shared'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useAppStore, type BrowseFilters } from '@/stores/app'

const SORTS: RepoSort[] = ['trending', 'downloads', 'likes', 'updated', 'created']

export function FiltersBar({ kind }: { kind: RepoKind }): React.JSX.Element {
  const { t } = useTranslation('browse')
  const filters = useAppStore((s) => s.filters[kind])
  const setFilters = useAppStore((s) => s.setFilters)

  const chips: Array<{ key: keyof BrowseFilters; label: string }> = []
  if (filters.pipelineTag) chips.push({ key: 'pipelineTag', label: filters.pipelineTag })
  if (filters.library) chips.push({ key: 'library', label: filters.library })
  if (filters.license) chips.push({ key: 'license', label: filters.license })
  if (filters.paramBucket)
    chips.push({ key: 'paramBucket', label: t(`params.${filters.paramBucket}`) })

  return (
    <div className="flex flex-col gap-2 border-b p-2.5">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-faint"
            aria-hidden
          />
          <Input
            value={filters.search}
            onChange={(e) => setFilters(kind, { search: e.target.value })}
            placeholder={t(`searchPlaceholder.${kind}`)}
            className="pl-8"
            aria-label={t(`searchPlaceholder.${kind}`)}
          />
        </div>
        <Select
          value={filters.sort}
          onValueChange={(sort) => setFilters(kind, { sort: sort as RepoSort })}
        >
          <SelectTrigger className="w-36 shrink-0" aria-label={t('sort.label')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.filter((s) => !(kind === 'space' && s === 'downloads')).map((sort) => (
              <SelectItem key={sort} value={sort}>
                {t(`sort.${sort}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <Badge key={chip.key} variant="primary" className="gap-1 pr-1">
              {chip.label}
              <button
                type="button"
                aria-label={t('filter.clear')}
                className="rounded-full p-0.5 hover:bg-primary/20"
                onClick={() => setFilters(kind, { [chip.key]: undefined })}
              >
                <X className="size-3" aria-hidden />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
