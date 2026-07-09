import { useCallback, useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/toaster'
import { CommandPalette } from '@/components/CommandPalette'
import { Sidebar } from '@/components/layout/Sidebar'
import { useIpcEvent } from '@/hooks/use-ipc-event'
import { useAppStore } from '@/stores/app'

export function AppShell(): React.JSX.Element {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setAuth = useAppStore((s) => s.setAuth)
  const setPaletteOpen = useAppStore((s) => s.setPaletteOpen)

  useIpcEvent(
    'evt:navigate',
    useCallback((route: string) => navigate(route), [navigate])
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
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setPaletteOpen])

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-full">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
      <Toaster />
    </TooltipProvider>
  )
}
