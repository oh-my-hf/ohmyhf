import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownToLine,
  CircleCheck,
  CircleX,
  FolderOpen,
  Pause,
  Play,
  Trash2,
  X
} from 'lucide-react'
import type { DownloadStatus, DownloadTask } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { cn, formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useToasts } from '@/components/ui/toaster'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/stores/app'

const STATUS_DOT: Record<DownloadStatus, string> = {
  queued: 'bg-ink-faint',
  running: 'bg-select',
  paused: 'bg-warning',
  completed: 'bg-success',
  error: 'bg-error',
  canceled: 'bg-ink-faint'
}

type Action = 'downloads:pause' | 'downloads:resume' | 'downloads:cancel' | 'downloads:remove'

function TaskCard({ task }: { task: DownloadTask }): React.JSX.Element {
  const { t } = useTranslation(['downloads', 'common'])
  const queryClient = useQueryClient()
  const appInfo = useAppStore((s) => s.appInfo)
  const push = useToasts((s) => s.push)

  const act = useMutation({
    mutationFn: (action: Action) => invoke(action, { id: task.id }),
    onSuccess: (tasks, action) => {
      queryClient.setQueryData(['downloads'], tasks)
      if (action === 'downloads:remove') push(t('downloads:removed'), 'success')
    }
  })

  const done = task.files.filter((f) => f.status === 'completed').length
  const progress = task.totalBytes > 0 ? task.receivedBytes / task.totalBytes : 0
  const verified = task.status === 'completed' && task.files.some((f) => f.verified)

  const openFolder = (): void => {
    if (!appInfo) return
    const folder = `${task.kind}s--${task.repoId.split('/').join('--')}`
    void invoke('system:showItemInFolder', { path: `${appInfo.hfCacheDir}/${folder}` })
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border-card bg-card-gradient p-4">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[13.5px] font-medium text-ink-strong">
          {task.repoId}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-ink-muted">
          <span
            className={cn(
              'size-1.5 rounded-full',
              STATUS_DOT[task.status],
              task.status === 'running' && 'animate-pulse'
            )}
            aria-hidden
          />
          {t(`downloads:status.${task.status}`)}
        </span>
      </div>
      <Progress
        value={progress}
        indeterminate={task.status === 'running' && task.totalBytes === 0}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-muted">
        <span className="nums font-mono text-ink-faint">
          {formatBytes(task.receivedBytes)} / {formatBytes(task.totalBytes)}
        </span>
        {task.status === 'running' && task.speedBps > 0 && (
          <span className="nums font-mono text-ink-faint">
            {t('downloads:speed', { speed: formatBytes(task.speedBps) })}
          </span>
        )}
        <span className="nums">{t('downloads:files', { done, total: task.files.length })}</span>
        <span className="text-ink-faint">
          {t('downloads:revision', { revision: task.revision })}
        </span>
        {verified && (
          <span className="flex items-center gap-1 text-success">
            <CircleCheck className="size-3.5" aria-hidden />
            {t('downloads:verified')}
          </span>
        )}
        {task.error && (
          <span className="flex min-w-0 items-center gap-1 text-error">
            <CircleX className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{task.error}</span>
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {(task.status === 'running' || task.status === 'queued') && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('downloads:actions.pause')}
                  onClick={() => act.mutate('downloads:pause')}
                >
                  <Pause className="size-4" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('downloads:actions.pause')}</TooltipContent>
            </Tooltip>
          )}
          {(task.status === 'paused' || task.status === 'error') && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('downloads:actions.resume')}
                  onClick={() => act.mutate('downloads:resume')}
                >
                  <Play className="size-4" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('downloads:actions.resume')}</TooltipContent>
            </Tooltip>
          )}
          {task.status !== 'completed' && task.status !== 'canceled' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('downloads:actions.cancel')}
                  onClick={() => act.mutate('downloads:cancel')}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('downloads:actions.cancel')}</TooltipContent>
            </Tooltip>
          )}
          {task.status === 'completed' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('downloads:actions.openFolder')}
                  onClick={openFolder}
                >
                  <FolderOpen className="size-4" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('downloads:actions.openFolder')}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('downloads:actions.remove')}
                onClick={() => act.mutate('downloads:remove')}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('downloads:actions.remove')}</TooltipContent>
          </Tooltip>
        </span>
      </div>
    </div>
  )
}

export function DownloadsPage(): React.JSX.Element {
  const { t } = useTranslation(['downloads', 'common'])
  const tasks = useQuery({
    queryKey: ['downloads'],
    queryFn: () => invoke('downloads:list', undefined)
  })

  const total = tasks.data?.length ?? 0

  let content: React.JSX.Element | React.JSX.Element[]
  if (tasks.data === undefined && !tasks.error) {
    content = Array.from({ length: 4 }, (_, i) => (
      <div
        key={i}
        className="flex flex-col gap-2.5 rounded-lg border border-border-card p-4"
      >
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-1.5 w-full" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    ))
  } else if (tasks.error) {
    content = (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="max-w-72 text-[13px] text-ink-muted">{t('common:error.network')}</p>
        <Button size="sm" onClick={() => void tasks.refetch()}>
          {t('common:retry')}
        </Button>
      </div>
    )
  } else if (total === 0) {
    content = (
      <EmptyState icon={ArrowDownToLine} title={t('empty.title')} body={t('empty.body')} />
    )
  } else {
    content = (tasks.data ?? []).map((task) => <TaskCard key={task.id} task={task} />)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-5">
        <header className="flex flex-col gap-0.5">
          <h1 className="text-[15px] font-semibold text-ink-strong">{t('title')}</h1>
          {total > 0 && (
            <p className="nums text-[12.5px] text-ink-muted">
              {t('count', {
                count: total,
                defaultValue_one: '{{count}} task',
                defaultValue_other: '{{count}} tasks'
              })}
            </p>
          )}
        </header>
        {content}
      </div>
    </div>
  )
}
