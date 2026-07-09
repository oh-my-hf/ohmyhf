import { useCallback, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Command } from 'cmdk'
import {
  ArrowDownToLine,
  ArrowUpDown,
  Boxes,
  Columns3,
  Database,
  FileText,
  Filter,
  HardDrive,
  Inbox,
  LayoutGrid,
  Moon,
  Search,
  Settings,
  Star,
  Sun,
  SunMoon,
  UploadCloud
} from 'lucide-react'
import type { RepoKind, RepoSort } from '@oh-my-huggingface/shared'
import { LIBRARIES, LICENSES, PARAM_BUCKETS, TASKS } from '@/lib/catalog'
import type { ParamBucket } from '@/lib/utils'
import { useAppStore } from '@/stores/app'

type Page = 'root' | 'task' | 'library' | 'license' | 'params' | 'sort'

const KIND_BY_PATH: Record<string, RepoKind> = {
  '/models': 'model',
  '/datasets': 'dataset',
  '/spaces': 'space'
}

const KIND_PATH: Record<RepoKind, string> = {
  model: '/models',
  dataset: '/datasets',
  space: '/spaces'
}

export function CommandPalette(): React.JSX.Element {
  const { t } = useTranslation(['nav', 'browse', 'common'])
  const open = useAppStore((s) => s.paletteOpen)
  const setOpen = useAppStore((s) => s.setPaletteOpen)
  const setFilters = useAppStore((s) => s.setFilters)
  const resetFilters = useAppStore((s) => s.resetFilters)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const navigate = useNavigate()
  const location = useLocation()
  const [page, setPage] = useState<Page>('root')
  const [value, setValue] = useState('')

  const browseKind: RepoKind =
    Object.entries(KIND_BY_PATH).find(([path]) => location.pathname.startsWith(path))?.[1] ??
    'model'

  const onOpenChange = useCallback(
    (next: boolean): void => {
      setOpen(next)
      if (!next) {
        setPage('root')
        setValue('')
      }
    },
    [setOpen]
  )

  const closeAnd = useCallback(
    (fn: () => void): void => {
      setOpen(false)
      fn()
    },
    [setOpen]
  )

  const applyFilter = (patch: Parameters<typeof setFilters>[1]): void =>
    closeAnd(() => {
      setFilters(browseKind, patch)
      navigate(KIND_PATH[browseKind])
    })

  const navItems = [
    { to: '/models', label: t('nav:models'), icon: Boxes },
    { to: '/datasets', label: t('nav:datasets'), icon: Database },
    { to: '/spaces', label: t('nav:spaces'), icon: LayoutGrid },
    { to: '/papers', label: t('nav:papers'), icon: FileText },
    { to: '/favorites', label: t('nav:favorites'), icon: Star },
    { to: '/downloads', label: t('nav:downloads'), icon: ArrowDownToLine },
    { to: '/cache', label: t('nav:cache'), icon: HardDrive },
    { to: '/inbox', label: t('nav:inbox'), icon: Inbox },
    { to: '/compare', label: t('nav:compare'), icon: Columns3 },
    { to: '/upload', label: t('nav:upload'), icon: UploadCloud },
    { to: '/settings', label: t('nav:settings'), icon: Settings }
  ]

  const sorts: RepoSort[] = ['trending', 'downloads', 'likes', 'updated', 'created']

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label={t('nav:commandPalette')}
      shouldFilter={page === 'root' ? true : true}
      className="fixed top-[18%] left-1/2 z-50 w-[36rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-xl border bg-bg shadow-2xl"
      overlayClassName="fixed inset-0 z-40 bg-black/30"
    >
      <div className="flex items-center gap-2 border-b px-3">
        <Search className="size-4 shrink-0 text-ink-faint" aria-hidden />
        <Command.Input
          value={value}
          onValueChange={setValue}
          placeholder={t('nav:search')}
          className="h-11 w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
        />
      </div>
      <Command.List className="max-h-80 overflow-y-auto p-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-ink-faint [&_[cmdk-group-heading]]:uppercase [&_[cmdk-item]]:flex [&_[cmdk-item]]:cursor-default [&_[cmdk-item]]:items-center [&_[cmdk-item]]:gap-2.5 [&_[cmdk-item]]:rounded-md [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2 [&_[cmdk-item]]:text-[13px] [&_[cmdk-item][data-selected=true]]:bg-panel [&_[cmdk-item][data-selected=true]]:text-ink">
        <Command.Empty className="px-3 py-6 text-center text-[13px] text-ink-muted">
          {t('browse:empty.title')}
        </Command.Empty>

        {page === 'root' && (
          <>
            {value.trim() !== '' && (
              <Command.Item
                value={`search ${value}`}
                onSelect={() => applyFilter({ search: value.trim() })}
              >
                <Search className="size-4 text-ink-faint" aria-hidden />
                <span>
                  {t(`browse:searchPlaceholder.${browseKind}`)} {'“'}
                  {value.trim()}
                  {'”'}
                </span>
              </Command.Item>
            )}
            <Command.Group heading={t('nav:browse')}>
              {navItems.map((item) => (
                <Command.Item key={item.to} onSelect={() => closeAnd(() => navigate(item.to))}>
                  <item.icon className="size-4 text-ink-faint" aria-hidden />
                  {item.label}
                </Command.Item>
              ))}
            </Command.Group>
            <Command.Group heading={t('browse:filter.task')}>
              <Command.Item onSelect={() => setPage('task')}>
                <Filter className="size-4 text-ink-faint" aria-hidden />
                {t('browse:filter.task')}…
              </Command.Item>
              <Command.Item onSelect={() => setPage('library')}>
                <Filter className="size-4 text-ink-faint" aria-hidden />
                {t('browse:filter.library')}…
              </Command.Item>
              <Command.Item onSelect={() => setPage('license')}>
                <Filter className="size-4 text-ink-faint" aria-hidden />
                {t('browse:filter.license')}…
              </Command.Item>
              <Command.Item onSelect={() => setPage('params')}>
                <Filter className="size-4 text-ink-faint" aria-hidden />
                {t('browse:filter.params')}…
              </Command.Item>
              <Command.Item onSelect={() => setPage('sort')}>
                <ArrowUpDown className="size-4 text-ink-faint" aria-hidden />
                {t('browse:sort.label')}…
              </Command.Item>
              <Command.Item onSelect={() => closeAnd(() => resetFilters(browseKind))}>
                <Filter className="size-4 text-ink-faint" aria-hidden />
                {t('browse:filter.clear')}
              </Command.Item>
            </Command.Group>
            <Command.Group heading={t('common:theme.label')}>
              <Command.Item onSelect={() => closeAnd(() => void updateSettings({ theme: 'light' }))}>
                <Sun className="size-4 text-ink-faint" aria-hidden />
                {t('common:theme.light')}
              </Command.Item>
              <Command.Item onSelect={() => closeAnd(() => void updateSettings({ theme: 'dark' }))}>
                <Moon className="size-4 text-ink-faint" aria-hidden />
                {t('common:theme.dark')}
              </Command.Item>
              <Command.Item
                onSelect={() => closeAnd(() => void updateSettings({ theme: 'system' }))}
              >
                <SunMoon className="size-4 text-ink-faint" aria-hidden />
                {t('common:theme.system')}
              </Command.Item>
            </Command.Group>
          </>
        )}

        {page === 'task' &&
          TASKS.map((task) => (
            <Command.Item key={task} onSelect={() => applyFilter({ pipelineTag: task })}>
              {task}
            </Command.Item>
          ))}
        {page === 'library' &&
          LIBRARIES.map((lib) => (
            <Command.Item key={lib} onSelect={() => applyFilter({ library: lib })}>
              {lib}
            </Command.Item>
          ))}
        {page === 'license' &&
          LICENSES.map((license) => (
            <Command.Item key={license} onSelect={() => applyFilter({ license })}>
              {license}
            </Command.Item>
          ))}
        {page === 'params' &&
          PARAM_BUCKETS.map((bucket) => (
            <Command.Item
              key={bucket}
              onSelect={() => applyFilter({ paramBucket: bucket as ParamBucket })}
            >
              {t(`browse:params.${bucket}`)}
            </Command.Item>
          ))}
        {page === 'sort' &&
          sorts.map((sort) => (
            <Command.Item key={sort} onSelect={() => applyFilter({ sort })}>
              {t(`browse:sort.${sort}`)}
            </Command.Item>
          ))}
      </Command.List>
    </Command.Dialog>
  )
}
