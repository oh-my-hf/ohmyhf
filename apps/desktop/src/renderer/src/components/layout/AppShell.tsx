import { useCallback, useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster, useToasts } from '@/components/ui/toaster'
import { CommandPalette } from '@/components/CommandPalette'
import { ShortcutsHelpDialog } from '@/components/ShortcutsHelpDialog'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { useIpcEvent } from '@/hooks/use-ipc-event'
import { invoke } from '@/lib/ipc'
import { APP_UPDATE_QUERY_KEY } from '@/lib/query'
import { isEditableTarget } from '@/lib/utils'
import { useAppStore } from '@/stores/app'

const UPDATE_TOAST_ID = 10_001

export function AppShell(): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()
  // Keyed by top-level section only: switching sections replays the fade-rise,
  // in-section navigation (e.g. /papers/:id) must not remount the page.
  const section = location.pathname.split('/')[1] ?? ''
  const setAuth = useAppStore((s) => s.setAuth)
  const setPaletteOpen = useAppStore((s) => s.setPaletteOpen)
  const openSettings = useAppStore((s) => s.openSettings)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsOpen)
  const push = useToasts((s) => s.push)
  const dismiss = useToasts((s) => s.dismiss)
  const lastUpdateToast = useRef<string | null>(null)
  const updateQuery = useQuery({
    queryKey: APP_UPDATE_QUERY_KEY,
    queryFn: () => invoke('updater:getState', undefined),
    staleTime: Infinity
  })

  useIpcEvent(
    'evt:navigate',
    useCallback(
      (route: string) => {
        // Settings is a dialog, not a route; the native menu (Cmd+,) still sends "/settings".
        if (route === '/settings') openSettings()
        else navigate(route)
      },
      [navigate, openSettings]
    )
  )
  useIpcEvent(
    'evt:auth',
    useCallback(
      (auth) => {
        setAuth(auth)
        // Signed-in state changes visibility of private/gated repos everywhere.
        void queryClient.invalidateQueries()
      },
      [setAuth, queryClient]
    )
  )
  useIpcEvent(
    'evt:downloads',
    useCallback((tasks) => queryClient.setQueryData(['downloads'], tasks), [queryClient])
  )
  useIpcEvent(
    'evt:inbox',
    useCallback((items) => queryClient.setQueryData(['inbox'], items), [queryClient])
  )
  useIpcEvent(
    'evt:updater',
    useCallback((state) => queryClient.setQueryData(APP_UPDATE_QUERY_KEY, state), [queryClient])
  )

  useEffect(() => {
    const state = updateQuery.data
    if (state?.status !== 'available' && state?.status !== 'manual' && state?.status !== 'ready') {
      dismiss(UPDATE_TOAST_ID)
      lastUpdateToast.current = null
      return
    }

    const toastKey = `${state.status}:${state.availableVersion}`
    if (lastUpdateToast.current === toastKey) return
    lastUpdateToast.current = toastKey
    const ready = state.status === 'ready'
    push(
      t(ready ? 'about.updates.toastReady' : 'about.updates.toastAvailable', {
        version: state.availableVersion
      }),
      ready ? 'success' : 'info',
      {
        id: UPDATE_TOAST_ID,
        duration: ready ? null : 8000,
        action: {
          label: t('about.updates.view'),
          onClick: () => openSettings('about')
        }
      }
    )
  }, [dismiss, openSettings, push, t, updateQuery.data])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (mod && e.key === ',') {
        e.preventDefault()
        openSettings()
        return
      }
      if (mod && e.key.toLowerCase() === 'b') {
        // Cmd/Ctrl+B is bold in fields and the Markdown editor; don't hijack it.
        if (isEditableTarget(e)) return
        e.preventDefault()
        toggleSidebar()
        return
      }
      // History and typography-adjacent keys never fire while typing.
      if ((mod && e.key === '[') || (e.altKey && !mod && e.key === 'ArrowLeft')) {
        if (isEditableTarget(e)) return
        e.preventDefault()
        void navigate(-1)
        return
      }
      if ((mod && e.key === ']') || (e.altKey && !mod && e.key === 'ArrowRight')) {
        if (isEditableTarget(e)) return
        e.preventDefault()
        void navigate(1)
        return
      }
      if (e.key === '?' && !mod && !e.altKey && !isEditableTarget(e)) {
        e.preventDefault()
        setShortcutsOpen(true)
        return
      }
      if (e.key === '/' && !mod && !e.altKey && !isEditableTarget(e)) {
        // Focus the active list search (FiltersBar tags its input).
        const input = document.querySelector<HTMLInputElement>('[data-list-search]')
        if (input) {
          e.preventDefault()
          input.focus()
          input.select()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setPaletteOpen, openSettings, toggleSidebar, setShortcutsOpen, navigate])

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-full flex-col">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="min-w-0 flex-1">
            <div key={section} className="animate-fade-rise h-full">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <CommandPalette />
      <SettingsDialog />
      <ShortcutsHelpDialog />
      <Toaster />
    </TooltipProvider>
  )
}
