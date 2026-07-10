import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDownToLine, ExternalLink, Heart, Star } from 'lucide-react'
import type { RepoKind, RepoSummary } from '@oh-my-huggingface/shared'
import { invoke, openExternal } from '@/lib/ipc'
import { cn, formatCount } from '@/lib/utils'
import { useDebounced } from '@/hooks/use-debounced'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useToasts } from '@/components/ui/toaster'
import { DatasetPreview } from '@/components/browse/DatasetPreview'
import { DiscussionsPanel } from '@/components/browse/DiscussionsPanel'
import { FileTreeView } from '@/components/browse/FileTreeView'
import { InfoPanel } from '@/components/browse/InfoPanel'
import { MarkdownView } from '@/components/browse/MarkdownView'
import { PlaygroundPanel } from '@/components/browse/PlaygroundPanel'
import { resolveLocale, useAppStore } from '@/stores/app'

const HUB_PREFIX: Record<RepoKind, string> = {
  model: '',
  dataset: 'datasets/',
  space: 'spaces/'
}

export function RepoDetail({
  kind,
  repoId
}: {
  kind: RepoKind
  repoId: string
}): React.JSX.Element {
  const { t } = useTranslation(['detail', 'common'])
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)

  // Burst control for j/k navigation: the header renders from the immediate
  // repoId, but network requests wait until the selection has rested ~250ms.
  // The parent keys this component by repoId (fresh mount per row), which
  // resets useDebounced — the `settled` timer covers that path.
  const debouncedRepoId = useDebounced(repoId, 250)
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), 250)
    return () => clearTimeout(timer)
  }, [])
  const queriesEnabled = settled && debouncedRepoId === repoId

  const detail = useQuery({
    queryKey: ['repo', kind, debouncedRepoId],
    queryFn: () => invoke('hub:repoDetail', { kind, repoId: debouncedRepoId }),
    enabled: queriesEnabled
  })
  const readme = useQuery({
    queryKey: ['readme', kind, debouncedRepoId],
    queryFn: () => invoke('hub:readme', { kind, repoId: debouncedRepoId }),
    enabled: queriesEnabled
  })
  const favorites = useQuery({
    queryKey: ['favorites'],
    queryFn: () => invoke('favorites:list', undefined)
  })
  // The playground tab only exists when some inference provider actually serves the model.
  const inferenceAvailable = useQuery({
    queryKey: ['inference-available', debouncedRepoId],
    queryFn: () => invoke('hub:inferenceAvailable', { repoId: debouncedRepoId }),
    enabled: kind === 'model' && queriesEnabled,
    staleTime: 10 * 60_000
  })

  // Never show (or act on) data that belongs to a lagging debounced id.
  const detailData = debouncedRepoId === repoId ? detail.data : undefined

  // Record browse history once the summary is known.
  useEffect(() => {
    if (detailData) {
      const summary: RepoSummary = { ...detailData }
      void invoke('history:record', { summary })
    }
  }, [detailData])

  const isFavorite = favorites.data?.some((f) => f.repoId === repoId && f.kind === kind) ?? false

  const toggleFavorite = useMutation({
    mutationFn: async () => {
      if (isFavorite) return invoke('favorites:remove', { kind, repoId })
      if (!detailData) throw new Error('not loaded')
      return invoke('favorites:add', { summary: { ...detailData } })
    },
    onSuccess: (list) => queryClient.setQueryData(['favorites'], list)
  })

  const download = useMutation({
    mutationFn: () => invoke('downloads:start', { request: { repoId, kind } }),
    onSuccess: () => push(t('detail:downloadStarted'), 'success'),
    onError: (err) => push(t('detail:downloadFailed', { error: err.message }), 'error')
  })

  const hubUrl = `https://huggingface.co/${HUB_PREFIX[kind]}${repoId}`
  const isModel = kind === 'model'
  const showPlayground = isModel && inferenceAvailable.data === true

  return (
    <div className="flex h-full min-w-0 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold" title={repoId}>
            {repoId}
          </h1>
          <div className="mt-0.5 flex items-center gap-2 text-[12px] text-ink-faint">
            <span className="flex items-center gap-1">
              <Heart className="size-3" aria-hidden />
              {detailData ? formatCount(detailData.likes, locale) : '–'}
            </span>
            {kind !== 'space' && (
              <span className="flex items-center gap-1">
                <ArrowDownToLine className="size-3" aria-hidden />
                {detailData ? formatCount(detailData.downloads, locale) : '–'}
              </span>
            )}
            {detailData?.gated ? <Badge variant="warning">{t('common:gated')}</Badge> : null}
            {detailData?.private && <Badge variant="warning">{t('common:private')}</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={
                  isFavorite ? t('detail:actions.unfavorite') : t('detail:actions.favorite')
                }
                aria-pressed={isFavorite}
                onClick={() => toggleFavorite.mutate()}
              >
                <Star
                  className={cn('size-4', isFavorite && 'fill-warning text-warning')}
                  aria-hidden
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isFavorite ? t('detail:actions.unfavorite') : t('detail:actions.favorite')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('common:openOnHub')}
                onClick={() => openExternal(hubUrl)}
              >
                <ExternalLink className="size-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('common:openOnHub')}</TooltipContent>
          </Tooltip>
          <Button
            variant="primary"
            size="md"
            loading={download.isPending}
            onClick={() => download.mutate()}
          >
            <ArrowDownToLine className="size-3.5" aria-hidden />
            {t('detail:actions.download')}
          </Button>
        </div>
      </header>

      <Tabs defaultValue="card" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="px-3">
          <TabsTrigger value="card">{t('detail:tabs.card')}</TabsTrigger>
          {kind === 'dataset' && (
            <TabsTrigger value="preview">{t('detail:tabs.preview')}</TabsTrigger>
          )}
          <TabsTrigger value="files">{t('detail:tabs.files')}</TabsTrigger>
          <TabsTrigger value="info">{t('detail:tabs.info')}</TabsTrigger>
          <TabsTrigger value="discussions">{t('detail:tabs.discussions')}</TabsTrigger>
          {showPlayground && (
            <TabsTrigger value="playground">{t('detail:tabs.playground')}</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="card" className="min-h-0 flex-1 overflow-y-auto p-4">
          {readme.isPending && (
            <div className="flex max-w-[72ch] flex-col gap-3">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}
          {readme.data !== undefined &&
            (readme.data.trim() === '' ? (
              <p className="text-[13px] text-ink-muted">{t('detail:card.empty')}</p>
            ) : (
              <MarkdownView markdown={readme.data} kind={kind} repoId={repoId} />
            ))}
        </TabsContent>
        {kind === 'dataset' && (
          <TabsContent value="preview" className="min-h-0 flex-1">
            <DatasetPreview repoId={repoId} />
          </TabsContent>
        )}
        <TabsContent value="files" className="min-h-0 flex-1">
          <FileTreeView kind={kind} repoId={repoId} />
        </TabsContent>
        <TabsContent value="info" className="min-h-0 flex-1 overflow-y-auto">
          {detailData && <InfoPanel detail={detailData} />}
        </TabsContent>
        <TabsContent value="discussions" className="min-h-0 flex-1">
          <DiscussionsPanel kind={kind} repoId={repoId} />
        </TabsContent>
        {showPlayground && (
          <TabsContent value="playground" className="min-h-0 flex-1">
            <PlaygroundPanel repoId={repoId} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
