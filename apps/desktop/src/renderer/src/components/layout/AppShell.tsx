import { useCallback, useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/toaster'
import { CommandPalette } from '@/components/CommandPalette'
import { Sidebar } from '@/components/layout/Sidebar'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { useIpcEvent } from '@/hooks/use-ipc-event'
import { useAppStore } from '@/stores/app'

export function AppShell(): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  // Keyed by top-level section only: switching sections replays the fade-rise,
  // in-section navigation (e.g. /papers/:id) must not remount the page.
  const section = location.pathname.split('/')[1] ?? ''
  const setAuth = useAppStore((s) => s.setAuth)
  const setPaletteOpen = useAppStore((s) => s.setPaletteOpen)
  const openSettings = useAppStore((s) => s.openSettings)

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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        openSettings()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setPaletteOpen, openSettings])

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-full">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <div key={section} className="animate-fade-rise h-full">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette />
      <SettingsDialog />
      <Toaster />
    </TooltipProvider>
  )
}
