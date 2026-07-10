import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderPlus, Lock, Plus } from 'lucide-react'
import type { CollectionSummary } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
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
import { WRITE_COLLECTIONS_SCOPE, scopeMissing } from '@/lib/scopes'

export interface AddToCollectionMenuProps {
  /** Collection item type of the target (papers use 'paper', repos their RepoKind). */
  kind: 'model' | 'dataset' | 'space' | 'paper'
  /** Repo id or paper id to add. */
  repoId: string
}

/**
 * Self-contained "add to collection" control: trigger button + dropdown listing
 * the signed-in user's collections, with a footer action that creates a new
 * collection and adds the item in one go. Renders nothing when signed out.
 */
export function AddToCollectionMenu({
  kind,
  repoId
}: AddToCollectionMenuProps): React.JSX.Element | null {
  const { t } = useTranslation(['collections', 'common'])
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)
  const auth = useAppStore((s) => s.auth)
  const me = auth.status === 'signedIn' ? auth.user.name : undefined
  const orgs = auth.status === 'signedIn' ? auth.user.orgs : []
  const writeGated = scopeMissing(auth, WRITE_COLLECTIONS_SCOPE)

  const [menuOpen, setMenuOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [namespace, setNamespace] = useState('')
  const [title, setTitle] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const owner = namespace === '' ? (me ?? '') : namespace

  const collections = useQuery({
    queryKey: ['collections', me],
    queryFn: () => invoke('hub:collections', { owner: me ?? '' }),
    enabled: me !== undefined && menuOpen && !writeGated
  })

  const add = useMutation({
    mutationFn: (col: CollectionSummary) =>
      invoke('hub:collectionAddItem', { slug: col.slug, item: { type: kind, id: repoId } }),
    onSuccess: (_res, col) => {
      push(t('collections:menu.added', { title: col.title }), 'success')
      void queryClient.invalidateQueries({ queryKey: ['collections'] })
      void queryClient.invalidateQueries({ queryKey: ['collection', col.slug] })
    },
    onError: (err) => push(err.message, 'error')
  })

  const createAndAdd = useMutation({
    mutationFn: async () => {
      const created = await invoke('hub:collectionCreate', {
        namespace: owner,
        title: title.trim(),
        private: isPrivate
      })
      await invoke('hub:collectionAddItem', {
        slug: created.slug,
        item: { type: kind, id: repoId }
      })
      return created
    },
    onSuccess: (created) => {
      push(t('collections:menu.added', { title: created.title }), 'success')
      void queryClient.invalidateQueries({ queryKey: ['collections'] })
      setCreateOpen(false)
    },
    onError: (err) => push(err.message, 'error')
  })

  // Only meaningful for a signed-in account.
  if (me === undefined) return null

  const openCreate = (): void => {
    setNamespace('')
    setTitle('')
    setIsPrivate(false)
    setCreateOpen(true)
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="md">
            <FolderPlus className="size-3.5" aria-hidden />
            {t('collections:menu.trigger')}
          </Button>
        </DropdownMenuTrigger>
        {/* Radix flips the menu upward automatically when near the viewport bottom. */}
        <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto">
          {writeGated ? (
            <DropdownMenuItem disabled>{t('collections:scopeHint')}</DropdownMenuItem>
          ) : (
            <>
              {collections.isPending && (
                <DropdownMenuItem disabled>{t('common:loading')}</DropdownMenuItem>
              )}
              {collections.isError && (
                <DropdownMenuItem disabled>{t('collections:error.title')}</DropdownMenuItem>
              )}
              {collections.data?.length === 0 && (
                <DropdownMenuItem disabled>{t('collections:menu.empty')}</DropdownMenuItem>
              )}
              {collections.data?.map((col) => (
                <DropdownMenuItem key={col.slug} onSelect={() => add.mutate(col)}>
                  <span className="min-w-0 flex-1 truncate">{col.title}</span>
                  {col.private && <Lock className="size-3 shrink-0 text-ink-faint" aria-hidden />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={openCreate}>
                <Plus className="size-3.5 text-ink-faint" aria-hidden />
                {t('collections:menu.createNew')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

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
                  <SelectItem value={me}>{me}</SelectItem>
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
              loading={createAndAdd.isPending}
              onClick={() => createAndAdd.mutate()}
            >
              {t('collections:createDialog.submit')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
