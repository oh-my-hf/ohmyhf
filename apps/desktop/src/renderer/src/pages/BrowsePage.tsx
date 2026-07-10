import { useCallback } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Compass } from 'lucide-react'
import type { RepoKind, RepoSummary } from '@oh-my-huggingface/shared'
import { FiltersBar } from '@/components/browse/FiltersBar'
import { RepoList, type SelectVia } from '@/components/browse/RepoList'
import { RepoDetail } from '@/components/browse/RepoDetail'

const KIND_PATH: Record<RepoKind, string> = {
  model: 'models',
  dataset: 'datasets',
  space: 'spaces'
}

export function BrowsePage({ kind }: { kind: RepoKind }): React.JSX.Element {
  const { t } = useTranslation('detail')
  const navigate = useNavigate()
  const params = useParams()
  const repoId = params['*'] || undefined

  const onSelect = useCallback(
    (repo: RepoSummary, via: SelectVia): void => {
      // Clicks (and the first selection) push history; j/k bursts collapse
      // into one entry so Back returns to the pre-burst selection.
      void navigate(`/${KIND_PATH[kind]}/${repo.id}`, {
        replace: via === 'keyboard' && repoId !== undefined
      })
    },
    [navigate, kind, repoId]
  )

  return (
    <div className="flex h-full min-w-0">
      <section className="flex w-[22rem] shrink-0 flex-col border-r max-[1000px]:w-72">
        <FiltersBar kind={kind} />
        <RepoList kind={kind} selectedId={repoId} onSelect={onSelect} />
      </section>
      <section className="min-w-0 flex-1">
        {repoId ? (
          <RepoDetail key={kind} kind={kind} repoId={repoId} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <Compass className="size-8 text-ink-faint" aria-hidden />
            <p className="text-[14px] font-medium">{t('select.title')}</p>
            <p className="max-w-64 text-[12.5px] text-ink-muted">{t('select.body')}</p>
          </div>
        )}
      </section>
    </div>
  )
}
