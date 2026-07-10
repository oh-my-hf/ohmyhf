import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  KeyRound,
  Pencil,
  RefreshCw,
  RotateCw,
  ScrollText,
  ShieldAlert,
  SquareFunction,
  Trash2
} from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { cn, formatRelativeTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useToasts } from '@/components/ui/toaster'
import { MANAGE_REPOS_SCOPE, scopeMissing } from '@/lib/scopes'
import { resolveLocale, useAppStore } from '@/stores/app'

/** Secret/variable keys must look like environment variable names. */
const KEY_PATTERN = /^[a-zA-Z][_a-zA-Z0-9]*$/

type LogType = 'build' | 'run'

const LOG_TYPES: readonly LogType[] = ['build', 'run']

function SectionHeading({
  icon: Icon,
  children
}: {
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <h3 className="flex items-center gap-2 text-[13px] font-semibold">
      <Icon className="size-4 text-ink-faint" aria-hidden />
      {children}
    </h3>
  )
}

function InlineError({
  message,
  onRetry
}: {
  message: string
  onRetry: () => void
}): React.JSX.Element {
  const { t } = useTranslation('common')
  return (
    <div className="flex items-center gap-2 text-[12.5px] text-ink-muted">
      <span className="min-w-0 flex-1">{message}</span>
      <Button size="sm" onClick={onRetry}>
        {t('common:retry')}
      </Button>
    </div>
  )
}

/**
 * Owner operations panel for a Space: secrets (write-only values), variables,
 * a build/run log snapshot viewer, and restart / factory-restart controls.
 */
export function SpaceOpsPanel({ repoId }: { repoId: string }): React.JSX.Element {
  const { t } = useTranslation(['admin', 'common'])
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)
  const auth = useAppStore((s) => s.auth)
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)

  const canManage = !scopeMissing(auth, MANAGE_REPOS_SCOPE)

  // Secrets --------------------------------------------------------------
  const [secretKey, setSecretKey] = useState('')
  const [secretValue, setSecretValue] = useState('')
  const [secretDescription, setSecretDescription] = useState('')

  const secrets = useQuery({
    queryKey: ['space-secrets', repoId],
    queryFn: () => invoke('hub:spaceSecrets', { repoId })
  })

  const setSecret = useMutation({
    mutationFn: () =>
      invoke('hub:spaceSecretSet', {
        repoId,
        key: secretKey.trim(),
        value: secretValue,
        description: secretDescription.trim() || undefined
      }),
    onSuccess: () => {
      push(t('admin:space.secrets.saved'), 'success')
      setSecretKey('')
      setSecretValue('')
      setSecretDescription('')
      void queryClient.invalidateQueries({ queryKey: ['space-secrets', repoId] })
    },
    onError: (err) => push(err.message, 'error')
  })

  const deleteSecret = useMutation({
    mutationFn: (key: string) => invoke('hub:spaceSecretDelete', { repoId, key }),
    onSuccess: () => {
      push(t('admin:space.secrets.deleted'), 'success')
      void queryClient.invalidateQueries({ queryKey: ['space-secrets', repoId] })
    },
    onError: (err) => push(err.message, 'error')
  })

  const secretKeyValid = KEY_PATTERN.test(secretKey.trim())
  const canAddSecret = secretKeyValid && secretValue !== '' && !setSecret.isPending

  // Variables ------------------------------------------------------------
  const [variableKey, setVariableKey] = useState('')
  const [variableValue, setVariableValue] = useState('')
  const [variableDescription, setVariableDescription] = useState('')

  const variables = useQuery({
    queryKey: ['space-variables', repoId],
    queryFn: () => invoke('hub:spaceVariables', { repoId })
  })

  const setVariable = useMutation({
    mutationFn: () =>
      invoke('hub:spaceVariableSet', {
        repoId,
        key: variableKey.trim(),
        value: variableValue,
        description: variableDescription.trim() || undefined
      }),
    onSuccess: () => {
      push(t('admin:space.variables.saved'), 'success')
      setVariableKey('')
      setVariableValue('')
      setVariableDescription('')
      void queryClient.invalidateQueries({ queryKey: ['space-variables', repoId] })
    },
    onError: (err) => push(err.message, 'error')
  })

  const deleteVariable = useMutation({
    mutationFn: (key: string) => invoke('hub:spaceVariableDelete', { repoId, key }),
    onSuccess: () => {
      push(t('admin:space.variables.deleted'), 'success')
      void queryClient.invalidateQueries({ queryKey: ['space-variables', repoId] })
    },
    onError: (err) => push(err.message, 'error')
  })

  const variableKeyValid = KEY_PATTERN.test(variableKey.trim())
  const canSaveVariable = variableKeyValid && !setVariable.isPending

  // Logs -----------------------------------------------------------------
  const [logType, setLogType] = useState<LogType>('run')

  const logs = useQuery({
    queryKey: ['space-logs', repoId, logType],
    queryFn: () => invoke('hub:spaceLogs', { repoId, logType }),
    staleTime: 0
  })

  // Restart ----------------------------------------------------------------
  const restart = useMutation({
    mutationFn: (factory: boolean) =>
      invoke('hub:spaceRestart', { repoId, factory: factory || undefined }),
    onSuccess: () => push(t('admin:space.restart.done'), 'success'),
    onError: (err) => push(err.message, 'error')
  })

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4">
      {!canManage && (
        <p className="flex items-start gap-2 rounded-md border bg-panel px-3 py-2 text-[12.5px] text-ink-muted">
          <ShieldAlert className="mt-px size-4 shrink-0 text-warning" aria-hidden />
          {t('admin:gatedHint.body')}
        </p>
      )}

      {/* Secrets */}
      <section className="flex flex-col gap-3">
        <SectionHeading icon={KeyRound}>{t('admin:space.secrets.title')}</SectionHeading>
        <p className="text-[12px] text-ink-faint">{t('admin:space.secrets.writeOnly')}</p>
        {secrets.isPending && <Skeleton className="h-10" />}
        {secrets.isError && (
          <InlineError message={secrets.error.message} onRetry={() => void secrets.refetch()} />
        )}
        {secrets.data?.length === 0 && (
          <p className="text-[12.5px] text-ink-faint">{t('admin:space.secrets.empty')}</p>
        )}
        <div className="flex flex-col gap-1">
          {secrets.data?.map((secret) => (
            <div
              key={secret.key}
              className="group flex items-center gap-2 rounded-md border px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{secret.key}</span>
              {secret.description && (
                <span className="hidden min-w-0 truncate text-[11.5px] text-ink-faint sm:block">
                  {secret.description}
                </span>
              )}
              {secret.updatedAt && (
                <span className="nums shrink-0 text-[11px] text-ink-faint">
                  {formatRelativeTime(secret.updatedAt, locale)}
                </span>
              )}
              {canManage && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={t('common:delete')}
                  disabled={deleteSecret.isPending}
                  onClick={() => deleteSecret.mutate(secret.key)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              )}
            </div>
          ))}
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder={t('admin:space.keyPlaceholder')}
              className="w-40 flex-none font-mono"
              spellCheck={false}
            />
            <Input
              type="password"
              value={secretValue}
              onChange={(e) => setSecretValue(e.target.value)}
              placeholder={t('admin:space.valuePlaceholder')}
              className="w-40 flex-none font-mono"
              autoComplete="new-password"
            />
            <Input
              value={secretDescription}
              onChange={(e) => setSecretDescription(e.target.value)}
              placeholder={t('admin:space.descriptionPlaceholder')}
              className="w-40 flex-none"
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={!canAddSecret}
              loading={setSecret.isPending}
              onClick={() => setSecret.mutate()}
            >
              {t('admin:space.secrets.add')}
            </Button>
          </div>
        )}
      </section>

      {/* Variables */}
      <section className="flex flex-col gap-3">
        <SectionHeading icon={SquareFunction}>{t('admin:space.variables.title')}</SectionHeading>
        {variables.isPending && <Skeleton className="h-10" />}
        {variables.isError && (
          <InlineError message={variables.error.message} onRetry={() => void variables.refetch()} />
        )}
        {variables.data?.length === 0 && (
          <p className="text-[12.5px] text-ink-faint">{t('admin:space.variables.empty')}</p>
        )}
        <div className="flex flex-col gap-1">
          {variables.data?.map((variable) => (
            <div
              key={variable.key}
              className="group flex items-center gap-2 rounded-md border px-3 py-2"
            >
              <span className="min-w-0 truncate font-mono text-[12.5px]">{variable.key}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-muted">
                {variable.value ?? ''}
              </span>
              {variable.updatedAt && (
                <span className="nums shrink-0 text-[11px] text-ink-faint">
                  {formatRelativeTime(variable.updatedAt, locale)}
                </span>
              )}
              {canManage && (
                <span className="flex shrink-0 items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label={t('admin:space.variables.edit')}
                    onClick={() => {
                      setVariableKey(variable.key)
                      setVariableValue(variable.value ?? '')
                      setVariableDescription(variable.description ?? '')
                    }}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label={t('common:delete')}
                    disabled={deleteVariable.isPending}
                    onClick={() => deleteVariable.mutate(variable.key)}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </span>
              )}
            </div>
          ))}
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              value={variableKey}
              onChange={(e) => setVariableKey(e.target.value)}
              placeholder={t('admin:space.keyPlaceholder')}
              className="w-40 flex-none font-mono"
              spellCheck={false}
            />
            <Input
              value={variableValue}
              onChange={(e) => setVariableValue(e.target.value)}
              placeholder={t('admin:space.valuePlaceholder')}
              className="w-40 flex-none font-mono"
              spellCheck={false}
            />
            <Input
              value={variableDescription}
              onChange={(e) => setVariableDescription(e.target.value)}
              placeholder={t('admin:space.descriptionPlaceholder')}
              className="w-40 flex-none"
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={!canSaveVariable}
              loading={setVariable.isPending}
              onClick={() => setVariable.mutate()}
            >
              {t('admin:space.variables.save')}
            </Button>
          </div>
        )}
      </section>

      {/* Logs */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <SectionHeading icon={ScrollText}>{t('admin:space.logs.title')}</SectionHeading>
          <div className="ml-auto flex items-center gap-0.5">
            {LOG_TYPES.map((type) => (
              <Button
                key={type}
                variant="ghost"
                size="sm"
                aria-pressed={logType === type}
                className={cn(logType === type && 'bg-panel text-ink')}
                onClick={() => setLogType(type)}
              >
                {t(`admin:space.logs.${type}`)}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('admin:space.logs.refresh')}
              loading={logs.isFetching}
              onClick={() => void logs.refetch()}
            >
              {!logs.isFetching && <RefreshCw className="size-3.5" aria-hidden />}
            </Button>
          </div>
        </div>
        {logs.isError ? (
          <InlineError message={logs.error.message} onRetry={() => void logs.refetch()} />
        ) : (
          <pre className="h-64 overflow-auto rounded-md border bg-panel p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-ink-muted">
            {logs.isPending
              ? t('common:loading')
              : logs.data.text.trim() !== ''
                ? logs.data.text
                : t('admin:space.logs.empty')}
          </pre>
        )}
      </section>

      {/* Restart */}
      {canManage && (
        <section className="flex flex-col gap-3">
          <SectionHeading icon={RotateCw}>{t('admin:space.restart.title')}</SectionHeading>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              loading={restart.isPending && restart.variables === false}
              disabled={restart.isPending}
              onClick={() => restart.mutate(false)}
            >
              <RotateCw className="size-3.5" aria-hidden />
              {t('admin:space.restart.restart')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={restart.isPending && restart.variables === true}
              disabled={restart.isPending}
              onClick={() => restart.mutate(true)}
            >
              {t('admin:space.restart.factory')}
            </Button>
          </div>
          <p className="text-[12px] text-ink-faint">{t('admin:space.restart.factoryHint')}</p>
        </section>
      )}
    </div>
  )
}
