import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, ChevronRight, Database, FolderOpen, HardDrive, LayoutGrid, RefreshCw, Trash2 } from 'lucide-react'
import type { CachedRepo, RepoKind } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { cn, formatBytes, formatRelativeTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useToasts } from '@/components/ui/toaster'
import { resolveLocale, useAppStore } from '@/stores/app'

const KIND_ICON: Record<RepoKind, React.ComponentType<{ className?: string }>> = {
  model: Boxes,
  dataset: Database,
  space: LayoutGrid
}

interface PendingDelete {
  repo: CachedRepo
  commitHashes: string[]
  size: number
}

export function CachePage(): React.JSX.Element {
  const { t } = useTranslation(['cache', 'common'])
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<PendingDelete | null>(null)

  const report = useQuery({
    queryKey: ['cache'],
    queryFn: () => invoke('cache:scan', undefined),
    staleTime: 5 * 60_000
  })

  const deleteRevisions = useMutation({
    mutationFn: (args: PendingDelete) =>
      invoke('cache:deleteRevisions', {
        repoPath: args.repo.path,
        commitHashes: args.commitHashes
      }),
    onSuccess: (next, args) => {
      queryClient.setQueryData(['cache'], next)
      push(t('cache:deleted', { size: formatBytes(args.size) }), 'success')
      setPending(null)
    },
    onError: (err) => {
      push(err.message, 'error')
      setPending(null)
    }
  })

  const toggle = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const staleOf = (repo: CachedRepo): PendingDelete | null => {
    if (repo.revisions.length <= 1) return null
    const stale = repo.revisions.filter((r) => r.refs.length === 0)
    if (stale.length === 0) return null
    return {
      repo,
      commitHashes: stale.map((r) => r.commitHash),
      size: stale.reduce((acc, r) => acc + r.sizeOnDisk, 0)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-5">
        <div className="flex items-center gap-3">
          <h1 className="text-[15px] font-semibold">{t('cache:title')}</h1>
          <span className="text-[12.5px] text-ink-muted">
            {report.data && t('cache:totalOnDisk', { size: formatBytes(report.data.totalSize) })}
            {report.data && ' · '}
            {report.data && t('cache:reposCount', { count: report.data.repos.length })}
          </span>
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto"
            loading={report.isFetching}
            onClick={() => void report.refetch()}
          >
            <RefreshCw className="size-3.5" aria-hidden />
            {report.isFetching ? t('cache:scanning') : t('cache:scan')}
          </Button>
        </div>
        {report.data && (
          <p className="font-mono text-[11.5px] text-ink-faint">{report.data.root}</p>
        )}

        {report.isLoading && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        )}

        {report.data?.repos.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center">
            <HardDrive className="size-7 text-ink-faint" aria-hidden />
            <p className="text-[13.5px] font-medium">{t('cache:empty.title')}</p>
            <p className="max-w-96 text-[12.5px] text-ink-muted">{t('cache:empty.body')}</p>
          </div>
        )}

        {report.data?.repos.map((repo) => {
          const isOpen = expanded.has(repo.path)
          const stale = staleOf(repo)
          const Icon = KIND_ICON[repo.kind]
          return (
            <div key={repo.path} className="rounded-lg border">
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => toggle(repo.path)}
                  aria-expanded={isOpen}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <ChevronRight
                    className={cn(
                      'size-4 shrink-0 text-ink-faint transition-transform duration-150',
                      isOpen && 'rotate-90'
                    )}
                    aria-hidden
                  />
                  <Icon className="size-4 shrink-0 text-ink-faint" aria-hidden />
                  <span className="min-w-0 truncate text-[13px] font-medium">{repo.id}</span>
                  <Badge variant="outline">
                    {t('cache:revisions', { count: repo.revisions.length })}
                  </Badge>
                </button>
                <span className="font-mono text-[12px] text-ink-muted">
                  {formatBytes(repo.sizeOnDisk)}
                </span>
                {stale && (
                  <Button variant="ghost" size="sm" onClick={() => setPending(stale)}>
                    <Trash2 className="size-3.5" aria-hidden />
                    {t('cache:deleteStale')}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('common:showInFolder')}
                  onClick={() => void invoke('system:showItemInFolder', { path: repo.path })}
                >
                  <FolderOpen className="size-4" aria-hidden />
                </Button>
              </div>
              {isOpen && (
                <div className="border-t px-3 py-1.5">
                  {repo.revisions.map((rev) => (
                    <div key={rev.commitHash} className="flex h-9 items-center gap-2.5">
                      <span className="w-24 shrink-0 font-mono text-[12px] text-ink-muted">
                        {rev.commitHash.slice(0, 10)}
                      </span>
                      {rev.refs.length > 0 ? (
                        rev.refs.map((ref) => (
                          <Badge key={ref} variant="primary">
                            {ref}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="outline">{t('cache:noRefs')}</Badge>
                      )}
                      <span className="text-[11.5px] text-ink-faint">
                        {t('cache:files', { count: rev.fileCount })}
                      </span>
                      <span className="text-[11.5px] text-ink-faint">
                        {formatRelativeTime(rev.lastModified, locale)}
                      </span>
                      <span className="ml-auto font-mono text-[12px] text-ink-muted">
                        {formatBytes(rev.sizeOnDisk)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('cache:deleteRevision')}
                        onClick={() =>
                          setPending({
                            repo,
                            commitHashes: [rev.commitHash],
                            size: rev.sizeOnDisk
                          })
                        }
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogTitle className="text-[14px] font-semibold">
            {t('cache:confirmDelete.title', { count: pending?.commitHashes.length ?? 0 })}
          </DialogTitle>
          <DialogDescription className="mt-2 text-[13px] text-ink-muted">
            {t('cache:confirmDelete.body', { size: formatBytes(pending?.size ?? 0) })}
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPending(null)}>
              {t('common:cancel')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={deleteRevisions.isPending}
              onClick={() => pending && deleteRevisions.mutate(pending)}
            >
              {t('common:delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
