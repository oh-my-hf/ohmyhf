import { QueryClient } from '@tanstack/react-query'

export const APP_UPDATE_QUERY_KEY = ['app-update'] as const

/**
 * Stale-while-revalidate everywhere: cached pages render instantly while a
 * background refetch runs. The main process adds its own response cache on top.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
})
