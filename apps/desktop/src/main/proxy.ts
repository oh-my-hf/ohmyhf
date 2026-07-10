/**
 * App-level HTTP(S) proxy for Chromium session traffic (and any net module use).
 * Node fetch (HubClient / download workers) uses undici ProxyAgent separately.
 */
import { session } from 'electron'

export async function applyAppProxy(proxyUrl: string | null): Promise<void> {
  const ses = session.defaultSession
  if (!proxyUrl) {
    await ses.setProxy({ mode: 'system' })
    return
  }
  await ses.setProxy({ proxyRules: proxyUrl })
}
