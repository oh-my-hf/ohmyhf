import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, FileDiff } from 'lucide-react'
import { displayPath, type DiffFile, type DiffLineKind } from '@/lib/diff'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'

// Glyphs live outside JSX so eslint-plugin-i18next never sees them as literals.
const PLUS = '+'
const MINUS = '−'
const RENAME_ARROW = ' → '

const LINE_MARKER: Record<DiffLineKind, string> = {
  add: PLUS,
  del: MINUS,
  context: ' ',
  meta: ''
}

const LINE_CLASS: Record<DiffLineKind, string | undefined> = {
  add: 'bg-success/10',
  del: 'bg-error/10',
  context: undefined,
  meta: 'text-ink-faint'
}

const MARKER_CLASS: Record<DiffLineKind, string> = {
  add: 'text-success',
  del: 'text-error',
  context: 'text-ink-faint',
  meta: 'text-ink-faint'
}

/** Files past this index start collapsed so huge PRs stay responsive. */
const AUTO_EXPAND_LIMIT = 10

/** Compact "+N −N" counter used in file headers and the Files-changed tab label. */
export function DiffStat({
  additions,
  deletions,
  className
}: {
  additions: number
  deletions: number
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'nums inline-flex shrink-0 items-center gap-1 font-mono text-[11px]',
        className
      )}
    >
      <span className="text-success">{PLUS + String(additions)}</span>
      <span className="text-error">{MINUS + String(deletions)}</span>
    </span>
  )
}

function FileSection({
  file,
  defaultOpen
}: {
  file: DiffFile
  defaultOpen: boolean
}): React.JSX.Element {
  const { t } = useTranslation(['detail'])
  const [open, setOpen] = useState(defaultOpen)
  const Chevron = open ? ChevronDown : ChevronRight
  const title = file.isRename ? file.oldPath + RENAME_ARROW + file.newPath : displayPath(file)
  const hasBody = !file.isBinary && file.hunks.length > 0

  return (
    <section className="overflow-hidden rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 bg-panel px-2.5 py-1.5 text-left transition-colors duration-150 hover:bg-panel-2"
      >
        <Chevron className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink" title={title}>
          {title}
        </span>
        {file.isRename && <Badge variant="outline">{t('detail:pr.renamed')}</Badge>}
        {file.isBinary ? (
          <Badge variant="outline">{t('detail:pr.binary')}</Badge>
        ) : (
          <DiffStat additions={file.additions} deletions={file.deletions} />
        )}
      </button>
      {open && hasBody && (
        <div className="overflow-x-auto border-t">
          {file.hunks.map((hunk, hunkIndex) => (
            <div key={hunkIndex}>
              {/* Plain styled rows on purpose: shiki per line is too slow for big diffs. */}
              <div className="w-max min-w-full bg-panel px-2.5 py-1 font-mono text-[11px] whitespace-pre text-ink-faint">
                {hunk.header}
              </div>
              {hunk.lines.map((line, lineIndex) => (
                <div
                  key={lineIndex}
                  className={cn(
                    'flex w-max min-w-full font-mono text-[12px] leading-5 whitespace-pre',
                    LINE_CLASS[line.kind]
                  )}
                >
                  <span
                    className={cn('w-6 shrink-0 text-center select-none', MARKER_CLASS[line.kind])}
                    aria-hidden
                  >
                    {LINE_MARKER[line.kind]}
                  </span>
                  <span className="pr-3">{line.text}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function DiffView({
  files,
  truncated
}: {
  files: DiffFile[]
  truncated?: boolean
}): React.JSX.Element {
  const { t } = useTranslation(['detail'])

  if (files.length === 0) {
    return <EmptyState icon={FileDiff} title={t('detail:pr.noDiff')} />
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      {truncated === true && (
        <div className="rounded-md border border-warning/40 bg-warning/15 px-3 py-2 text-[12.5px] text-ink">
          {t('detail:pr.diffTruncated')}
        </div>
      )}
      {files.map((file, index) => (
        <FileSection
          key={`${index}:${file.oldPath}:${file.newPath}`}
          file={file}
          defaultOpen={index < AUTO_EXPAND_LIMIT}
        />
      ))}
    </div>
  )
}
