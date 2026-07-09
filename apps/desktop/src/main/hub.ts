import { app } from 'electron'
import { HubClient } from '@oh-my-huggingface/hub-api'

/**
 * Single HubClient for the whole main process: one in-memory response cache,
 * one descriptive User-Agent, centralized auth. The renderer never talks to the
 * network directly.
 */
export function createHubClient(getAccessToken: () => string | undefined): HubClient {
  return new HubClient({
    userAgent: `oh-my-huggingface/${app.getVersion()} (unofficial desktop client; +https://github.com/MoraxCheng/oh-my-huggingface)`,
    cacheTtlMs: 120_000,
    // Desktop browsing bursts (grids, file trees) get smoothed out instead of tripping
    // the Hub's per-IP rate limits: few sockets, spaced starts, a couple of retries.
    maxConcurrent: 4,
    minRequestGapMs: 120,
    maxRetries: 2,
    getAccessToken
  })
}
