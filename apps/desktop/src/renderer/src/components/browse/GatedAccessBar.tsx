import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Clock3, Lock } from 'lucide-react'
import type { GatedFormField, RepoKind } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToasts } from '@/components/ui/toaster'
import { useHubSession } from '@/hooks/use-hub-session'
import { useAppStore } from '@/stores/app'
import { useHubEndpointKey } from '@/hooks/use-hub-endpoint'

/**
 * Slim status banner for gated repos: shows whether access is already
 * granted, pending manual review, or requestable — and lets the user submit
 * the Hub's access form (with its custom gate questions) right from the app.
 * Requesting posts the same form the Hub web page does, so it needs a
 * connected Hub web session.
 */
export function GatedAccessBar({
  kind,
  repoId
}: {
  kind: RepoKind
  repoId: string
}): React.JSX.Element | null {
  const { t } = useTranslation(['detail', 'common'])
  const auth = useAppStore((s) => s.auth)
  const openSettings = useAppStore((s) => s.openSettings)
  const hubSession = useHubSession()
  const push = useToasts((s) => s.push)
  const queryClient = useQueryClient()
  const endpointKey = useHubEndpointKey()
  const [formOpen, setFormOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})

  const gate = useQuery({
    queryKey: ['repo-access', kind, repoId, endpointKey],
    queryFn: () => invoke('hub:repoAccessGate', { kind, repoId }),
    enabled: auth.status === 'signedIn',
    staleTime: 60_000
  })

  const ask = useMutation({
    mutationFn: () => invoke('hub:repoAccessAsk', { kind, repoId, fields: values }),
    onSuccess: () => {
      setFormOpen(false)
      setValues({})
      push(t('detail:gate.submitted'), 'success')
      void queryClient.invalidateQueries({ queryKey: ['repo-access', kind, repoId] })
      // A granted gate unlocks the dataset viewer; refresh preview queries.
      void queryClient.invalidateQueries({ queryKey: ['datasetSplits', repoId] })
      void queryClient.invalidateQueries({ queryKey: ['datasetSampleRows', repoId] })
    },
    onError: (err) => push(t('detail:gate.error', { error: err.message }), 'error')
  })

  if (auth.status !== 'signedIn' || gate.isPending || gate.isError) return null

  const { status, fields } = gate.data
  const requiredMissing = fields.some((f) => f.required && !(values[f.name] ?? '').trim())

  return (
    <div
      className={
        status === 'granted'
          ? 'flex items-center gap-2 border-b bg-success/8 px-4 py-1.5 text-[12px] text-success'
          : 'flex items-center gap-2 border-b bg-warning/10 px-4 py-1.5 text-[12px] text-ink'
      }
    >
      {status === 'granted' ? (
        <>
          <BadgeCheck className="size-3.5 shrink-0" aria-hidden />
          {t('detail:gate.granted')}
        </>
      ) : status === 'pending' ? (
        <>
          <Clock3 className="size-3.5 shrink-0 text-warning" aria-hidden />
          {t('detail:gate.pending')}
        </>
      ) : (
        <>
          <Lock className="size-3.5 shrink-0 text-warning" aria-hidden />
          <span className="min-w-0 flex-1">{t('detail:gate.ask')}</span>
          <Button
            variant="cta"
            size="sm"
            className="h-6 px-2 text-[12px]"
            onClick={() => setFormOpen(true)}
          >
            {t('detail:gate.request')}
          </Button>
        </>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogTitle className="flex items-center gap-2 text-[14px] font-semibold">
            <Lock className="size-4" aria-hidden />
            {t('detail:gate.requestTitle')}
          </DialogTitle>
          <DialogDescription className="mt-2 text-[13px] text-ink-muted">
            {t('detail:gate.requestBody', { repoId })}
          </DialogDescription>

          {!hubSession ? (
            <div className="mt-4 flex flex-col items-start gap-2">
              <p className="text-[12.5px] text-ink-muted">{t('detail:gate.needsSession')}</p>
              <Button variant="secondary" size="sm" onClick={() => openSettings('account')}>
                {t('detail:gate.openSettings')}
              </Button>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {fields.map((field) => (
                <GateField
                  key={field.name}
                  field={field}
                  value={values[field.name] ?? ''}
                  onChange={(v) => setValues((prev) => ({ ...prev, [field.name]: v }))}
                />
              ))}
              <div className="flex justify-end gap-2 border-t pt-3">
                <Button variant="secondary" size="sm" onClick={() => setFormOpen(false)}>
                  {t('common:cancel')}
                </Button>
                <Button
                  variant="cta"
                  size="sm"
                  loading={ask.isPending}
                  disabled={requiredMissing}
                  onClick={() => ask.mutate()}
                >
                  {t('detail:gate.submit')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** One gate question, rendered by its parsed field type. Checkboxes post 'on' like the Hub form. */
function GateField({
  field,
  value,
  onChange
}: {
  field: GatedFormField
  value: string
  onChange: (value: string) => void
}): React.JSX.Element {
  const inputId = useId()
  const labelId = `${inputId}-label`
  const labelContent = (
    <>
      {field.name}
      {field.required ? (
        <span className="text-error" aria-hidden>
          {' '}
          *
        </span>
      ) : null}
    </>
  )

  if (field.type === 'checkbox') {
    return (
      <label htmlFor={inputId} className="flex items-start gap-2 text-[12.5px] text-ink">
        <input
          id={inputId}
          type="checkbox"
          required={field.required}
          aria-required={field.required || undefined}
          checked={value === 'on'}
          onChange={(e) => onChange(e.target.checked ? 'on' : '')}
          className="mt-0.5 accent-select"
        />
        <span>{labelContent}</span>
      </label>
    )
  }
  if (field.type === 'select') {
    return (
      <div className="flex flex-col gap-1.5">
        <label id={labelId} htmlFor={inputId} className="text-[12.5px] text-ink">
          {labelContent}
        </label>
        <Select value={value || undefined} onValueChange={onChange}>
          <SelectTrigger
            id={inputId}
            aria-labelledby={labelId}
            aria-required={field.required || undefined}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }
  if (field.type === 'textarea') {
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-[12.5px] text-ink">
          {labelContent}
        </label>
        <Textarea
          id={inputId}
          required={field.required}
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-[12.5px] text-ink">
        {labelContent}
      </label>
      <Input
        id={inputId}
        required={field.required}
        type={field.type === 'date' ? 'date' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
