import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import type { RepoKind } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useToasts } from '@/components/ui/toaster'
import { useAppStore } from '@/stores/app'

/**
 * Shared repo administration dialogs (rename/move, duplicate, delete),
 * used by both the "My repos" page and the per-repo manage panel.
 * Form state lives inside the dialog content, which Radix unmounts on
 * close — every open starts from a fresh, prop-seeded state.
 */
interface RepoDialogProps {
  kind: RepoKind
  repoId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function RenameForm({
  kind,
  repoId,
  onOpenChange,
  onDone
}: Omit<RepoDialogProps, 'open'> & {
  onDone?: (toRepo: string) => void
}): React.JSX.Element {
  const { t } = useTranslation(['admin', 'common'])
  const push = useToasts((s) => s.push)
  const [toRepo, setToRepo] = useState(repoId)

  const move = useMutation({
    mutationFn: (target: string) =>
      invoke('hub:repoMove', { kind, fromRepo: repoId, toRepo: target }),
    onSuccess: (_res, target) => {
      push(t('admin:rename.success'), 'success')
      onOpenChange(false)
      onDone?.(target)
    },
    onError: (err) => push(err.message, 'error')
  })

  const target = toRepo.trim()
  const canSubmit = target !== '' && target !== repoId && !move.isPending

  return (
    <>
      <DialogTitle className="text-[14px] font-semibold">{t('admin:rename.title')}</DialogTitle>
      <DialogDescription className="mt-2 text-[13px] text-ink-muted">
        {t('admin:rename.body', { repoId })}
      </DialogDescription>
      <div className="mt-3 flex flex-col gap-1.5">
        <label className="text-[12px] font-medium text-ink-muted" htmlFor="rename-to-repo">
          {t('admin:rename.label')}
        </label>
        <Input
          id="rename-to-repo"
          value={toRepo}
          onChange={(e) => setToRepo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && canSubmit && move.mutate(target)}
          placeholder={t('admin:repoIdPlaceholder')}
          className="font-mono"
          spellCheck={false}
        />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
          {t('common:cancel')}
        </Button>
        <Button
          variant="cta"
          size="sm"
          disabled={!canSubmit}
          loading={move.isPending}
          onClick={() => move.mutate(target)}
        >
          {t('admin:rename.submit')}
        </Button>
      </div>
    </>
  )
}

export function RenameRepoDialog({
  open,
  onOpenChange,
  ...props
}: RepoDialogProps & {
  /** Called with the new repo id after a successful move. */
  onDone?: (toRepo: string) => void
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <RenameForm onOpenChange={onOpenChange} {...props} />
      </DialogContent>
    </Dialog>
  )
}

/** Duplication only exists for Spaces on the Hub, so the dialog takes no kind. */
function DuplicateForm({
  repoId,
  onOpenChange,
  onDone
}: Omit<RepoDialogProps, 'open' | 'kind'> & {
  onDone?: (toRepo: string) => void
}): React.JSX.Element {
  const { t } = useTranslation(['admin', 'common'])
  const push = useToasts((s) => s.push)
  const auth = useAppStore((s) => s.auth)
  const me = auth.status === 'signedIn' ? auth.user.name : undefined
  const name = repoId.split('/').pop() ?? repoId
  const [toRepo, setToRepo] = useState(me ? `${me}/${name}` : name)
  const [makePrivate, setMakePrivate] = useState(false)

  const duplicate = useMutation({
    mutationFn: (args: { toRepo: string; private: boolean }) =>
      invoke('hub:repoDuplicate', { repoId, toRepo: args.toRepo, private: args.private }),
    onSuccess: (_res, args) => {
      push(t('admin:duplicate.success'), 'success')
      onOpenChange(false)
      onDone?.(args.toRepo)
    },
    onError: (err) => push(err.message, 'error')
  })

  const target = toRepo.trim()
  const canSubmit = target !== '' && target !== repoId && !duplicate.isPending
  const submit = (): void => {
    if (canSubmit) duplicate.mutate({ toRepo: target, private: makePrivate })
  }

  return (
    <>
      <DialogTitle className="text-[14px] font-semibold">{t('admin:duplicate.title')}</DialogTitle>
      <DialogDescription className="mt-2 text-[13px] text-ink-muted">
        {t('admin:duplicate.body', { repoId })}
      </DialogDescription>
      <div className="mt-3 flex flex-col gap-1.5">
        <label className="text-[12px] font-medium text-ink-muted" htmlFor="duplicate-to-repo">
          {t('admin:duplicate.label')}
        </label>
        <Input
          id="duplicate-to-repo"
          value={toRepo}
          onChange={(e) => setToRepo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={t('admin:repoIdPlaceholder')}
          className="font-mono"
          spellCheck={false}
        />
      </div>
      <label className="mt-3 flex items-center justify-between gap-2 text-[13px]">
        {t('admin:duplicate.private')}
        <Switch checked={makePrivate} onCheckedChange={setMakePrivate} />
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
          {t('common:cancel')}
        </Button>
        <Button
          variant="cta"
          size="sm"
          disabled={!canSubmit}
          loading={duplicate.isPending}
          onClick={submit}
        >
          {t('admin:duplicate.submit')}
        </Button>
      </div>
    </>
  )
}

/** Spaces only: the Hub /duplicate endpoint is not defined for models or datasets. */
export function DuplicateRepoDialog({
  open,
  onOpenChange,
  ...props
}: Omit<RepoDialogProps, 'kind'> & {
  /** Called with the destination repo id after a successful duplication. */
  onDone?: (toRepo: string) => void
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DuplicateForm onOpenChange={onOpenChange} {...props} />
      </DialogContent>
    </Dialog>
  )
}

function DeleteForm({
  kind,
  repoId,
  onOpenChange,
  onDone
}: Omit<RepoDialogProps, 'open'> & {
  onDone?: () => void
}): React.JSX.Element {
  const { t } = useTranslation(['admin', 'common'])
  const push = useToasts((s) => s.push)
  const [confirmName, setConfirmName] = useState('')

  const del = useMutation({
    mutationFn: () => invoke('hub:repoDelete', { kind, repoId, confirmName }),
    onSuccess: () => {
      push(t('admin:delete.success'), 'success')
      onOpenChange(false)
      onDone?.()
    },
    onError: (err) => push(err.message, 'error')
  })

  // Destructive: the exact repo id must be typed before the button unlocks.
  const confirmed = confirmName === repoId

  return (
    <>
      <DialogTitle className="text-[14px] font-semibold">{t('admin:delete.title')}</DialogTitle>
      <DialogDescription className="mt-2 text-[13px] text-ink-muted">
        {t('admin:delete.body', { repoId })}
      </DialogDescription>
      <div className="mt-3 flex flex-col gap-1.5">
        <label className="text-[12px] font-medium text-ink-muted" htmlFor="delete-confirm-name">
          {t('admin:delete.confirmLabel', { repoId })}
        </label>
        <Input
          id="delete-confirm-name"
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          placeholder={repoId}
          className="font-mono"
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
          {t('common:cancel')}
        </Button>
        <Button
          variant="danger"
          size="sm"
          disabled={!confirmed || del.isPending}
          loading={del.isPending}
          onClick={() => del.mutate()}
        >
          {t('common:delete')}
        </Button>
      </div>
    </>
  )
}

export function DeleteRepoDialog({
  open,
  onOpenChange,
  ...props
}: RepoDialogProps & {
  /** Called after the repo has been deleted. */
  onDone?: () => void
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DeleteForm onOpenChange={onOpenChange} {...props} />
      </DialogContent>
    </Dialog>
  )
}
