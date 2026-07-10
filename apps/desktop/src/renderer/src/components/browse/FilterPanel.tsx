import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import type { RepoKind } from '@oh-my-huggingface/shared'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  DATASET_FORMATS,
  DATASET_MODALITIES,
  DATASET_SIZES,
  LANGUAGES,
  LIBRARIES,
  LICENSES,
  MCP_TAG,
  MODEL_OTHER_TAGS,
  PARAM_BUCKETS,
  PROVIDERS,
  SPACE_HARDWARE,
  SPACE_SDKS,
  TASKS
} from '@/lib/catalog'
import { TAG_HUE_VAR, taskHue } from '@/lib/tag-colors'
import { useAppStore, type BrowseFilters } from '@/stores/app'

/** Single-value BrowseFilters fields the panel toggles (multi-select lives in `tags`). */
type SingleKey =
  'pipelineTag' | 'library' | 'license' | 'paramBucket' | 'language' | 'inferenceProvider'

function Chip({
  selected,
  dot,
  onClick,
  children
}: {
  selected: boolean
  dot?: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] leading-4 transition-colors duration-150',
        selected
          ? 'border-select/25 bg-select/10 font-medium text-select'
          : 'text-ink-muted hover:bg-panel'
      )}
    >
      {dot && (
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: dot }} aria-hidden />
      )}
      {children}
    </button>
  )
}

function Section({
  title,
  hint,
  children
}: {
  title: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section>
      <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-ink-faint uppercase">
        {title}
        {hint && <span className="ml-1.5 font-normal normal-case tracking-normal">{hint}</span>}
      </h3>
      <div className="flex flex-wrap gap-1">{children}</div>
    </section>
  )
}

export function FilterPanel({ kind }: { kind: RepoKind }): React.JSX.Element {
  const { t } = useTranslation(['browse', 'common'])
  const filters = useAppStore((s) => s.filters[kind])
  const setFilters = useAppStore((s) => s.setFilters)
  const setFilterPanelOpen = useAppStore((s) => s.setFilterPanelOpen)

  const tags = filters.tags ?? []
  /** Toggle a raw `filter=` tag; `exclusivePrefix` makes the group single-select. */
  const toggleTag = (tag: string, exclusivePrefix?: string): void => {
    const next = tags.includes(tag)
      ? tags.filter((v) => v !== tag)
      : [...(exclusivePrefix ? tags.filter((v) => !v.startsWith(exclusivePrefix)) : tags), tag]
    setFilters(kind, { tags: next.length > 0 ? next : undefined })
  }
  const toggleField = (key: SingleKey, value: BrowseFilters[SingleKey]): void => {
    setFilters(kind, { [key]: filters[key] === value ? undefined : value })
  }

  const clearAll = (): void =>
    setFilters(kind, {
      pipelineTag: undefined,
      library: undefined,
      license: undefined,
      paramBucket: undefined,
      language: undefined,
      inferenceProvider: undefined,
      tags: undefined,
      runningOnly: undefined,
      hardware: undefined
    })

  const languages = (
    <Section title={t('browse:filter.languages')}>
      {LANGUAGES.map((code) => (
        <Chip
          key={code}
          selected={filters.language === code}
          onClick={() => toggleField('language', code)}
        >
          {code}
        </Chip>
      ))}
    </Section>
  )

  const licenses = (
    <Section title={t('browse:filter.licenses')}>
      {LICENSES.map((license) => (
        <Chip
          key={license}
          selected={filters.license === license}
          onClick={() => toggleField('license', license)}
        >
          {license}
        </Chip>
      ))}
    </Section>
  )

  return (
    <div className="animate-fade-rise absolute inset-0 z-20 flex flex-col bg-bg">
      <div className="flex items-center justify-between border-b py-1.5 pr-1.5 pl-3">
        <h2 className="text-[12.5px] font-semibold">{t('browse:filter.title')}</h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t('common:close')}
          onClick={() => setFilterPanelOpen(false)}
        >
          <X className="size-3.5" aria-hidden />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {kind === 'model' && (
          <>
            <Section title={t('browse:filter.tasks')}>
              {TASKS.map((task) => (
                <Chip
                  key={task}
                  selected={filters.pipelineTag === task}
                  dot={TAG_HUE_VAR[taskHue(task)]}
                  onClick={() => toggleField('pipelineTag', task)}
                >
                  {task}
                </Chip>
              ))}
            </Section>
            <Section title={t('browse:filter.params')} hint={t('browse:filter.clientSide')}>
              {PARAM_BUCKETS.map((bucket) => (
                <Chip
                  key={bucket}
                  selected={filters.paramBucket === bucket}
                  onClick={() => toggleField('paramBucket', bucket)}
                >
                  {t(`browse:params.${bucket}`)}
                </Chip>
              ))}
            </Section>
            <Section title={t('browse:filter.libraries')}>
              {LIBRARIES.map((library) => (
                <Chip
                  key={library}
                  selected={filters.library === library}
                  onClick={() => toggleField('library', library)}
                >
                  {library}
                </Chip>
              ))}
            </Section>
            {licenses}
            {languages}
            <Section title={t('browse:filter.inferenceProviders')}>
              {PROVIDERS.map((provider) => (
                <Chip
                  key={provider}
                  selected={filters.inferenceProvider === provider}
                  onClick={() => toggleField('inferenceProvider', provider)}
                >
                  {provider}
                </Chip>
              ))}
            </Section>
            <Section title={t('browse:filter.other')}>
              {MODEL_OTHER_TAGS.map((tag) => (
                <Chip key={tag} selected={tags.includes(tag)} onClick={() => toggleTag(tag)}>
                  {tag}
                </Chip>
              ))}
            </Section>
          </>
        )}

        {kind === 'dataset' && (
          <>
            <Section title={t('browse:datasetFilter.modalities')}>
              {DATASET_MODALITIES.map((modality) => (
                <Chip
                  key={modality}
                  selected={tags.includes(`modality:${modality}`)}
                  onClick={() => toggleTag(`modality:${modality}`)}
                >
                  {modality}
                </Chip>
              ))}
            </Section>
            <Section title={t('browse:datasetFilter.size.label')}>
              {DATASET_SIZES.map(({ tag, labelKey }) => (
                <Chip
                  key={tag}
                  selected={tags.includes(tag)}
                  onClick={() => toggleTag(tag, 'size_categories:')}
                >
                  {t(`browse:datasetFilter.size.${labelKey}`)}
                </Chip>
              ))}
            </Section>
            <Section title={t('browse:datasetFilter.format')}>
              {DATASET_FORMATS.map((format) => (
                <Chip
                  key={format}
                  selected={tags.includes(`format:${format}`)}
                  onClick={() => toggleTag(`format:${format}`)}
                >
                  {format}
                </Chip>
              ))}
            </Section>
            <Section title={t('browse:filter.tasks')}>
              {TASKS.map((task) => (
                <Chip
                  key={task}
                  selected={tags.includes(`task_categories:${task}`)}
                  dot={TAG_HUE_VAR[taskHue(task)]}
                  onClick={() => toggleTag(`task_categories:${task}`)}
                >
                  {task}
                </Chip>
              ))}
            </Section>
            {languages}
            {licenses}
          </>
        )}

        {kind === 'space' && (
          <>
            <Section title={t('browse:filter.status')} hint={t('browse:filter.clientSide')}>
              <label className="flex cursor-pointer items-center gap-2 py-0.5 text-[12.5px] text-ink-muted">
                <Switch
                  checked={filters.runningOnly ?? false}
                  onCheckedChange={(checked) =>
                    setFilters(kind, { runningOnly: checked || undefined })
                  }
                />
                {t('browse:filter.runningOnly')}
              </label>
            </Section>
            <Section title={t('browse:filter.sdk')}>
              {SPACE_SDKS.map((sdk) => (
                <Chip key={sdk} selected={tags.includes(sdk)} onClick={() => toggleTag(sdk)}>
                  {sdk}
                </Chip>
              ))}
            </Section>
            <Section title={t('browse:filter.hardware')} hint={t('browse:filter.clientSide')}>
              {SPACE_HARDWARE.map((hw) => (
                <Chip
                  key={hw}
                  selected={filters.hardware === hw}
                  onClick={() =>
                    setFilters(kind, { hardware: filters.hardware === hw ? undefined : hw })
                  }
                >
                  {t(`browse:hardware.${hw}`)}
                </Chip>
              ))}
            </Section>
            <Section title={t('browse:filter.options')}>
              <Chip selected={tags.includes(MCP_TAG)} onClick={() => toggleTag(MCP_TAG)}>
                {t('browse:filter.mcp')}
              </Chip>
            </Section>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t p-2">
        <Button variant="ghost" size="sm" onClick={clearAll}>
          {t('browse:filter.clearAll')}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setFilterPanelOpen(false)}>
          {t('browse:filter.done')}
        </Button>
      </div>
    </div>
  )
}
