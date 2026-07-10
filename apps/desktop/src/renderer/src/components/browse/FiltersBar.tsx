import { useTranslation } from 'react-i18next'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import type { RepoKind, RepoSort } from '@oh-my-huggingface/shared'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useAppStore, type BrowseFilters } from '@/stores/app'

const SORTS: RepoSort[] = ['trending', 'downloads', 'likes', 'updated', 'created']

/** Single-value filter fields surfaced as removable chips. */
const CHIP_KEYS = [
  'pipelineTag',
  'library',
  'license',
  'language',
  'inferenceProvider'
] as const satisfies ReadonlyArray<keyof BrowseFilters>

export function FiltersBar({ kind }: { kind: RepoKind }): React.JSX.Element {
  const { t } = useTranslation('browse')
  const filters = useAppStore((s) => s.filters[kind])
  const setFilters = useAppStore((s) => s.setFilters)
  const panelOpen = useAppStore((s) => s.filterPanelOpen)
  const setFilterPanelOpen = useAppStore((s) => s.setFilterPanelOpen)

  const chips: Array<{ id: string; label: string; onRemove: () => void }> = []
  for (const key of CHIP_KEYS) {
    const value = filters[key]
    if (value) {
      chips.push({ id: key, label: value, onRemove: () => setFilters(kind, { [key]: undefined }) })
    }
  }
  if (filters.paramBucket) {
    chips.push({
      id: 'paramBucket',
      label: t(`params.${filters.paramBucket}`),
      onRemove: () => setFilters(kind, { paramBucket: undefined })
    })
  }
  if (filters.runningOnly) {
    chips.push({
      id: 'runningOnly',
      label: t('filter.runningOnly'),
      onRemove: () => setFilters(kind, { runningOnly: undefined })
    })
  }
  if (filters.hardware) {
    chips.push({
      id: 'hardware',
      label: t(`hardware.${filters.hardware}`),
      onRemove: () => setFilters(kind, { hardware: undefined })
    })
  }
  for (const tag of filters.tags ?? []) {
    chips.push({
      id: `tag:${tag}`,
      label: tag,
      onRemove: () => {
        const next = (filters.tags ?? []).filter((v) => v !== tag)
        setFilters(kind, { tags: next.length > 0 ? next : undefined })
      }
    })
  }

  const activeCount = chips.length

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
          <SelectTrigger className="w-32 shrink-0" aria-label={t('sort.label')}>
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
        <Button
          variant="secondary"
          size="icon"
          className="relative shrink-0"
          aria-label={t('filter.title')}
          aria-pressed={panelOpen}
          onClick={() => setFilterPanelOpen(!panelOpen)}
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          {activeCount > 0 && (
            <span className="nums absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] leading-none font-semibold text-primary-ink">
              {activeCount}
            </span>
          )}
        </Button>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <Badge key={chip.id} variant="primary" className="max-w-full gap-1 pr-1">
              <span className="min-w-0 truncate">{chip.label}</span>
              <button
                type="button"
                aria-label={t('filter.clear')}
                className="rounded-full p-0.5 hover:bg-primary/20"
                onClick={chip.onRemove}
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
