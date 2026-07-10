import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, HardDrive, RefreshCw, Trash2 } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useToasts } from '@/components/ui/toaster'
import { useAppStore } from '@/stores/app'

export function PrivacySection(): React.JSX.Element {
  const { t } = useTranslation(['settings', 'common'])
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)
  const appInfo = useAppStore((s) => s.appInfo)
  const settings = useAppStore((s) => s.settings)
  const closeSettings = useAppStore((s) => s.closeSettings)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [signOutAlso, setSignOutAlso] = useState(false)

  const cachePath = settings.hfCacheDir ?? appInfo?.hfCacheDir ?? '—'

  const report = useQuery({
    queryKey: ['cache'],
    queryFn: () => invoke('cache:scan', undefined),
    staleTime: 5 * 60_000
  })

  const clearLocal = useMutation({
    mutationFn: () => invoke('privacy:clearLocalData', { signOut: signOutAlso }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['favorites'] })
      void queryClient.invalidateQueries({ queryKey: ['follows'] })
      void queryClient.invalidateQueries({ queryKey: ['inbox'] })
      void queryClient.invalidateQueries({ queryKey: ['downloads'] })
      push(
        result.signedOut
          ? t('settings:privacy.local.successSignedOut')
          : t('settings:privacy.local.success'),
        'success'
      )
      setConfirmOpen(false)
      setSignOutAlso(false)
    },
    onError: (err) => {
      push(err.message, 'error')
    }
  })

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-smd font-semibold text-ink-strong">{t('settings:privacy.title')}</h2>

      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex items-center gap-2 text-[13px] font-medium text-ink-strong">
          <HardDrive className="size-4 shrink-0" aria-hidden />
          {t('settings:privacy.cache.title')}
        </div>
        <div className="flex flex-col gap-1.5 text-[12.5px]">
          <div className="flex gap-2">
            <span className="w-20 shrink-0 text-ink-faint">{t('settings:privacy.cache.path')}</span>
            <span className="min-w-0 break-all font-mono text-ink-muted">{cachePath}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-ink-faint">{t('settings:privacy.cache.size')}</span>
            {report.isLoading ? (
              <Skeleton className="h-4 w-24" />
            ) : report.isError ? (
              <span className="text-ink-muted">{t('settings:privacy.cache.scanFailed')}</span>
            ) : (
              <span className="nums text-ink-muted">{formatBytes(report.data?.totalSize ?? 0)}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              closeSettings()
              navigate('/cache')
            }}
          >
            <FolderOpen className="size-3.5" aria-hidden />
            {t('settings:privacy.cache.open')}
          </Button>
          {report.isError && (
            <Button variant="ghost" size="sm" onClick={() => void report.refetch()}>
              <RefreshCw className="size-3.5" aria-hidden />
              {t('settings:privacy.cache.retry')}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <div className="text-[13px] font-medium text-ink-strong">
          {t('settings:privacy.local.title')}
        </div>
        <p className="text-[12.5px] leading-relaxed text-ink-muted">
          {t('settings:privacy.local.description')}
        </p>
        <div>
          <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="size-3.5" aria-hidden />
            {t('settings:privacy.local.clear')}
          </Button>
        </div>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!clearLocal.isPending) {
            setConfirmOpen(open)
            if (!open) setSignOutAlso(false)
          }
        }}
      >
        <DialogContent>
          <DialogTitle className="text-[14px] font-semibold">
            {t('settings:privacy.local.confirmTitle')}
          </DialogTitle>
          <DialogDescription className="mt-2 text-[13px] text-ink-muted">
            {t('settings:privacy.local.confirmBody')}
          </DialogDescription>
          <ul className="mt-3 list-inside list-disc text-[12.5px] text-ink-muted">
            <li>{t('settings:privacy.local.items.favorites')}</li>
            <li>{t('settings:privacy.local.items.history')}</li>
            <li>{t('settings:privacy.local.items.downloads')}</li>
            <li>{t('settings:privacy.local.items.follows')}</li>
            <li>{t('settings:privacy.local.items.inbox')}</li>
          </ul>
          <label className="mt-4 flex items-center justify-between gap-3 text-[13px] text-ink">
            <span>{t('settings:privacy.local.signOutAlso')}</span>
            <Switch
              checked={signOutAlso}
              onCheckedChange={setSignOutAlso}
              disabled={clearLocal.isPending}
            />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={clearLocal.isPending}
              onClick={() => setConfirmOpen(false)}
            >
              {t('common:cancel')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={clearLocal.isPending}
              onClick={() => clearLocal.mutate()}
            >
              {t('settings:privacy.local.confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
