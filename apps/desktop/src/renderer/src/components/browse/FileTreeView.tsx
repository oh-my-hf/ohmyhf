import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowDownToLine, ChevronRight, File, Folder, Share } from 'lucide-react'
import type { ExportTool, FileTreeEntry, RepoKind } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { formatBytes } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useToasts } from '@/components/ui/toaster'
import { FilePreview } from '@/components/browse/FilePreview'

const TOOL_LABELS: Record<ExportTool, string> = {
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  comfyui: 'ComfyUI'
}

export function FileTreeView({
  kind,
  repoId
}: {
  kind: RepoKind
  repoId: string
}): React.JSX.Element {
  const { t } = useTranslation(['detail', 'common', 'integrations'])
  const [path, setPath] = useState('')
  const [preview, setPreview] = useState<FileTreeEntry | null>(null)
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
      invoke('export:run', { tool: args.tool, repoId, filePath: args.filePath }),
    onSuccess: (res) =>
      push(t(`integrations:${res.messageKey}`, res.params), res.ok ? 'success' : 'info')
  })

  const crumbs = path ? path.split('/') : []

  if (preview) {
    return (
      <FilePreview
        kind={kind}
        repoId={repoId}
        entry={preview}
        onBack={() => setPreview(null)}
        onDownload={() => download.mutate([preview.path])}
        downloading={download.isPending}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
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

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
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
          const isGguf = name.toLowerCase().endsWith('.gguf')
          return (
            <div
              key={entry.path}
              className="group flex h-8 items-center gap-2 rounded-md px-2 hover:bg-panel"
            >
              {entry.type === 'directory' ? (
                <button
                  type="button"
                  onClick={() => setPath(entry.path)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <Folder className="size-4 shrink-0 text-info" aria-hidden />
                  <span className="min-w-0 truncate text-[13px] font-medium">{name}</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setPreview(entry)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <File className="size-4 shrink-0 text-ink-faint" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{name}</span>
                  </button>
                  {entry.lfs && (
                    <Badge variant="outline" className="text-[10px]">
                      {t('detail:files.lfs')}
                    </Badge>
                  )}
                  <span className="w-16 text-right font-mono text-[11.5px] text-ink-faint">
                    {formatBytes(entry.size)}
                  </span>
                  {isGguf && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                          aria-label={t('detail:files.export')}
                        >
                          <Share className="size-3.5" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {targets.data?.filter((target) => target.detected).length === 0 && (
                          <DropdownMenuItem disabled>
                            {t('detail:files.noTargets')}
                          </DropdownMenuItem>
                        )}
                        {targets.data
                          ?.filter((target) => target.detected)
                          .map((target) => (
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
                    className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
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
  )
}
