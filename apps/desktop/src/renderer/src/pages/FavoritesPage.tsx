import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Star, X } from 'lucide-react'
import type { RepoKind } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { formatCount, formatRelativeTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
    mutationFn: (args: { kind: RepoKind; repoId: string }) => invoke('favorites:remove', args),
    onSuccess: (list) => queryClient.setQueryData(['favorites'], list)
  })

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-5">
        <h1 className="text-[15px] font-semibold">{t('nav:favorites')}</h1>
        {favorites.data?.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center">
            <Star className="size-7 text-ink-faint" aria-hidden />
            <p className="text-[13.5px] font-medium">{t('browse:empty.title')}</p>
            <p className="max-w-96 text-[12.5px] text-ink-muted">{t('detail:select.body')}</p>
          </div>
        )}
        <div className="flex flex-col gap-1">
          {favorites.data?.map((fav) => (
            <div
              key={`${fav.kind}:${fav.repoId}`}
              className="group flex items-center gap-2.5 rounded-md border px-3 py-2.5 transition-colors hover:bg-panel"
            >
              <button
                type="button"
                onClick={() => navigate(`/${KIND_PATH[fav.kind]}/${fav.repoId}`)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <Badge variant="outline">{t(`common:kind.${fav.kind}`)}</Badge>
                <span className="min-w-0 truncate text-[13px] font-medium">{fav.repoId}</span>
                {fav.summary.pipelineTag && (
                  <span className="hidden text-[11.5px] text-ink-faint sm:block">
                    {fav.summary.pipelineTag}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-2 text-[11.5px] text-ink-faint">
                  <span className="flex items-center gap-0.5">
                    <Star className="size-3" aria-hidden />
                    {formatCount(fav.summary.likes, locale)}
                  </span>
                  <span>{formatRelativeTime(fav.addedAt, locale)}</span>
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('common:remove')}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                onClick={() => remove.mutate({ kind: fav.kind, repoId: fav.repoId })}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
