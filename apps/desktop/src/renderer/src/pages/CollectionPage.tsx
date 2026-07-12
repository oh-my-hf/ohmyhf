import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Boxes,
  Database,
  Download,
  FileText,
  FolderKanban,
  Heart,
  LayoutGrid,
  Lock,
  Pencil,
  StickyNote,
  ThumbsUp,
  Trash2,
  X
} from 'lucide-react'
import type { CollectionItem } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { WRITE_COLLECTIONS_SCOPE, scopeMissing } from '@/lib/scopes'
import { hubThemeColor } from '@/lib/theme-colors'
import { cn, formatCount, formatRelativeTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { pushUndo, useToasts } from '@/components/ui/toaster'
import { UpvoteButton } from '@/components/community/UpvoteButton'
import { UserLink } from '@/components/profile/UserLink'
import { resolveLocale, useAppStore } from '@/stores/app'

const ITEM_ICON: Record<CollectionItem['type'], React.ComponentType<{ className?: string }>> = {
  model: Boxes,
  dataset: Database,
  space: LayoutGrid,
  paper: FileText,
  collection: FolderKanban
}

/** In-app route prefix per collection item type (follows the existing route shapes). */
const ITEM_PATH: Record<CollectionItem['type'], string> = {
  model: 'models',
  dataset: 'datasets',
  space: 'spaces',
  paper: 'papers',
  collection: 'collections'
}

/** Nested collections route by slug (the /collections/{owner}/{slug} shape); id is a last resort. */
function itemHref(item: CollectionItem): string {
  const target = item.type === 'collection' ? (item.slug ?? item.id) : item.id
  return `/${ITEM_PATH[item.type]}/${target}`
}

/** Route wrapper for /collections/{owner}/{slug}. */
export function CollectionPage(): React.JSX.Element {
  const params = useParams()
  const slug = params['*'] ?? ''
  return <CollectionDetail key={slug} slug={slug} showBack />
}

/** Single collection detail with owner controls. */
export function CollectionDetail({
  slug,
  showBack = false
}: {
  slug: string
  showBack?: boolean
}): React.JSX.Element {
  const { t } = useTranslation(['collections', 'common', 'auth'])
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)
  const auth = useAppStore((s) => s.auth)
  const openSettings = useAppStore((s) => s.openSettings)
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)

  const [editOpen, setEditOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPrivate, setEditPrivate] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [noteItem, setNoteItem] = useState<CollectionItem | null>(null)
  const [noteText, setNoteText] = useState('')

  const collection = useQuery({
    queryKey: ['collection', slug],
    queryFn: () => invoke('hub:collection', { slug }),
    enabled: slug !== ''
  })
  const data = collection.data

  const me = auth.status === 'signedIn' ? auth.user.name : undefined
  const myOrgs = auth.status === 'signedIn' ? auth.user.orgs : []
  const isOwner =
    data !== undefined &&
    me !== undefined &&
    (data.owner === me || myOrgs.some((org) => org.name === data.owner))
  const writeGated = scopeMissing(auth, WRITE_COLLECTIONS_SCOPE)
  const canWrite = isOwner && !writeGated

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['collection', slug] })
    void queryClient.invalidateQueries({ queryKey: ['collections'] })
  }

  const update = useMutation({
    mutationFn: () => {
      // Only changed fields ride the PATCH — like createCollection, never send
      // an empty description the user didn't touch (the Hub rejects it).
      const patch: { title?: string; description?: string; private?: boolean } = {}
      const title = editTitle.trim()
      if (title !== data?.title) patch.title = title
      const description = editDescription.trim()
      if (description !== (data?.description ?? '')) patch.description = description
      if (editPrivate !== data?.private) patch.private = editPrivate
      return invoke('hub:collectionUpdate', { slug, patch })
    },
    onSuccess: () => {
      push(t('collections:detail.updated'), 'success')
      invalidate()
      setEditOpen(false)
    },
    onError: (err) => push(err.message, 'error')
  })

  const remove = useMutation({
    mutationFn: () => invoke('hub:collectionDelete', { slug, confirmSlug: confirmText }),
    onSuccess: () => {
      push(t('collections:detail.deleted'), 'success')
      void queryClient.invalidateQueries({ queryKey: ['collections'] })
      setDeleteOpen(false)
      navigate('/collections')
    },
    onError: (err) => push(err.message, 'error')
  })

  const saveNote = useMutation({
    mutationFn: (item: CollectionItem) =>
      invoke('hub:collectionUpdateItem', { slug, itemId: item.itemId, note: noteText }),
    onSuccess: () => {
      push(t('collections:detail.note.saved'), 'success')
      invalidate()
      setNoteItem(null)
    },
    onError: (err) => push(err.message, 'error')
  })

  const removeItem = useMutation({
    mutationFn: (item: CollectionItem) =>
      invoke('hub:collectionRemoveItem', { slug, itemId: item.itemId }),
    onSuccess: (_res, item) => {
      invalidate()
      const { type } = item
      // Nested collections cannot be re-added over hub:collectionAddItem; no undo offer.
      if (type === 'collection') {
        push(t('collections:detail.itemRemoved'), 'success')
        return
      }
      pushUndo(t('collections:itemRemoved'), {
        label: t('common:undo'),
        onClick: () => {
          // Re-adding mints a fresh itemId; the note is re-sent alongside.
          void invoke('hub:collectionAddItem', {
            slug,
            item: { type, id: item.id },
            note: item.note
          })
            .then(() => invalidate())
            .catch((err: Error) => push(err.message, 'error'))
        }
      })
    },
    onError: (err) => push(err.message, 'error')
  })

  const openEdit = (): void => {
    if (!data) return
    setEditTitle(data.title)
    setEditDescription(data.description ?? '')
    setEditPrivate(data.private)
    setEditOpen(true)
  }

  const openDelete = (): void => {
    setConfirmText('')
    setDeleteOpen(true)
  }

  const openNote = (item: CollectionItem): void => {
    setNoteText(item.note ?? '')
    setNoteItem(item)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="animate-fade-rise mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-5">
        {showBack ? (
          <div>
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="size-3.5" aria-hidden />
              {t('common:back')}
            </Button>
          </div>
        ) : null}

        {collection.isPending && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-40" />
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        )}

        {collection.isError &&
          (me === undefined ? (
            <EmptyState
              icon={FolderKanban}
              title={t('collections:detail.error.title')}
              body={t('collections:detail.signedOutBody')}
              action={
                <Button variant="cta" size="sm" onClick={() => openSettings('account')}>
                  {t('auth:signIn')}
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={FolderKanban}
              title={t('collections:detail.error.title')}
              body={collection.error.message}
              action={
                <Button size="sm" onClick={() => void collection.refetch()}>
                  {t('common:retry')}
                </Button>
              }
            />
          ))}

        {data && (
          <>
            <header className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: hubThemeColor(data.theme) }}
                  aria-hidden
                />
                <h1 className="min-w-0 truncate text-smd font-semibold text-ink-strong">
                  {data.title}
                </h1>
                {data.private && (
                  <Badge variant="warning" className="shrink-0">
                    <Lock className="size-3" aria-hidden />
                    {t('common:private')}
                  </Badge>
                )}
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  {auth.status === 'signedIn' && (
                    <UpvoteButton
                      upvotes={data.upvotes ?? 0}
                      initialUpvoted={data.isUpvoted}
                      hubUrl={`https://huggingface.co/collections/${slug}`}
                      size="sm"
                      onToggle={(next) =>
                        invoke('hub:collectionUpvoteSet', { slug, upvoted: next })
                      }
                    />
                  )}
                  {isOwner && writeGated && (
                    <p className="text-[11.5px] text-ink-faint">{t('collections:scopeHint')}</p>
                  )}
                  {canWrite && (
                    <>
                      <Button variant="secondary" size="sm" onClick={openEdit}>
                        <Pencil className="size-3.5" aria-hidden />
                        {t('collections:detail.edit')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('common:delete')}
                        onClick={openDelete}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <div className="nums flex items-center gap-1.5 text-[12px] text-ink-faint">
                <UserLink username={data.owner} className="text-[12px] text-ink-muted" />
                <span className="text-decor" aria-hidden>
                  ·
                </span>
                <span>{t('collections:itemCount', { count: data.items.length })}</span>
                {(data.upvotes ?? 0) > 0 && (
                  <>
                    <span className="text-decor" aria-hidden>
                      ·
                    </span>
                    <span className="flex items-center gap-0.5">
                      <ThumbsUp className="size-3" aria-hidden />
                      {formatCount(data.upvotes ?? 0, locale)}
                    </span>
                  </>
                )}
                {data.updatedAt && (
                  <>
                    <span className="text-decor" aria-hidden>
                      ·
                    </span>
                    <span>{formatRelativeTime(data.updatedAt, locale)}</span>
                  </>
                )}
              </div>
              {data.description !== undefined && data.description !== '' && (
                <p className="text-[13px] leading-relaxed text-ink-muted">{data.description}</p>
              )}
            </header>

            {data.items.length === 0 && (
              <EmptyState
                icon={FolderKanban}
                title={t('collections:detail.empty.title')}
                body={t('collections:detail.empty.body')}
              />
            )}

            <div className="flex flex-col gap-1">
              {data.items.map((item) => {
                const Icon = ITEM_ICON[item.type]
                const kindLabel =
                  item.type === 'collection'
                    ? t('collections:kind.collection')
                    : t(`common:kind.${item.type}`)
                return (
                  <div
                    key={item.itemId}
                    className="flex items-start gap-2.5 rounded-lg border border-border-card bg-card-gradient px-3 py-2.5 transition-colors duration-150 hover:border-border"
                  >
                    <button
                      type="button"
                      onClick={() => navigate(itemHref(item))}
                      className="group flex min-w-0 flex-1 items-start gap-2.5 rounded-sm text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                    >
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-panel">
                        {item.emoji ? (
                          <span className="text-[13px] leading-none" aria-hidden>
                            {item.emoji}
                          </span>
                        ) : (
                          <Icon className="size-3.5 text-ink-muted" aria-hidden />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <Badge variant="outline" className="shrink-0">
                            {kindLabel}
                          </Badge>
                          <span
                            className={cn(
                              'min-w-0 truncate text-ink-strong transition-colors duration-100 group-hover:text-hover-title',
                              item.type === 'paper'
                                ? 'text-[13px] font-medium'
                                : 'font-mono text-[12.5px] tracking-tight'
                            )}
                          >
                            {item.title ?? item.id}
                          </span>
                        </span>
                        {item.note !== undefined && item.note !== '' && (
                          <span className="mt-0.5 line-clamp-2 block text-[12px] text-ink-muted">
                            {item.note}
                          </span>
                        )}
                        {(item.downloads !== undefined || item.likes !== undefined) && (
                          <span className="nums mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-faint">
                            {item.downloads !== undefined && (
                              <span className="flex items-center gap-0.5">
                                <Download className="size-3" aria-hidden />
                                {formatCount(item.downloads, locale)}
                              </span>
                            )}
                            {item.downloads !== undefined && item.likes !== undefined && (
                              <span className="text-decor" aria-hidden>
                                ·
                              </span>
                            )}
                            {item.likes !== undefined && (
                              <span className="flex items-center gap-0.5">
                                <Heart className="size-3" aria-hidden />
                                {formatCount(item.likes, locale)}
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                    </button>
                    {canWrite && (
                      <span className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 text-ink-faint"
                          aria-label={t('collections:detail.note.edit')}
                          onClick={() => openNote(item)}
                        >
                          <StickyNote className="size-3.5" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 text-ink-faint"
                          aria-label={t('collections:detail.removeItem')}
                          loading={
                            removeItem.isPending && removeItem.variables?.itemId === item.itemId
                          }
                          onClick={() => removeItem.mutate(item)}
                        >
                          <X className="size-3.5" aria-hidden />
                        </Button>
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogTitle className="text-[14px] font-semibold">
            {t('collections:detail.editDialog.title')}
          </DialogTitle>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-[12.5px] font-medium">
              {t('collections:createDialog.titleLabel')}
              <Input
                value={editTitle}
                maxLength={60}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-[12.5px] font-medium">
              {t('collections:createDialog.description')}
              <Textarea
                value={editDescription}
                maxLength={150}
                rows={2}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-[12.5px] font-medium">
              {t('collections:createDialog.private')}
              <Switch checked={editPrivate} onCheckedChange={setEditPrivate} />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(false)}>
              {t('common:cancel')}
            </Button>
            <Button
              variant="cta"
              size="sm"
              disabled={editTitle.trim() === ''}
              loading={update.isPending}
              onClick={() => update.mutate()}
            >
              {t('collections:detail.editDialog.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogTitle className="text-[14px] font-semibold">
            {t('collections:detail.deleteDialog.title')}
          </DialogTitle>
          <DialogDescription className="mt-2 text-[13px] text-ink-muted">
            {t('collections:detail.deleteDialog.body')}
          </DialogDescription>
          <p className="mt-2 rounded-md bg-panel px-2.5 py-1.5 font-mono text-[12px] break-all">
            {slug}
          </p>
          <Input
            className="mt-3"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={t('collections:detail.deleteDialog.confirmPlaceholder')}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDeleteOpen(false)}>
              {t('common:cancel')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={confirmText !== slug}
              loading={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {t('common:delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={noteItem !== null} onOpenChange={(open) => !open && setNoteItem(null)}>
        <DialogContent>
          <DialogTitle className="text-[14px] font-semibold">
            {t('collections:detail.note.dialogTitle')}
          </DialogTitle>
          {noteItem && (
            <DialogDescription className="mt-1 truncate text-[12.5px] text-ink-muted">
              {noteItem.title ?? noteItem.id}
            </DialogDescription>
          )}
          <Textarea
            className="mt-3"
            value={noteText}
            maxLength={500}
            rows={4}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder={t('collections:detail.note.placeholder')}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setNoteItem(null)}>
              {t('common:cancel')}
            </Button>
            <Button
              variant="cta"
              size="sm"
              loading={saveNote.isPending}
              onClick={() => noteItem && saveNote.mutate(noteItem)}
            >
              {t('collections:detail.note.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
