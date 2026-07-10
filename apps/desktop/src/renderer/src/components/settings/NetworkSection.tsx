import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { Globe, RotateCcw, Wifi } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToasts } from '@/components/ui/toaster'
import { useAppStore } from '@/stores/app'

/** Mirrors hub-api DEFAULT_ENDPOINT; do not import hub-api in the renderer (Node-only deps). */
const DEFAULT_HUB_ENDPOINT = 'https://huggingface.co'

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** Empty → null; otherwise require http(s) URL. */
function parseOptionalUrl(raw: string): { ok: true; value: string | null } | { ok: false } {
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: true, value: null }
  if (!isHttpUrl(trimmed)) return { ok: false }
  return { ok: true, value: trimmed.replace(/\/$/, '') }
}

export function NetworkSection(): React.JSX.Element {
  const { t } = useTranslation(['settings', 'common'])
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const push = useToasts((s) => s.push)

  const [endpointDraft, setEndpointDraft] = useState(settings.hubEndpoint ?? '')
  const [proxyDraft, setProxyDraft] = useState(settings.proxyUrl ?? '')
  const [endpointError, setEndpointError] = useState(false)
  const [proxyError, setProxyError] = useState(false)

  useEffect(() => {
    setEndpointDraft(settings.hubEndpoint ?? '')
    setProxyDraft(settings.proxyUrl ?? '')
  }, [settings.hubEndpoint, settings.proxyUrl])

  const apply = useMutation({
    mutationFn: async () => {
      const endpoint = parseOptionalUrl(endpointDraft)
      const proxy = parseOptionalUrl(proxyDraft)
      setEndpointError(!endpoint.ok)
      setProxyError(!proxy.ok)
      if (!endpoint.ok || !proxy.ok) {
        throw new Error(t('settings:network.invalidUrl'))
      }
      await updateSettings({ hubEndpoint: endpoint.value, proxyUrl: proxy.value })
    },
    onSuccess: () => push(t('settings:network.saved'), 'success'),
    onError: (err) => push(err.message, 'error')
  })

  const test = useMutation({
    mutationFn: () => invoke('network:testConnection', undefined),
    onSuccess: (result) => {
      if (result.ok) push(t('settings:network.testOk'), 'success')
      else push(t('settings:network.testFail', { error: result.error }), 'error')
    },
    onError: (err) => push(err.message, 'error')
  })

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-smd font-semibold text-ink-strong">{t('settings:network.title')}</h2>

      <p className="text-[12.5px] leading-relaxed text-ink-muted">
        {t('settings:network.description')}
      </p>

      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-ink-strong">
            {t('settings:network.hubEndpoint')}
          </span>
          <Input
            value={endpointDraft}
            placeholder={DEFAULT_ENDPOINT}
            spellCheck={false}
            aria-invalid={endpointError}
            onChange={(e) => {
              setEndpointDraft(e.target.value)
              setEndpointError(false)
            }}
          />
          {endpointError && (
            <span className="text-[12px] text-error">{t('settings:network.invalidUrl')}</span>
          )}
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEndpointDraft('')
              setEndpointError(false)
              void updateSettings({ hubEndpoint: null }).then(() =>
                push(t('settings:network.resetEndpoint'), 'success')
              )
            }}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            {t('settings:network.reset')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-ink-strong">
            {t('settings:network.proxyUrl')}
          </span>
          <Input
            value={proxyDraft}
            placeholder="http://127.0.0.1:7890"
            spellCheck={false}
            aria-invalid={proxyError}
            onChange={(e) => {
              setProxyDraft(e.target.value)
              setProxyError(false)
            }}
          />
          {proxyError && (
            <span className="text-[12px] text-error">{t('settings:network.invalidUrl')}</span>
          )}
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setProxyDraft('')
              setProxyError(false)
              void updateSettings({ proxyUrl: null }).then(() =>
                push(t('settings:network.resetProxy'), 'success')
              )
            }}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            {t('settings:network.reset')}
          </Button>
        </div>
      </div>

      <p className="text-[12px] text-ink-faint">{t('settings:network.downloadWarning')}</p>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="cta"
          size="sm"
          loading={apply.isPending}
          onClick={() => apply.mutate()}
        >
          <Globe className="size-3.5" aria-hidden />
          {t('settings:network.apply')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          loading={test.isPending}
          onClick={() => test.mutate()}
        >
          <Wifi className="size-3.5" aria-hidden />
          {t('settings:network.test')}
        </Button>
      </div>
    </section>
  )
}
