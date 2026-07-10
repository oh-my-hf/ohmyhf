import { app } from 'electron'
import { ProxyAgent, fetch as undiciFetch } from 'undici'
import { HubClient } from '@oh-my-huggingface/hub-api'

export interface HubHolder {
  current: HubClient
}

/** Node's global fetch ignores Electron session.setProxy; wire undici when set. */
export function createProxiedFetch(proxyUrl: string | null): typeof fetch {
  if (!proxyUrl) return fetch
  const agent = new ProxyAgent(proxyUrl)
  return ((input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    undiciFetch(input as never, {
      ...(init as object),
      dispatcher: agent
    })) as unknown as typeof fetch
}

export function createHubClient(
  getAccessToken: () => string | undefined,
  options?: { endpoint?: string | null; proxyUrl?: string | null }
): HubClient {
  return new HubClient({
    endpoint: options?.endpoint ?? undefined,
    fetchImpl: createProxiedFetch(options?.proxyUrl ?? null),
    userAgent: `oh-my-huggingface/${app.getVersion()} (unofficial desktop client; +https://github.com/oh-my-hf/ohmyhf)`,
    cacheTtlMs: 120_000,
    // Desktop browsing bursts (grids, file trees) get smoothed out instead of tripping
    // the Hub's per-IP rate limits: few sockets, spaced starts, a couple of retries.
    maxConcurrent: 4,
    minRequestGapMs: 120,
    maxRetries: 2,
    getAccessToken
  })
}

/**
 * Stable HubClient-shaped proxy so DownloadManager / FollowsPoller / IPC keep working
 * after endpoint or proxy rebuilds replace `holder.current`.
 */
export function createHubProxy(holder: HubHolder): HubClient {
  return new Proxy({} as HubClient, {
    get(_target, prop, _receiver) {
      const value = Reflect.get(holder.current, prop, holder.current) as unknown
      if (typeof value === 'function') {
        return (value as (...args: unknown[]) => unknown).bind(holder.current)
      }
      return value
    }
  })
}

export function rebuildHubClient(
  holder: HubHolder,
  getAccessToken: () => string | undefined,
  options: { endpoint: string | null; proxyUrl: string | null }
): void {
  holder.current = createHubClient(getAccessToken, options)
}
