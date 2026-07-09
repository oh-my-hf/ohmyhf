import './assets/main.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import { initI18n } from '@/i18n'
import { invoke } from '@/lib/ipc'
import { resolveLocale, useAppStore } from '@/stores/app'

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
  await initI18n(resolveLocale(settings, appInfo))

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

void bootstrap()
