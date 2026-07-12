import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowDownToLine, ChevronRight, File, FileSearch, Folder, Share } from 'lucide-react'
import type { ExportTool, FileTreeEntry, RepoKind } from '@oh-my-huggingface/shared'
import { describeError } from '@/lib/errors'
import { invoke } from '@/lib/ipc'
import { cn, formatBytes } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useToasts } from '@/components/ui/toaster'
import { FilePreview } from '@/components/browse/FilePreview'

const TOOL_LABELS: Record<ExportTool, string> = {
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  comfyui: 'ComfyUI'
}

/**
 * File types each target ingests (mirrors main/integrations/export.ts):
 * Ollama builds from a single GGUF, LM Studio's models dir loads GGUF, and
 * ComfyUI's models/* folders take the usual weight formats.
 */
const TOOL_EXTENSIONS: Record<ExportTool, string[]> = {
  ollama: ['.gguf'],
  lmstudio: ['.gguf'],
  comfyui: ['.safetensors', '.ckpt', '.pt', '.pth', '.bin', '.gguf']
}

/** Export tools that can ingest the given file, by extension. */
export function exportToolsFor(name: string): ExportTool[] {
  const lower = name.toLowerCase()
  return (Object.keys(TOOL_EXTENSIONS) as ExportTool[]).filter((tool) =>
    TOOL_EXTENSIONS[tool].some((ext) => lower.endsWith(ext))
  )
}

export function FileTreeView({
  kind,
  repoId
}: {
  kind: RepoKind
  repoId: string
}): React.JSX.Element {
  const { t } = useTranslation(['detail', 'common', 'integrations', 'errors'])
  const [path, setPath] = useState('')
  // Selection is a full repo-relative path (plus the entry metadata the preview
  // header needs), independent of the browsed directory. It only resets when
  // repoId changes because the parent keys RepoDetail — and thus this
  // component — by repoId.
  const [selected, setSelected] = useState<FileTreeEntry | null>(null)
  const push = useToasts((s) => s.push)

  const tree = useQuery({
    queryKey: ['tree', kind, repoId, path],
    queryFn: () => invoke('hub:fileTree', { kind, repoId, path: path || undefined })
  })
  const targets = useQuery({
    queryKey: ['export-targets'],
    queryFn: () => invoke('export:targets', undefined),
    staleTime: 5 * 60_000
  })

  const download = useMutation({
    mutationFn: (files: string[]) =>
      invoke('downloads:start', { request: { repoId, kind, files } }),
    onSuccess: () => push(t('detail:downloadStarted'), 'success'),
    onError: (err) => push(t('detail:downloadFailed', { error: err.message }), 'error')
  })
  const exportRun = useMutation({
    mutationFn: (args: { tool: ExportTool; filePath: string }) =>
      invoke('export:run', { tool: args.tool, kind, repoId, filePath: args.filePath }),
    onSuccess: (res) =>
      push(t(`integrations:${res.messageKey}`, res.params), res.ok ? 'success' : 'error'),
    onError: (err) => push(describeError(t, err), 'error')
  })

  const crumbs = path ? path.split('/') : []
  const files = tree.data?.filter((entry) => entry.type === 'file') ?? []

  // ArrowUp/Down moves the file selection within the current directory listing
  // when focus sits inside the tree (row buttons bubble here). Skip events a
  // descendant already claimed (e.g. the Radix dropdown trigger).
  const onListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    if (event.defaultPrevented || files.length === 0) return
    event.preventDefault()
    const delta = event.key === 'ArrowDown' ? 1 : -1
    const index = files.findIndex((entry) => entry.path === selected?.path)
    const next =
      index === -1
        ? delta === 1
          ? 0
          : files.length - 1
        : Math.min(Math.max(index + delta, 0), files.length - 1)
    const entry = files[next]
    if (!entry) return
    setSelected(entry)
    event.currentTarget
      .querySelector(`[data-path="${CSS.escape(entry.path)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <div className="flex h-full min-w-0">
      <div className="flex w-72 min-w-56 flex-col border-r">
        <div className="flex flex-wrap items-center gap-1 border-b px-3 py-2 text-[12.5px] text-ink-muted">
          <button
            type="button"
            onClick={() => setPath('')}
            className="rounded px-1 hover:bg-panel hover:text-ink"
          >
            {t('detail:files.root')}
          </button>
          {crumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="size-3 text-ink-faint" aria-hidden />
              <button
                type="button"
                onClick={() => setPath(crumbs.slice(0, i + 1).join('/'))}
                className="rounded px-1 hover:bg-panel hover:text-ink"
              >
                {crumb}
              </button>
            </span>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5" onKeyDown={onListKeyDown}>
          {tree.isLoading && (
            <div className="flex flex-col gap-1 p-1">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-8" />
              ))}
            </div>
          )}
          {tree.error && (
            <div className="p-6 text-center text-[13px] text-ink-muted">
              {t('common:error.network')}
            </div>
          )}
          {tree.data?.length === 0 && (
            <div className="p-6 text-center text-[13px] text-ink-muted">
              {t('detail:files.empty')}
            </div>
          )}
          {tree.data?.map((entry) => {
            const name = entry.path.split('/').at(-1) ?? entry.path
            const exportTools = exportToolsFor(name)
            const validTargets =
              targets.data?.filter(
                (target) => target.detected && exportTools.includes(target.tool)
              ) ?? []
            const isSelected = entry.type === 'file' && entry.path === selected?.path
            return (
              <div
                key={entry.path}
                data-path={entry.path}
                className={cn(
                  'group flex h-8 items-center gap-2 rounded-md px-2',
                  isSelected ? 'bg-select/10' : 'hover:bg-panel'
                )}
              >
                {entry.type === 'directory' ? (
                  <button
                    type="button"
                    onClick={() => setPath(entry.path)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <Folder className="size-4 shrink-0 text-ink-muted" aria-hidden />
                    <span className="min-w-0 truncate text-[13px] font-medium">{name}</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setSelected(entry)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <File
                        className={cn(
                          'size-4 shrink-0',
                          isSelected ? 'text-select' : 'text-ink-faint'
                        )}
                        aria-hidden
                      />
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate font-mono text-[12.5px]',
                          isSelected && 'text-select'
                        )}
                      >
                        {name}
                      </span>
                    </button>
                    {entry.lfs && (
                      <Badge variant="outline" className="text-[10px]">
                        {t('detail:files.lfs')}
                      </Badge>
                    )}
                    <span className="w-16 text-right font-mono text-[11.5px] text-ink-faint">
                      {formatBytes(entry.size)}
                    </span>
                    {exportTools.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 text-ink-faint"
                            aria-label={t('detail:files.export')}
                          >
                            <Share className="size-3.5" aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {targets.data && validTargets.length === 0 && (
                            <DropdownMenuItem disabled>
                              {t('detail:files.noTargets')}
                            </DropdownMenuItem>
                          )}
                          {validTargets.map((target) => (
                            <DropdownMenuItem
                              key={target.tool}
                              onSelect={() =>
                                exportRun.mutate({ tool: target.tool, filePath: entry.path })
                              }
                            >
                              {t('detail:files.exportTo', { tool: TOOL_LABELS[target.tool] })}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-ink-faint"
                      aria-label={t('detail:files.download')}
                      loading={download.isPending}
                      onClick={() => download.mutate([entry.path])}
                    >
                      <ArrowDownToLine className="size-3.5" aria-hidden />
                    </Button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {selected ? (
        <div className="min-w-0 flex-1">
          <FilePreview
            key={selected.path}
            kind={kind}
            repoId={repoId}
            entry={selected}
            onDownload={() => download.mutate([selected.path])}
            downloading={download.isPending}
          />
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center justify-center">
          <EmptyState
            icon={FileSearch}
            title={t('detail:preview.pickFile')}
            body={t('detail:preview.pickFileBody')}
          />
        </div>
      )}
    </div>
  )
}
