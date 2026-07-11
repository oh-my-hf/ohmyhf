/**
 * Gated-repo access: auth-check tells whether access is granted; the repo
 * page's ask-access form carries the gate questions and csrf; submitting
 * mirrors the Hub web form. Shapes live-captured 2026-07-11.
 */
import { describe, expect, it, vi } from 'vitest'
import { CookieRequiredError, HubClient } from '../src'

const FAST = { cacheTtlMs: 0, minRequestGapMs: 0 } as const

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html' } })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

const GATE_PAGE = `<!doctype html>
<form action="/logout" method="POST"><input type="hidden" name="csrf" value="logout_csrf"></form>
<form action="/datasets/org/gated-ds/ask-access?next=%2Fdatasets%2Forg%2Fgated-ds" method="POST">
  <input type="hidden" name="csrf" value="csrf_gate_1">
  <input type="checkbox" name="I agree to not reshare this dataset" required>
  <input type="text" name="Affiliation" required>
  <select name="Country"><option value="">Select…</option><option value="CN">CN</option><option value="US">US</option></select>
  <textarea name="Intended use"></textarea>
  <input type="date" name="Date of birth">
  <button type="submit">Agree and access repository</button>
</form>`

const GRANTED_PAGE = '<!doctype html><p>You have been granted access</p>'

const VIEWER_PAGE = `<!doctype html><div data-target="DatasetViewer" data-props="${JSON.stringify({
  data: {
    sampleData: {
      capabilities: { rows: false },
      sampleData: {
        columns: [{ name: 'json' }, { name: '__key__' }],
        rows: [
          {
            rowIdx: 0,
            cells: {
              json: { kind: 'string', value: '{"case_id":"abc"}' },
              __key__: { kind: 'string', value: 'k0' }
            }
          },
          {
            rowIdx: 1,
            cells: { json: { kind: 'dict', value: { nested: true } }, __key__: { kind: 'string', value: 'k1' } }
          }
        ],
        truncated: true
      }
    }
  }
})
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')}"></div>`

function cookieClient(fetchImpl: typeof fetch): HubClient {
  return new HubClient({
    fetchImpl,
    ...FAST,
    getAccessToken: () => 'hf_token',
    getSessionCookie: () => 'session_cookie'
  })
}

describe('HubClient.getRepoAccessGate', () => {
  it('reports granted on a 200 auth-check without touching the page', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }))
    const gate = await cookieClient(fetchImpl).getRepoAccessGate('dataset', 'org/gated-ds')
    expect(gate).toEqual({ status: 'granted', fields: [] })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      'https://huggingface.co/api/datasets/org/gated-ds/auth-check'
    )
  })

  it('parses the gate questions from the ask-access form on 403', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'restricted' }, 403))
      .mockResolvedValueOnce(htmlResponse(GATE_PAGE))
    const gate = await cookieClient(fetchImpl).getRepoAccessGate('dataset', 'org/gated-ds')
    expect(gate.status).toBe('ask')
    expect(gate.fields).toEqual([
      { name: 'I agree to not reshare this dataset', type: 'checkbox', required: true },
      { name: 'Affiliation', type: 'text', required: true },
      { name: 'Country', type: 'select', required: false, options: ['CN', 'US'] },
      { name: 'Intended use', type: 'textarea', required: false },
      { name: 'Date of birth', type: 'date', required: false }
    ])
  })

  it('reports pending when access is denied but the page offers no form', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'restricted' }, 403))
      .mockResolvedValueOnce(htmlResponse(GRANTED_PAGE))
    const gate = await cookieClient(fetchImpl).getRepoAccessGate('dataset', 'org/gated-ds')
    expect(gate).toEqual({ status: 'pending', fields: [] })
  })
})

describe('HubClient.askRepoAccess', () => {
  it('POSTs the urlencoded form with the page csrf and the answers', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(htmlResponse(GATE_PAGE))
      .mockResolvedValueOnce(htmlResponse('ok'))
    await cookieClient(fetchImpl).askRepoAccess('dataset', 'org/gated-ds', {
      'I agree to not reshare this dataset': 'on',
      Affiliation: 'MIT'
    })
    const [url, init] = fetchImpl.mock.calls[1]! as [string, RequestInit]
    expect(url).toBe('https://huggingface.co/datasets/org/gated-ds/ask-access')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(headers.Cookie).toBe('token=session_cookie')
    const body = new URLSearchParams(init.body as string)
    expect(body.get('csrf')).toBe('csrf_gate_1')
    expect(body.get('I agree to not reshare this dataset')).toBe('on')
    expect(body.get('Affiliation')).toBe('MIT')
  })

  it('models post to the unprefixed page path', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        htmlResponse(GATE_PAGE.replaceAll('/datasets/org/gated-ds', '/org/gated-model'))
      )
      .mockResolvedValueOnce(htmlResponse('ok'))
    await cookieClient(fetchImpl).askRepoAccess('model', 'org/gated-model', {})
    expect(fetchImpl.mock.calls[1]![0]).toBe('https://huggingface.co/org/gated-model/ask-access')
  })

  it('requires a web session before any I/O', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const client = new HubClient({ fetchImpl, ...FAST, getAccessToken: () => 'hf_token' })
    await expect(client.askRepoAccess('dataset', 'org/gated-ds', {})).rejects.toBeInstanceOf(
      CookieRequiredError
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('HubClient.getDatasetSampleRows', () => {
  it('parses the SSR sample rows from the DatasetViewer island', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse(VIEWER_PAGE))
    const rows = await cookieClient(fetchImpl).getDatasetSampleRows('org/gated-ds')
    expect(rows).toEqual({
      columns: ['json', '__key__'],
      rows: [
        ['{"case_id":"abc"}', 'k0'],
        // Non-string cells are JSON-stringified.
        ['{"nested":true}', 'k1']
      ],
      sample: true
    })
    // Page fetched with the web session (per-account gate state).
    const headers = (fetchImpl.mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers.Cookie).toBe('token=session_cookie')
  })

  it('returns undefined when the page has no sample', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse(GRANTED_PAGE))
    await expect(
      cookieClient(fetchImpl).getDatasetSampleRows('org/plain-ds')
    ).resolves.toBeUndefined()
  })
})
