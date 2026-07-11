import { useCallback, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Command } from 'cmdk'
import {
  ArrowDownToLine,
  ArrowUpDown,
  Boxes,
  Building2,
  Columns3,
  Database,
  FileText,
  Filter,
  HardDrive,
  Heart,
  Inbox,
  Keyboard,
  Library,
  LayoutGrid,
  Loader2,
  Moon,
  Search,
  Settings,
  Star,
  Sun,
  SunMoon,
  UploadCloud,
  User
} from 'lucide-react'
import type { RepoKind, RepoSort, RepoSummary } from '@oh-my-huggingface/shared'
import { LIBRARIES, LICENSES, PARAM_BUCKETS, TASKS } from '@/lib/catalog'
import type { ParamBucket } from '@/lib/utils'
import { formatCount } from '@/lib/utils'
import { Kbd } from '@/components/ui/kbd'
import { useGlobalSearch } from '@/hooks/use-global-search'
import { resolveLocale, useAppStore } from '@/stores/app'

type Page = 'root' | 'task' | 'library' | 'license' | 'params' | 'sort'

// Key glyphs for the footer hint bar (not user copy; the labels are localized).
const KEY_UP = '↑'
const KEY_DOWN = '↓'
const KEY_ENTER = '↵'
const KEY_ESC = 'Esc'

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

const KIND_ICON: Record<RepoKind, React.ComponentType<{ className?: string }>> = {
  model: Boxes,
  dataset: Database,
  space: LayoutGrid
}

const KIND_LABEL_KEY: Record<RepoKind, string> = {
  model: 'nav:models',
  dataset: 'nav:datasets',
  space: 'nav:spaces'
}

const ALL_KINDS: RepoKind[] = ['model', 'dataset', 'space']

/** Result-group order: key into useGlobalSearch's buckets + the repo kind. */
const SEARCH_GROUPS = [
  ['models', 'model'],
  ['datasets', 'dataset'],
  ['spaces', 'space']
] as const satisfies ReadonlyArray<readonly [string, RepoKind]>

function RepoResultItem({
  repo,
  locale,
  onSelect
}: {
  repo: RepoSummary
  locale: string
  onSelect: () => void
}): React.JSX.Element {
  const Icon = KIND_ICON[repo.kind]
  return (
    <Command.Item value={`${repo.kind}:${repo.id}`} onSelect={onSelect}>
      <Icon className="size-4 shrink-0 text-ink-faint" aria-hidden />
      <span className="min-w-0 flex-1 truncate font-mono text-ink-strong">{repo.id}</span>
      <span className="nums flex shrink-0 items-center gap-2 text-[11px] text-ink-faint">
        <span className="flex items-center gap-0.5">
          <Heart className="size-3" aria-hidden />
          {formatCount(repo.likes, locale)}
        </span>
        <span className="flex items-center gap-0.5">
          <ArrowDownToLine className="size-3" aria-hidden />
          {formatCount(repo.downloads, locale)}
        </span>
      </span>
    </Command.Item>
  )
}

export function CommandPalette(): React.JSX.Element {
  const { t } = useTranslation(['nav', 'browse', 'common'])
  const open = useAppStore((s) => s.paletteOpen)
  const setOpen = useAppStore((s) => s.setPaletteOpen)
  const setFilters = useAppStore((s) => s.setFilters)
  const resetFilters = useAppStore((s) => s.resetFilters)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const openSettings = useAppStore((s) => s.openSettings)
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsOpen)
  const settings = useAppStore((s) => s.settings)
  const appInfo = useAppStore((s) => s.appInfo)
  const locale = resolveLocale(settings, appInfo)
  const navigate = useNavigate()
  const location = useLocation()
  const [page, setPage] = useState<Page>('root')
  const [value, setValue] = useState('')

  const browseKind: RepoKind =
    Object.entries(KIND_BY_PATH).find(([path]) => location.pathname.startsWith(path))?.[1] ??
    'model'

  const query = value.trim()
  const needle = query.toLowerCase()
  const matches = (label: string): boolean => needle === '' || label.toLowerCase().includes(needle)

  const search = useGlobalSearch(page === 'root' ? value : '')

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

  const applyFilter = (kind: RepoKind, patch: Parameters<typeof setFilters>[1]): void =>
    closeAnd(() => {
      setFilters(kind, patch)
      navigate(KIND_PATH[kind])
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
    { to: '/upload', label: t('nav:upload'), icon: UploadCloud }
  ]

  const filterPages: Array<{ page: Page; label: string; icon: typeof Filter }> = [
    { page: 'task', label: t('browse:filter.task'), icon: Filter },
    { page: 'library', label: t('browse:filter.library'), icon: Filter },
    { page: 'license', label: t('browse:filter.license'), icon: Filter },
    { page: 'params', label: t('browse:filter.params'), icon: Filter },
    { page: 'sort', label: t('browse:sort.label'), icon: ArrowUpDown }
  ]

  const themeItems = [
    { theme: 'light', label: t('common:theme.light'), icon: Sun },
    { theme: 'dark', label: t('common:theme.dark'), icon: Moon },
    { theme: 'system', label: t('common:theme.system'), icon: SunMoon }
  ] as const

  const sorts: RepoSort[] = ['trending', 'downloads', 'likes', 'updated', 'created']

  const visibleNav = navItems.filter((item) => matches(item.label))
  const visibleFilterPages = filterPages.filter((item) => matches(item.label))
  const visibleThemes = themeItems.filter((item) => matches(item.label))
  const showSettings = matches(t('nav:settings'))
  const showClear = matches(t('browse:filter.clear'))
  const showShortcuts = matches(t('nav:shortcuts'))
  const staticCount =
    visibleNav.length +
    visibleFilterPages.length +
    visibleThemes.length +
    (showSettings ? 1 : 0) +
    (showClear ? 1 : 0) +
    (showShortcuts ? 1 : 0)

  const asyncCount =
    search.models.length +
    search.datasets.length +
    search.spaces.length +
    search.orgs.length +
    search.users.length +
    search.papers.length +
    search.collections.length
  // Root: only surface Empty once every hub query settled with nothing and no static row matched.
  const showEmpty =
    page !== 'root' || needle === '' || (!search.isLoading && asyncCount === 0 && staticCount === 0)

  const searchKinds: RepoKind[] = [browseKind, ...ALL_KINDS.filter((k) => k !== browseKind)]

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label={t('nav:commandPalette')}
      shouldFilter={false}
      className="animate-fade-rise fixed top-[18%] left-1/2 z-50 w-[36rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-lg border bg-elevated shadow-overlay"
      overlayClassName="animate-fade fixed inset-0 z-40 bg-scrim-soft"
    >
      <div className="flex items-center gap-2 border-b px-3">
        <Search className="size-4 shrink-0 text-ink-faint" aria-hidden />
        <Command.Input
          value={value}
          onValueChange={setValue}
          placeholder={page === 'root' ? t('nav:globalSearch') : t('nav:search')}
          className="h-11 w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
        />
      </div>
      <Command.List className="max-h-80 overflow-y-auto p-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-faint [&_[cmdk-group-heading]]:uppercase [&_[cmdk-item]]:flex [&_[cmdk-item]]:cursor-default [&_[cmdk-item]]:items-center [&_[cmdk-item]]:gap-2.5 [&_[cmdk-item]]:rounded-md [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2 [&_[cmdk-item]]:text-[13px] [&_[cmdk-item][data-selected=true]]:bg-panel-2 [&_[cmdk-item][data-selected=true]]:text-ink-strong [&_[cmdk-item][data-selected=true]_svg]:text-ink">
        {showEmpty && (
          <Command.Empty className="px-3 py-6 text-center text-[13px] text-ink-muted">
            {t('browse:empty.title')}
          </Command.Empty>
        )}

        {page === 'root' && (
          <>
            {needle !== '' &&
              (search.isLoading ? (
                <Command.Loading>
                  <div className="flex items-center gap-2.5 px-2 py-2 text-[13px] text-ink-muted">
                    <Loader2 className="size-4 shrink-0 animate-spin text-ink-faint" aria-hidden />
                    {t('nav:searching')}
                  </div>
                </Command.Loading>
              ) : (
                <>
                  {SEARCH_GROUPS.map(([group, kind]) =>
                    search[group].length > 0 ? (
                      <Command.Group key={group} heading={t(KIND_LABEL_KEY[kind])}>
                        {search[group].map((repo) => (
                          <RepoResultItem
                            key={repo.id}
                            repo={repo}
                            locale={locale}
                            onSelect={() =>
                              closeAnd(() => navigate(`${KIND_PATH[repo.kind]}/${repo.id}`))
                            }
                          />
                        ))}
                      </Command.Group>
                    ) : null
                  )}
                  {search.orgs.length > 0 && (
                    <Command.Group heading={t('nav:organizations')}>
                      {search.orgs.map((org) => (
                        <Command.Item
                          key={org.name}
                          value={`org:${org.name}`}
                          onSelect={() => closeAnd(() => navigate(`/users/${org.name}`))}
                        >
                          <Building2 className="size-4 shrink-0 text-ink-faint" aria-hidden />
                          <span className="min-w-0 flex-1 truncate font-mono text-ink-strong">
                            {org.name}
                          </span>
                          {org.fullname ? (
                            <span className="max-w-40 shrink-0 truncate text-[11px] text-ink-faint">
                              {org.fullname}
                            </span>
                          ) : null}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                  {search.users.length > 0 && (
                    <Command.Group heading={t('nav:users')}>
                      {search.users.map((user) => (
                        <Command.Item
                          key={user.name}
                          value={`user:${user.name}`}
                          onSelect={() => closeAnd(() => navigate(`/users/${user.name}`))}
                        >
                          <User className="size-4 shrink-0 text-ink-faint" aria-hidden />
                          <span className="min-w-0 flex-1 truncate font-mono text-ink-strong">
                            {user.name}
                          </span>
                          {user.fullname ? (
                            <span className="max-w-40 shrink-0 truncate text-[11px] text-ink-faint">
                              {user.fullname}
                            </span>
                          ) : null}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                  {search.papers.length > 0 && (
                    <Command.Group heading={t('nav:papers')}>
                      {search.papers.map((paper) => (
                        <Command.Item
                          key={paper.id}
                          value={`paper:${paper.id}`}
                          onSelect={() => closeAnd(() => navigate(`/papers/${paper.id}`))}
                        >
                          <FileText className="size-4 shrink-0 text-ink-faint" aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-ink-strong">
                            {paper.title}
                          </span>
                          <span className="max-w-40 shrink-0 truncate font-mono text-[11px] text-ink-faint">
                            {paper.id}
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                  {search.collections.length > 0 && (
                    <Command.Group heading={t('nav:collections')}>
                      {search.collections.map((col) => (
                        <Command.Item
                          key={col.slug}
                          value={`collection:${col.slug}`}
                          onSelect={() => closeAnd(() => navigate(`/collections/${col.slug}`))}
                        >
                          <Library className="size-4 shrink-0 text-ink-faint" aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-ink-strong">
                            {col.title}
                          </span>
                          <span className="max-w-40 shrink-0 truncate font-mono text-[11px] text-ink-faint">
                            {col.slug}
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                </>
              ))}
            {needle !== '' && (
              <Command.Item
                value={`searchAll:${query}`}
                onSelect={() =>
                  closeAnd(() => navigate(`/search?q=${encodeURIComponent(query)}&type=all`))
                }
              >
                <Search className="size-4 shrink-0 text-ink-faint" aria-hidden />
                <span className="truncate">{t('nav:searchAll', { query })}</span>
              </Command.Item>
            )}
            {needle !== '' &&
              searchKinds.map((kind) => (
                <Command.Item
                  key={`searchIn:${kind}`}
                  value={`searchIn:${kind}:${query}`}
                  onSelect={() => applyFilter(kind, { search: query })}
                >
                  <Search className="size-4 shrink-0 text-ink-faint" aria-hidden />
                  <span className="truncate">
                    {t('nav:searchIn', { kind: t(KIND_LABEL_KEY[kind]), query })}
                  </span>
                </Command.Item>
              ))}

            {(visibleNav.length > 0 || showSettings) && (
              <Command.Group heading={t('nav:browse')}>
                {visibleNav.map((item) => (
                  <Command.Item key={item.to} onSelect={() => closeAnd(() => navigate(item.to))}>
                    <item.icon className="size-4 text-ink-faint" aria-hidden />
                    {item.label}
                  </Command.Item>
                ))}
                {showSettings && (
                  <Command.Item onSelect={() => closeAnd(() => openSettings())}>
                    <Settings className="size-4 text-ink-faint" aria-hidden />
                    {t('nav:settings')}
                  </Command.Item>
                )}
              </Command.Group>
            )}
            {(visibleFilterPages.length > 0 || showClear) && (
              <Command.Group heading={t('browse:filter.task')}>
                {visibleFilterPages.map((item) => (
                  <Command.Item key={item.page} onSelect={() => setPage(item.page)}>
                    <item.icon className="size-4 text-ink-faint" aria-hidden />
                    {item.label}…
                  </Command.Item>
                ))}
                {showClear && (
                  <Command.Item onSelect={() => closeAnd(() => resetFilters(browseKind))}>
                    <Filter className="size-4 text-ink-faint" aria-hidden />
                    {t('browse:filter.clear')}
                  </Command.Item>
                )}
              </Command.Group>
            )}
            {visibleThemes.length > 0 && (
              <Command.Group heading={t('common:theme.label')}>
                {visibleThemes.map((item) => (
                  <Command.Item
                    key={item.theme}
                    onSelect={() => closeAnd(() => void updateSettings({ theme: item.theme }))}
                  >
                    <item.icon className="size-4 text-ink-faint" aria-hidden />
                    {item.label}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {showShortcuts && (
              <Command.Item onSelect={() => closeAnd(() => setShortcutsOpen(true))}>
                <Keyboard className="size-4 text-ink-faint" aria-hidden />
                {t('nav:shortcuts')}
              </Command.Item>
            )}
          </>
        )}

        {page === 'task' &&
          TASKS.filter((task) => matches(task)).map((task) => (
            <Command.Item
              key={task}
              onSelect={() => applyFilter(browseKind, { pipelineTag: task })}
            >
              {task}
            </Command.Item>
          ))}
        {page === 'library' &&
          LIBRARIES.filter((lib) => matches(lib)).map((lib) => (
            <Command.Item key={lib} onSelect={() => applyFilter(browseKind, { library: lib })}>
              {lib}
            </Command.Item>
          ))}
        {page === 'license' &&
          LICENSES.filter((license) => matches(license)).map((license) => (
            <Command.Item key={license} onSelect={() => applyFilter(browseKind, { license })}>
              {license}
            </Command.Item>
          ))}
        {page === 'params' &&
          PARAM_BUCKETS.filter((bucket) => matches(t(`browse:params.${bucket}`))).map((bucket) => (
            <Command.Item
              key={bucket}
              onSelect={() => applyFilter(browseKind, { paramBucket: bucket as ParamBucket })}
            >
              {t(`browse:params.${bucket}`)}
            </Command.Item>
          ))}
        {page === 'sort' &&
          sorts
            .filter((sort) => matches(t(`browse:sort.${sort}`)))
            .map((sort) => (
              <Command.Item key={sort} onSelect={() => applyFilter(browseKind, { sort })}>
                {t(`browse:sort.${sort}`)}
              </Command.Item>
            ))}
      </Command.List>

      <div className="flex items-center gap-4 border-t bg-panel/50 px-3 py-2 text-[11px] text-ink-faint">
        <span className="flex items-center gap-1.5">
          <Kbd>{KEY_UP}</Kbd>
          <Kbd>{KEY_DOWN}</Kbd>
          {t('nav:palette.navigate', 'Navigate')}
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>{KEY_ENTER}</Kbd>
          {t('nav:palette.select', 'Select')}
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>{KEY_ESC}</Kbd>
          {t('nav:palette.close', 'Close')}
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>?</Kbd>
          {t('nav:shortcuts')}
        </span>
      </div>
    </Command.Dialog>
  )
}
