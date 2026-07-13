import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { FolderOpen, ShieldAlert, UploadCloud, X } from 'lucide-react'
import type {
  RepoKind,
  UploadIntegrationTask,
  UploadSelection,
  UploadWarningCode
} from '@oh-my-huggingface/shared'
import { describeError } from '@/lib/errors'
import { invoke } from '@/lib/ipc'
import { formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useToasts } from '@/components/ui/toaster'
import { useAppStore } from '@/stores/app'

export function UploadPage(): React.JSX.Element {
  const { t } = useTranslation(['upload', 'common', 'integrations', 'auth', 'errors'])
  const auth = useAppStore((state) => state.auth)
  const openSettings = useAppStore((state) => state.openSettings)
  const push = useToasts((state) => state.push)
  const [selection, setSelection] = useState<UploadSelection | null>(null)
  const [acknowledged, setAcknowledged] = useState<Set<UploadWarningCode>>(new Set())
  const [name, setName] = useState('')
  const [kind, setKind] = useState<RepoKind>('model')
  const [isPrivate, setIsPrivate] = useState(false)

  const tasks = useQuery({
    queryKey: ['integration-tasks'],
    queryFn: () => invoke('integrationTasks:list', undefined),
    staleTime: Infinity
  })
  const activeUpload = useMemo(
    () =>
      tasks.data?.find(
        (task): task is UploadIntegrationTask =>
          task.kind === 'upload' && (task.status === 'preparing' || task.status === 'running')
      ),
    [tasks.data]
  )

  const pickFolder = useMutation({
    mutationFn: () => invoke('upload:selectFolder', undefined),
    onSuccess: (next) => {
      if (!next) return
      setSelection(next)
      setAcknowledged(new Set())
    },
    onError: (error) => {
      const key =
        error.message === 'upload.specialFile'
          ? 'integrations:upload.specialFile'
          : error.message === 'upload.invalidPath'
            ? 'integrations:upload.invalidPath'
            : error.message === 'upload.ignoreUnreadable'
              ? 'integrations:upload.ignoreUnreadable'
              : null
      push(key ? t(key) : describeError(t, error), 'error')
    }
  })
  const start = useMutation({
    mutationFn: () => {
      if (!selection) throw new Error('upload.selectionExpired')
      return invoke('upload:start', {
        request: {
          selectionId: selection.selectionId,
          kind,
          name: name.trim(),
          private: isPrivate,
          acknowledgedWarningCodes: [...acknowledged]
        }
      })
    },
    onSuccess: () => setSelection(null),
    onError: (error) => push(describeError(t, error), 'error')
  })
  const cancel = useMutation({
    mutationFn: (id: string) => invoke('upload:cancel', { id }),
    onError: (error) => push(describeError(t, error), 'error')
  })

  const warningsAcknowledged =
    selection?.warnings.every((warning) => acknowledged.has(warning.code)) ?? true
  const canSubmit =
    auth.status === 'signedIn' &&
    selection !== null &&
    name.trim() !== '' &&
    warningsAcknowledged &&
    !activeUpload &&
    !start.isPending

  const toggleWarning = (code: UploadWarningCode, checked: boolean): void => {
    setAcknowledged((current) => {
      const next = new Set(current)
      if (checked) next.add(code)
      else next.delete(code)
      return next
    })
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-5">
        <header className="flex flex-col gap-0.5">
          <h1 className="text-[15px] font-semibold text-ink-strong">{t('upload:title')}</h1>
          <p className="text-[12.5px] text-ink-muted">{t('upload:hint')}</p>
        </header>

        {auth.status !== 'signedIn' ? (
          <div className="rounded-lg border border-border-card bg-card-gradient">
            <EmptyState
              icon={UploadCloud}
              title={t('upload:signIn')}
              action={
                <Button variant="cta" size="sm" onClick={() => openSettings('account')}>
                  {t('auth:signIn')}
                </Button>
              }
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border border-border-card bg-card-gradient p-5">
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                loading={pickFolder.isPending}
                disabled={Boolean(activeUpload)}
                onClick={() => pickFolder.mutate()}
              >
                <FolderOpen className="size-3.5" aria-hidden />
                {t('upload:chooseFolder')}
              </Button>
              <span className="min-w-0 truncate font-mono text-[12px] text-ink-muted">
                {selection?.label ?? t('upload:noFolder')}
              </span>
            </div>

            {selection && (
              <p className="text-[11.5px] text-ink-faint">
                {t('upload:selectionSummary', {
                  files: selection.fileCount,
                  size: formatBytes(selection.totalBytes),
                  excluded: selection.excludedCount
                })}
              </p>
            )}

            {selection?.warnings.map((warning) => (
              <div
                key={warning.code}
                className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-[12px] text-ink"
              >
                <div className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t(`upload:warnings.${warning.code}.title`)}</p>
                    <p className="mt-0.5 text-ink-muted">
                      {t(`upload:warnings.${warning.code}.body`, {
                        count: (warning.paths?.length ?? 0) + (warning.overflow ?? 0),
                        size: formatBytes(selection.totalBytes)
                      })}
                    </p>
                    {warning.paths && warning.paths.length > 0 && (
                      <ul className="mt-2 max-h-28 overflow-y-auto font-mono text-[11px] text-ink-muted">
                        {warning.paths.map((path) => (
                          <li key={path} className="truncate" title={path}>
                            {path}
                          </li>
                        ))}
                      </ul>
                    )}
                    <label className="mt-2 flex items-center gap-2 font-medium">
                      <input
                        type="checkbox"
                        checked={acknowledged.has(warning.code)}
                        onChange={(event) => toggleWarning(warning.code, event.target.checked)}
                      />
                      {t('upload:warnings.acknowledge')}
                    </label>
                  </div>
                </div>
              </div>
            ))}

            <label className="flex flex-col gap-1 text-[12.5px] font-medium text-ink">
              {t('upload:name')}
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('upload:namePlaceholder')}
                disabled={Boolean(activeUpload)}
                required
                aria-required="true"
              />
            </label>

            <div className="flex items-center justify-between gap-4">
              <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
                {t('upload:kind')}
                <Select
                  value={kind}
                  onValueChange={(value) => setKind(value as RepoKind)}
                  disabled={Boolean(activeUpload)}
                >
                  <SelectTrigger className="w-32" aria-label={t('upload:kind')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="model">{t('common:kind.model')}</SelectItem>
                    <SelectItem value="dataset">{t('common:kind.dataset')}</SelectItem>
                    <SelectItem value="space">{t('common:kind.space')}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
                {t('upload:private')}
                <Switch
                  checked={isPrivate}
                  onCheckedChange={setIsPrivate}
                  disabled={Boolean(activeUpload)}
                  aria-label={t('upload:private')}
                />
              </label>
            </div>

            {activeUpload && (
              <div className="flex flex-col gap-1.5 rounded-md border bg-panel p-3">
                <div className="flex items-center justify-between gap-3 text-[12px]">
                  <span className="font-medium">
                    {t(`upload:phase.${activeUpload.phase}`, { defaultValue: activeUpload.phase })}
                  </span>
                  {activeUpload.progress !== undefined && (
                    <span className="nums text-ink-faint">
                      {Math.round(activeUpload.progress * 100)}%
                    </span>
                  )}
                </div>
                <Progress
                  value={activeUpload.progress}
                  indeterminate={activeUpload.progress === undefined}
                />
                {activeUpload.path && (
                  <span className="truncate font-mono text-[11px] text-ink-faint">
                    {activeUpload.path}
                  </span>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-end"
                  loading={cancel.isPending}
                  onClick={() => cancel.mutate(activeUpload.id)}
                >
                  <X className="size-3.5" aria-hidden />
                  {t('common:cancel')}
                </Button>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-[11.5px] text-ink-faint">{t('upload:scopeHint')}</p>
              <Button
                variant="cta"
                size="md"
                disabled={!canSubmit}
                loading={start.isPending}
                onClick={() => start.mutate()}
              >
                <UploadCloud className="size-3.5" aria-hidden />
                {start.isPending ? t('upload:creating') : t('upload:create')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
