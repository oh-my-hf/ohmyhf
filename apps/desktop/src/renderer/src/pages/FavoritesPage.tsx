import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Star, X } from 'lucide-react'
import type { FavoriteItem, RepoKind } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { formatCount, formatRelativeTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { pushUndo } from '@/components/ui/toaster'
import { resolveLocale, useAppStore } from '@/stores/app'

const KIND_PATH: Record<RepoKind, string> = {
  model: 'models',
  dataset: 'datasets',
  space: 'spaces'
}

export function FavoritesPage(): React.JSX.Element {
  const { t } = useTranslation(['nav', 'common', 'browse', 'detail'])
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)

  const favorites = useQuery({
    queryKey: ['favorites'],
    queryFn: () => invoke('favorites:list', undefined)
  })
  const remove = useMutation({
    mutationFn: (fav: FavoriteItem) =>
      invoke('favorites:remove', { kind: fav.kind, repoId: fav.repoId }),
    onSuccess: (list, fav) => {
      queryClient.setQueryData(['favorites'], list)
      pushUndo(t('detail:favoriteRemoved'), {
        label: t('common:undo'),
        onClick: () => {
          void invoke('favorites:add', { summary: fav.summary }).then((restored) =>
            queryClient.setQueryData(['favorites'], restored)
          )
        }
      })
    }
  })

  let content: React.JSX.Element
  if (favorites.isLoading) {
    content = (
      <div className="flex flex-col gap-1">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="flex h-[46px] flex-col justify-center gap-1.5 rounded-lg border border-border-card px-3"
          >
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    )
  } else if (favorites.error) {
    content = (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="max-w-72 text-[13px] text-ink-muted">{t('common:error.network')}</p>
        <Button size="sm" onClick={() => void favorites.refetch()}>
          {t('common:retry')}
        </Button>
      </div>
    )
  } else if (favorites.data?.length === 0) {
    content = (
      <EmptyState icon={Star} title={t('detail:favoritesEmpty.title')} body={t('detail:favoritesEmpty.body')} />
    )
  } else {
    content = (
      <div className="flex flex-col gap-1">
        {favorites.data?.map((fav) => (
          <div
            key={`${fav.kind}:${fav.repoId}`}
            className="group flex items-center gap-2.5 rounded-lg border border-border-card bg-card-gradient px-3 py-2.5 transition-colors duration-150 hover:border-border"
          >
            <button
              type="button"
              onClick={() => navigate(`/${KIND_PATH[fav.kind]}/${fav.repoId}`)}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            >
              <Badge variant="outline">{t(`common:kind.${fav.kind}`)}</Badge>
              <span className="min-w-0 truncate font-mono text-[13px] font-medium text-ink-strong transition-colors duration-150 group-hover:text-hover-title">
                {fav.repoId}
              </span>
              {fav.summary.pipelineTag && (
                <span className="hidden text-[11.5px] text-ink-faint sm:block">
                  {fav.summary.pipelineTag}
                </span>
              )}
              <span className="nums ml-auto flex items-center gap-1.5 text-[11.5px] text-ink-faint">
                <span className="flex items-center gap-0.5">
                  <Star className="size-3" aria-hidden />
                  {formatCount(fav.summary.likes, locale)}
                </span>
                <span className="text-decor" aria-hidden>
                  ·
                </span>
                <span>{formatRelativeTime(fav.addedAt, locale)}</span>
              </span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('common:remove')}
              className="text-ink-faint hover:text-ink-strong focus-visible:text-ink-strong"
              onClick={() => remove.mutate(fav)}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-5">
        <h1 className="text-[15px] font-semibold text-ink-strong">{t('nav:favorites')}</h1>
        {content}
      </div>
    </div>
  )
}
