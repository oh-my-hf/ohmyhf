import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderKanban, Lock, Plus, ThumbsUp } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { formatCount, formatRelativeTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useToasts } from '@/components/ui/toaster'
import { resolveLocale, useAppStore } from '@/stores/app'
import { WRITE_COLLECTIONS_SCOPE, scopeMissing } from '@/lib/scopes'

/** Hub collection theme names → OKLCH accents (mirrors SpaceCard's color map). */
const THEME_COLORS: Record<string, string> = {
  orange: 'oklch(0.7 0.17 55)',
  blue: 'oklch(0.56 0.17 255)',
  green: 'oklch(0.64 0.16 150)',
  purple: 'oklch(0.54 0.2 300)',
  red: 'oklch(0.62 0.2 25)',
  indigo: 'oklch(0.51 0.19 275)',
  pink: 'oklch(0.63 0.19 350)'
}
const FALLBACK_THEME_COLOR = 'oklch(0.5 0.02 260)'

function themeColorOf(theme: string | undefined): string {
  return (theme && THEME_COLORS[theme.toLowerCase()]) || FALLBACK_THEME_COLOR
}

/** My collections: card grid + create dialog (/collections). */
export function CollectionsPage(): React.JSX.Element {
  const { t } = useTranslation(['collections', 'common', 'auth'])
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)
  const auth = useAppStore((s) => s.auth)
  const openSettings = useAppStore((s) => s.openSettings)
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)

  const me = auth.status === 'signedIn' ? auth.user.name : undefined
  const orgs = auth.status === 'signedIn' ? auth.user.orgs : []
  const writeGated = scopeMissing(auth, WRITE_COLLECTIONS_SCOPE)

  const [createOpen, setCreateOpen] = useState(false)
  const [namespace, setNamespace] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const owner = namespace === '' ? (me ?? '') : namespace

  const collections = useQuery({
    queryKey: ['collections', me],
    queryFn: () => invoke('hub:collections', { owner: me ?? '' }),
    enabled: me !== undefined
  })

  const create = useMutation({
    mutationFn: () =>
      invoke('hub:collectionCreate', {
        namespace: owner,
        title: title.trim(),
        description: description.trim() === '' ? undefined : description.trim(),
        private: isPrivate
      }),
    onSuccess: (created) => {
      push(t('collections:created'), 'success')
      void queryClient.invalidateQueries({ queryKey: ['collections'] })
      setCreateOpen(false)
      navigate(`/collections/${created.slug}`)
    },
    onError: (err) => push(err.message, 'error')
  })

  const openCreate = (): void => {
    setNamespace('')
    setTitle('')
    setDescription('')
    setIsPrivate(false)
    setCreateOpen(true)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-5">
        <header className="flex items-center gap-3">
          <h1 className="text-smd font-semibold text-ink-strong">{t('collections:title')}</h1>
          <div className="ml-auto flex items-center gap-2">
            {me !== undefined &&
              (writeGated ? (
                <p className="text-[11.5px] text-ink-faint">{t('collections:scopeHint')}</p>
              ) : (
                <Button variant="cta" size="sm" onClick={openCreate}>
                  <Plus className="size-3.5" aria-hidden />
                  {t('collections:create')}
                </Button>
              ))}
          </div>
        </header>

        {me === undefined && (
          <div className="rounded-lg border">
            <EmptyState
              icon={FolderKanban}
              title={t('collections:signedOut.title')}
              body={t('collections:signedOut.body')}
              action={
                <Button variant="cta" size="sm" onClick={() => openSettings('account')}>
                  {t('auth:signIn')}
                </Button>
              }
            />
          </div>
        )}

        {me !== undefined && collections.isPending && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        )}

        {me !== undefined && collections.isError && (
          <EmptyState
            icon={FolderKanban}
            title={t('collections:error.title')}
            body={collections.error.message}
            action={
              <Button size="sm" onClick={() => void collections.refetch()}>
                {t('common:retry')}
              </Button>
            }
          />
        )}

        {collections.data?.length === 0 && (
          <EmptyState
            icon={FolderKanban}
            title={t('collections:empty.title')}
            body={t('collections:empty.body')}
            action={
              !writeGated ? (
                <Button variant="secondary" size="sm" onClick={openCreate}>
                  <Plus className="size-3.5" aria-hidden />
                  {t('collections:create')}
                </Button>
              ) : undefined
            }
          />
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {collections.data?.map((col) => (
            <button
              key={col.slug}
              type="button"
              onClick={() => navigate(`/collections/${col.slug}`)}
              className="flex flex-col gap-1.5 rounded-lg border border-border-card bg-card-gradient p-4 text-left transition-colors duration-150 hover:border-border"
            >
              <span className="flex w-full min-w-0 items-center gap-2">
                {/* Theme dot, matching the Hub's collection theme color. */}
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: themeColorOf(col.theme) }}
                  aria-hidden
                />
                <span className="min-w-0 truncate text-smd font-semibold text-ink-strong">
                  {col.title}
                </span>
                {col.private && (
                  <Badge variant="warning" className="shrink-0">
                    <Lock className="size-3" aria-hidden />
                    {t('common:private')}
                  </Badge>
                )}
              </span>
              {col.description !== undefined && col.description !== '' && (
                <span className="line-clamp-2 text-[12px] leading-4 text-ink-muted">
                  {col.description}
                </span>
              )}
              <span className="nums mt-auto flex w-full items-center gap-1.5 pt-1 text-[11.5px] text-ink-faint">
                <span>{t('collections:itemCount', { count: col.itemCount ?? 0 })}</span>
                {(col.upvotes ?? 0) > 0 && (
                  <>
                    <span className="text-decor" aria-hidden>
                      ·
                    </span>
                    <span className="flex items-center gap-0.5">
                      <ThumbsUp className="size-3" aria-hidden />
                      {formatCount(col.upvotes ?? 0, locale)}
                    </span>
                  </>
                )}
                {col.updatedAt && (
                  <span className="ml-auto">{formatRelativeTime(col.updatedAt, locale)}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogTitle className="text-[14px] font-semibold">
            {t('collections:createDialog.title')}
          </DialogTitle>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-[12.5px] font-medium">
              {t('collections:createDialog.namespace')}
              <Select value={owner} onValueChange={setNamespace}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {me !== undefined && <SelectItem value={me}>{me}</SelectItem>}
                  {orgs.map((org) => (
                    <SelectItem key={org.name} value={org.name}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[12.5px] font-medium">
              {t('collections:createDialog.titleLabel')}
              <Input
                value={title}
                maxLength={60}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('collections:createDialog.titlePlaceholder')}
              />
            </label>
            <label className="flex flex-col gap-1 text-[12.5px] font-medium">
              {t('collections:createDialog.description')}
              <Textarea
                value={description}
                maxLength={150}
                rows={2}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-[12.5px] font-medium">
              {t('collections:createDialog.private')}
              <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>
              {t('common:cancel')}
            </Button>
            <Button
              variant="cta"
              size="sm"
              disabled={title.trim() === ''}
              loading={create.isPending}
              onClick={() => create.mutate()}
            >
              {t('collections:createDialog.submit')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
