import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { FolderOpen, UploadCloud } from 'lucide-react'
import type { RepoKind } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

/**
 * Phase E: upload/publish workflow. The full chain (folder pick → validated IPC →
 * main-process handler) is real; the actual file push is an honest TODO surfaced
 * in the UI via the handler's response message.
 */
export function UploadPage(): React.JSX.Element {
  const { t } = useTranslation(['upload', 'common'])
  const auth = useAppStore((s) => s.auth)
  const push = useToasts((s) => s.push)
  const [folder, setFolder] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<RepoKind>('model')
  const [isPrivate, setIsPrivate] = useState(false)

  const pickFolder = useMutation({
    mutationFn: () => invoke('system:pickFolder', undefined),
    onSuccess: (path) => path && setFolder(path)
  })
  const create = useMutation({
    mutationFn: () =>
      invoke('upload:createRepo', {
        request: { kind, name: name.trim(), private: isPrivate, folderPath: folder ?? '' }
      }),
    onSuccess: (res) => push(res.message ?? '', res.ok ? 'success' : 'info')
  })

  const canSubmit = auth.status === 'signedIn' && folder !== null && name.trim() !== ''

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-5">
        <div>
          <h1 className="text-[15px] font-semibold">{t('upload:title')}</h1>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">{t('upload:hint')}</p>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => pickFolder.mutate()}>
              <FolderOpen className="size-3.5" aria-hidden />
              {t('upload:chooseFolder')}
            </Button>
            <span className="min-w-0 truncate font-mono text-[12px] text-ink-muted">
              {folder ?? t('upload:noFolder')}
            </span>
          </div>

          <label className="flex flex-col gap-1 text-[12.5px] font-medium">
            {t('upload:name')}
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('upload:namePlaceholder')}
            />
          </label>

          <div className="flex items-center justify-between gap-4">
            <label className="flex items-center gap-2 text-[12.5px] font-medium">
              {t('upload:kind')}
              <Select value={kind} onValueChange={(v) => setKind(v as RepoKind)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="model">{t('common:kind.model')}</SelectItem>
                  <SelectItem value="dataset">{t('common:kind.dataset')}</SelectItem>
                  <SelectItem value="space">{t('common:kind.space')}</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="flex items-center gap-2 text-[12.5px] font-medium">
              {t('upload:private')}
              <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
            </label>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-[11.5px] text-ink-faint">
              {auth.status === 'signedIn' ? t('upload:todo') : t('upload:signIn')}
            </p>
            <Button
              variant="primary"
              size="md"
              disabled={!canSubmit}
              loading={create.isPending}
              onClick={() => create.mutate()}
            >
              <UploadCloud className="size-3.5" aria-hidden />
              {create.isPending ? t('upload:creating') : t('upload:create')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
