import { useTranslation } from 'react-i18next'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import type { RepoKind, RepoSort } from '@oh-my-huggingface/shared'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { TAG_HUE_VAR, taskHue } from '@/lib/tag-colors'
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

  const chips: Array<{ id: string; label: string; dot?: string; onRemove: () => void }> = []
  for (const key of CHIP_KEYS) {
    const value = filters[key]
    if (value) {
      chips.push({
        id: key,
        label: value,
        dot: key === 'pipelineTag' ? TAG_HUE_VAR[taskHue(value)] : undefined,
        onRemove: () => setFilters(kind, { [key]: undefined })
      })
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
            data-list-search=""
            value={filters.search}
            onChange={(e) => setFilters(kind, { search: e.target.value })}
            placeholder={t(`searchPlaceholder.${kind}`)}
            className={cn('pl-8', !filters.search && 'pr-7 max-[1000px]:pr-2.5')}
            aria-label={t(`searchPlaceholder.${kind}`)}
          />
          {!filters.search && (
            <Kbd
              className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 max-[1000px]:hidden"
              aria-hidden
            >
              /
            </Kbd>
          )}
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
            <span className="nums absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-brand px-1 text-[9px] leading-none font-semibold text-brand-ink">
              {activeCount}
            </span>
          )}
        </Button>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.id}
              className="flex h-6 max-w-full min-w-0 items-center gap-1 rounded-lg border bg-linear-to-b from-btn-from to-btn-to pl-2 pr-1 text-[11.5px] text-ink"
            >
              {chip.dot && (
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: chip.dot }}
                  aria-hidden
                />
              )}
              <span className="min-w-0 truncate">{chip.label}</span>
              <button
                type="button"
                aria-label={t('filter.clear')}
                className="rounded-full p-0.5 text-ink-muted transition-colors duration-150 hover:bg-panel-2 hover:text-ink"
                onClick={chip.onRemove}
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
