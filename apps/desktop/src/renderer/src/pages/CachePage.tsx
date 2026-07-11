import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Boxes,
  ChevronRight,
  Database,
  FolderOpen,
  HardDrive,
  LayoutGrid,
  RefreshCw,
  Trash2
} from 'lucide-react'
import type { CachedRepo, RepoKind } from '@oh-my-huggingface/shared'
import { describeError } from '@/lib/errors'
import { invoke } from '@/lib/ipc'
import { cn, formatBytes, formatRelativeTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
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
  const { t } = useTranslation(['cache', 'common', 'errors'])
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
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="text-smd nums font-semibold text-ink-strong">{t('cache:title')}</h1>
            {report.data && (
              <p className="nums flex items-center gap-1.5 text-[12.5px] text-ink-muted">
                {t('cache:totalOnDisk', { size: formatBytes(report.data.totalSize) })}
                <span className="text-decor" aria-hidden>
                  ·
                </span>
                {t('cache:reposCount', { count: report.data.repos.length })}
              </p>
            )}
            {report.data && (
              <p className="truncate font-mono text-[11.5px] text-ink-faint">{report.data.root}</p>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            loading={report.isFetching}
            onClick={() => void report.refetch()}
          >
            <RefreshCw className="size-3.5" aria-hidden />
            {report.isFetching ? t('cache:scanning') : t('cache:scan')}
          </Button>
        </header>

        {report.isLoading && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        )}

        {report.error !== null && (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="max-w-72 text-[13px] text-ink-muted">{describeError(t, report.error)}</p>
            <Button size="sm" onClick={() => void report.refetch()}>
              {t('common:retry')}
            </Button>
            {/* Cache users debug real paths and errnos — keep the raw error visible. */}
            <p className="max-w-full font-mono text-[11.5px] break-all text-ink-faint">
              {report.error.message}
            </p>
          </div>
        )}

        {report.error === null && report.data?.repos.length === 0 && (
          <EmptyState
            icon={HardDrive}
            title={t('cache:empty.title')}
            body={t('cache:empty.body')}
          />
        )}

        {report.error === null &&
          report.data?.repos.map((repo) => {
            const isOpen = expanded.has(repo.path)
            const stale = staleOf(repo)
            const Icon = KIND_ICON[repo.kind]
            return (
              <div key={repo.path} className="rounded-lg border">
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-t-lg px-3 py-2.5 transition-colors duration-150 hover:bg-panel',
                    !isOpen && 'rounded-b-lg'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggle(repo.path)}
                    aria-expanded={isOpen}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <ChevronRight
                      className={cn(
                        'size-4 shrink-0 text-decor transition-transform duration-150',
                        isOpen && 'rotate-90'
                      )}
                      aria-hidden
                    />
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-panel">
                      <Icon className="size-3.5 text-ink-muted" aria-hidden />
                    </span>
                    <span className="min-w-0 truncate font-mono text-[13px] font-medium tracking-tight text-ink-strong">
                      {repo.id}
                    </span>
                    <Badge variant="outline" className="nums">
                      {t('cache:revisions', { count: repo.revisions.length })}
                    </Badge>
                  </button>
                  <span className="nums min-w-16 text-right font-mono text-[12px] text-ink-faint">
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
                    {/* 1px inset guide aligned under the chevron column — a tree rail, not an accent. */}
                    <div className="ml-2 border-l border-border-card pl-3.5">
                      {repo.revisions.map((rev) => (
                        <div key={rev.commitHash} className="flex h-9 items-center gap-2.5">
                          <span className="nums w-24 shrink-0 font-mono text-[12px] text-ink-muted">
                            {rev.commitHash.slice(0, 10)}
                          </span>
                          {rev.refs.length > 0 ? (
                            rev.refs.map((ref) => (
                              <Badge
                                key={ref}
                                variant="outline"
                                className="border-select/25 bg-select/10 text-select"
                              >
                                {ref}
                              </Badge>
                            ))
                          ) : (
                            <Badge variant="outline">{t('cache:noRefs')}</Badge>
                          )}
                          <span className="nums text-[11.5px] text-ink-faint">
                            {t('cache:files', { count: rev.fileCount })}
                          </span>
                          <span className="nums text-[11.5px] text-ink-faint">
                            {formatRelativeTime(rev.lastModified, locale)}
                          </span>
                          <span className="nums ml-auto font-mono text-[12px] text-ink-faint">
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
