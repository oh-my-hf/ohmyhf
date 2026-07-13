import { QueryClient } from '@tanstack/react-query'

export const APP_UPDATE_QUERY_KEY = ['app-update'] as const

/** Query families whose payload comes from the currently configured Hub endpoint. */
const HUB_REMOTE_QUERY_ROOTS = new Set([
  'access-requests',
  'arrowPreview',
  'collection',
  'collections',
  'datasetRows',
  'datasetSampleRows',
  'datasetSplits',
  'discussion',
  'discussionDiff',
  'discussions',
  'fileText',
  'ggufHeader',
  'globalSearch',
  'home',
  'hub-billing-usage',
  'hub-following',
  'hub-notifications',
  'hub-profile',
  'hub-watched',
  'inference-available',
  'my-repos',
  'onnxPreview',
  'org-members',
  'paper',
  'papers',
  'parquetMeta',
  'parquetRows',
  'post',
  'post-can-create',
  'post-comments',
  'readme',
  'repo',
  'repo-access',
  'safetensors',
  'search',
  'searchPage',
  'space-logs',
  'space-secrets',
  'space-variables',
  'tree',
  'user-likes',
  'user-overview',
  'user-repos',
  'user-search'
])

export function isHubRemoteQuery(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0]
  return typeof root === 'string' && HUB_REMOTE_QUERY_ROOTS.has(root)
}

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
