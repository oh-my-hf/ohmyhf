import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownToLine,
  ExternalLink,
  FileQuestion,
  Link as LinkIcon,
  Scissors
} from 'lucide-react'
import type { FileTreeEntry, RepoKind } from '@oh-my-huggingface/shared'
import { invoke, openExternal } from '@/lib/ipc'
import { codeLanguageOf, fileKindOf, hubBlobUrl, resolveUrl } from '@/lib/file-kinds'
import { formatBytes, formatParams } from '@/lib/utils'
import { parseNotebook } from '@/lib/notebook'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useToasts } from '@/components/ui/toaster'
import { CodeBlock } from '@/components/browse/CodeBlock'
import { MarkdownView, repoFileUrl } from '@/components/browse/MarkdownView'
import { NotebookView } from '@/components/browse/NotebookView'
import { ParquetPreview } from '@/components/browse/ParquetPreview'

/** Text previews cap the transfer; anything past this shows the truncation bar. */
const MAX_TEXT_BYTES = 512 * 1024

/** Notebooks embed base64 image outputs, so they need a larger transfer cap. */
const MAX_NOTEBOOK_BYTES = 4 * 1024 * 1024

interface FilePreviewProps {
  kind: RepoKind
  repoId: string
  entry: FileTreeEntry
  onDownload: () => void
  downloading: boolean
}

function LoadingBlock(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 p-4">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

function ErrorBlock({
  message,
  onRetry
}: {
  message: string
  onRetry: () => void
}): React.JSX.Element {
  const { t } = useTranslation('common')
  return (
    <div className="flex flex-col items-center gap-3 p-8 text-center">
      <p className="max-w-96 text-[13px] text-ink-muted">{message}</p>
      <Button size="sm" onClick={onRetry}>
        {t('common:retry')}
      </Button>
    </div>
  )
}

function NoPreview({
  onDownload,
  downloading
}: {
  onDownload: () => void
  downloading: boolean
}): React.JSX.Element {
  const { t } = useTranslation('detail')
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        icon={FileQuestion}
        title={t('preview.noPreviewTitle')}
        body={t('preview.noPreviewBody')}
        action={
          <Button variant="secondary" size="sm" loading={downloading} onClick={onDownload}>
            <ArrowDownToLine className="size-3.5" aria-hidden />
            {t('files.download')}
          </Button>
        }
      />
    </div>
  )
}

function TruncatedBar(): React.JSX.Element {
  const { t } = useTranslation('detail')
  return (
    <div className="flex items-center gap-2 border-b bg-warning/10 px-3 py-1.5 text-[12px]">
      <Scissors className="size-3.5 shrink-0 text-warning" aria-hidden />
      {t('preview.truncated', { size: formatBytes(MAX_TEXT_BYTES) })}
    </div>
  )
}

function TextPreview({
  kind,
  repoId,
  path,
  markdown,
  onDownload,
  downloading
}: {
  kind: RepoKind
  repoId: string
  path: string
  markdown: boolean
  onDownload: () => void
  downloading: boolean
}): React.JSX.Element {
  const text = useQuery({
    queryKey: ['fileText', kind, repoId, path],
    queryFn: () => invoke('hub:fileText', { kind, repoId, path, maxBytes: MAX_TEXT_BYTES }),
    retry: false
  })

  if (text.isPending) return <LoadingBlock />
  if (text.isError) {
    // A binary payload behind a texty extension: degrade to the download-only state.
    if (/binary/i.test(text.error.message)) {
      return <NoPreview onDownload={onDownload} downloading={downloading} />
    }
    return <ErrorBlock message={text.error.message} onRetry={() => void text.refetch()} />
  }

  return (
    <>
      {text.data.truncated && <TruncatedBar />}
      {markdown ? (
        <div className="p-4">
          <MarkdownView markdown={text.data.content} kind={kind} repoId={repoId} />
        </div>
      ) : (
        <div className="p-3">
          <div className="overflow-hidden rounded-lg border border-border-card bg-panel [&_pre]:overflow-x-auto [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-[12px] [&_pre]:leading-relaxed [&_.shiki]:bg-transparent!">
            {/* Keyed by path so switching files never shows the previous file's highlight. */}
            <CodeBlock key={path} code={text.data.content} language={codeLanguageOf(path)} />
          </div>
        </div>
      )}
    </>
  )
}

function NotebookPreview({
  kind,
  repoId,
  path,
  onDownload,
  downloading
}: {
  kind: RepoKind
  repoId: string
  path: string
  onDownload: () => void
  downloading: boolean
}): React.JSX.Element {
  const file = useQuery({
    queryKey: ['fileText', kind, repoId, path, MAX_NOTEBOOK_BYTES],
    queryFn: () => invoke('hub:fileText', { kind, repoId, path, maxBytes: MAX_NOTEBOOK_BYTES }),
    retry: false
  })

  if (file.isPending) return <LoadingBlock />
  if (file.isError) {
    if (/binary/i.test(file.error.message)) {
      return <NoPreview onDownload={onDownload} downloading={downloading} />
    }
    return <ErrorBlock message={file.error.message} onRetry={() => void file.refetch()} />
  }

  const notebook = parseNotebook(file.data.content)
  // A truncated notebook is invalid JSON and won't parse; anything else that
  // fails to parse isn't a notebook we can render — fall back to the raw source.
  if (!notebook) {
    if (file.data.truncated) return <NoPreview onDownload={onDownload} downloading={downloading} />
    return (
      <div className="p-3">
        <div className="overflow-hidden rounded-lg border border-border-card bg-panel [&_pre]:overflow-x-auto [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-[12px] [&_pre]:leading-relaxed [&_.shiki]:bg-transparent!">
          <CodeBlock key={path} code={file.data.content} language="json" />
        </div>
      </div>
    )
  }

  return (
    <>
      {file.data.truncated && <TruncatedBar />}
      <NotebookView notebook={notebook} kind={kind} repoId={repoId} />
    </>
  )
}

function SafetensorsPreview({
  kind,
  repoId,
  path
}: {
  kind: RepoKind
  repoId: string
  path: string
}): React.JSX.Element {
  const { t } = useTranslation('detail')
  const header = useQuery({
    queryKey: ['safetensors', kind, repoId, path],
    queryFn: () => invoke('hub:safetensorsHeader', { kind, repoId, path }),
    retry: false
  })

  if (header.isPending) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-10 w-2/3" />
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-6" />
        ))}
      </div>
    )
  }
  if (header.isError) {
    return <ErrorBlock message={header.error.message} onRetry={() => void header.refetch()} />
  }

  const dtypes = new Map<string, number>()
  for (const tensor of header.data.tensors) {
    dtypes.set(tensor.dtype, (dtypes.get(tensor.dtype) ?? 0) + 1)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b px-4 py-3">
        <div>
          <div className="text-[11px] font-medium text-ink-faint">{t('preview.totalParams')}</div>
          <div className="nums font-mono text-[15px] font-semibold text-ink-strong">
            {formatParams(header.data.totalParams)}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-ink-faint">{t('preview.tensors')}</div>
          <div className="nums font-mono text-[15px] font-semibold text-ink-strong">
            {header.data.tensors.length}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {[...dtypes.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([dtype, count]) => (
              <Badge key={dtype} variant="outline" className="font-mono text-[10.5px]">
                {`${dtype} · ${count}`}
              </Badge>
            ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse font-mono text-[12px]">
          <thead>
            <tr className="text-left">
              <th className="sticky top-0 z-10 border-b bg-panel px-4 py-2 text-[11px] font-medium text-ink-muted">
                {t('preview.colTensor')}
              </th>
              <th className="sticky top-0 z-10 w-24 border-b bg-panel px-3 py-2 text-[11px] font-medium text-ink-muted">
                {t('preview.colDtype')}
              </th>
              <th className="sticky top-0 z-10 w-56 border-b bg-panel px-4 py-2 text-right text-[11px] font-medium text-ink-muted">
                {t('preview.colShape')}
              </th>
            </tr>
          </thead>
          <tbody>
            {header.data.tensors.map((tensor) => (
              <tr key={tensor.name} className="border-b last:border-b-0 hover:bg-panel/60">
                <td className="truncate px-4 py-1 text-ink" title={tensor.name}>
                  {tensor.name}
                </td>
                <td className="px-3 py-1 whitespace-nowrap text-ink-muted">{tensor.dtype}</td>
                <td className="px-4 py-1 text-right whitespace-nowrap text-ink-muted">
                  {tensor.shape.length > 0 ? tensor.shape.join(' × ') : '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function FilePreview({
  kind,
  repoId,
  entry,
  onDownload,
  downloading
}: FilePreviewProps): React.JSX.Element {
  const { t } = useTranslation(['detail', 'common'])
  const push = useToasts((s) => s.push)
  const fileKind = fileKindOf(entry.path)
  const name = entry.path.split('/').at(-1) ?? entry.path
  const rawUrl = resolveUrl(kind, repoId, entry.path)

  const copyRawUrl = (): void => {
    void navigator.clipboard.writeText(rawUrl).then(() => push(t('common:copied'), 'success'))
  }

  let body: React.ReactNode
  switch (fileKind) {
    case 'markdown':
    case 'text':
      body = (
        <TextPreview
          kind={kind}
          repoId={repoId}
          path={entry.path}
          markdown={fileKind === 'markdown'}
          onDownload={onDownload}
          downloading={downloading}
        />
      )
      break
    case 'image':
      body = (
        <div className="flex h-full items-center justify-center p-6">
          {/* Served via omhf-file:// so private/gated repo images load with
              the main process's auth; the copy button keeps the shareable
              https resolve URL. */}
          <img
            src={repoFileUrl(kind, repoId, entry.path)}
            alt={name}
            className="max-h-full max-w-full rounded-md border object-contain"
          />
        </div>
      )
      break
    case 'safetensors':
      body = <SafetensorsPreview kind={kind} repoId={repoId} path={entry.path} />
      break
    case 'notebook':
      body = (
        <NotebookPreview
          kind={kind}
          repoId={repoId}
          path={entry.path}
          onDownload={onDownload}
          downloading={downloading}
        />
      )
      break
    case 'parquet':
      body = (
        <ParquetPreview
          kind={kind}
          repoId={repoId}
          path={entry.path}
          size={entry.size}
          onDownload={onDownload}
          downloading={downloading}
        />
      )
      break
    default:
      body = <NoPreview onDownload={onDownload} downloading={downloading} />
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span
          className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink-strong"
          title={entry.path}
        >
          {name}
        </span>
        {entry.lfs && (
          <Badge variant="outline" className="text-[10px]">
            {t('detail:files.lfs')}
          </Badge>
        )}
        <span className="font-mono text-[11.5px] text-ink-faint">{formatBytes(entry.size)}</span>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('detail:preview.copyRawUrl')}
                onClick={copyRawUrl}
              >
                <LinkIcon className="size-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('detail:preview.copyRawUrl')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('common:openOnHub')}
                onClick={() => openExternal(hubBlobUrl(kind, repoId, entry.path))}
              >
                <ExternalLink className="size-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('common:openOnHub')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('detail:files.download')}
                loading={downloading}
                onClick={onDownload}
              >
                <ArrowDownToLine className="size-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('detail:files.download')}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
    </div>
  )
}
