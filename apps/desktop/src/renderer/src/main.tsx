import './assets/main.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import { BootstrapFailure } from '@/components/errors/BootstrapFailure'
import { initI18n } from '@/i18n'
import { invoke } from '@/lib/ipc'
import { resolveLocale, useAppStore } from '@/stores/app'

const root = createRoot(document.getElementById('root')!)

async function bootstrap(): Promise<void> {
  // Settings, app info, and auth state come from the main process before first paint,
  // so the UI renders in the right language and theme with no flash.
  const [settings, appInfo, auth] = await Promise.all([
    invoke('settings:get', undefined),
    invoke('system:getAppInfo', undefined),
    invoke('auth:getState', undefined)
  ])
  useAppStore.setState({ appInfo, auth })
  useAppStore.getState().setSettings(settings)
  // Seed browse filters from persisted default sort (setSettings only syncs when sort changes).
  useAppStore.setState({
    filters: {
      model: { search: '', sort: settings.defaultRepoSort },
      dataset: { search: '', sort: settings.defaultRepoSort },
      space: { search: '', sort: settings.defaultRepoSort }
    }
  })
  await initI18n(resolveLocale(settings, appInfo))

  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

void bootstrap().catch((error: unknown) => {
  console.error('Renderer bootstrap failed', error)
  root.render(
    <StrictMode>
      <BootstrapFailure error={error} />
    </StrictMode>
  )
})
