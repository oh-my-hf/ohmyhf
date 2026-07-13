import { describe, expect, it, vi } from 'vitest'
import { NotificationService } from './notifications'

vi.mock('electron', () => ({
  Notification: class MockNotification {
    static isSupported(): boolean {
      return true
    }

    on(): void {}
    show(): void {}
  }
}))

function makeBackend() {
  const shown: Array<{ title: string; body: string }> = []
  let click: (() => void) | undefined
  const backend = {
    isSupported: vi.fn(() => true),
    create: vi.fn((options: { title: string; body: string }) => ({
      on: vi.fn((event: 'click', listener: () => void) => {
        if (event === 'click') click = listener
      }),
      show: vi.fn(() => {
        shown.push(options)
      })
    }))
  }
  return { backend, shown, click: () => click }
}

describe('NotificationService', () => {
  it('reads the current setting at delivery time', () => {
    let enabled = false
    const { backend, shown } = makeBackend()
    const service = new NotificationService(
      { get: () => ({ notificationsEnabled: enabled }) },
      { t: (key) => key },
      undefined,
      backend
    )

    service.show('title', 'body')
    expect(backend.create).not.toHaveBeenCalled()

    enabled = true
    service.show('title', 'body')
    expect(shown).toEqual([{ title: 'title', body: 'body' }])
  })

  it('uses the current application locale and interpolates variables when shown', () => {
    let locale = 'en'
    const dictionaries: Record<string, Record<string, string>> = {
      en: { title: 'Finished', body: 'Uploaded {{repo}}' },
      zh: { title: '已完成', body: '已上传 {{repo}}' }
    }
    const { backend, shown } = makeBackend()
    const service = new NotificationService(
      { get: () => ({ notificationsEnabled: true }) },
      {
        t: (key, vars) => dictionaries[locale]![key]!.replace('{{repo}}', String(vars?.repo ?? ''))
      },
      undefined,
      backend
    )

    service.show('title', 'body', { repo: 'one/model' })
    locale = 'zh'
    service.show('title', 'body', { repo: 'two/model' })

    expect(shown).toEqual([
      { title: 'Finished', body: 'Uploaded one/model' },
      { title: '已完成', body: '已上传 two/model' }
    ])
  })

  it('navigates only when a routed notification is clicked', () => {
    const navigate = vi.fn()
    const { backend, click } = makeBackend()
    const service = new NotificationService(
      { get: () => ({ notificationsEnabled: true }) },
      { t: (key) => key },
      navigate,
      backend
    )

    service.show('title', 'body', undefined, '/models/tester/model')
    expect(navigate).not.toHaveBeenCalled()
    click()?.()
    expect(navigate).toHaveBeenCalledWith('/models/tester/model')
  })

  it('treats settings, support checks, translation, construction, and show failures as best-effort', () => {
    const failures = [
      () =>
        new NotificationService(
          {
            get: () => {
              throw new Error('settings failed')
            }
          },
          { t: (key) => key },
          undefined,
          makeBackend().backend
        ),
      () => {
        const { backend } = makeBackend()
        backend.isSupported.mockImplementation(() => {
          throw new Error('support failed')
        })
        return new NotificationService(
          { get: () => ({ notificationsEnabled: true }) },
          { t: (key) => key },
          undefined,
          backend
        )
      },
      () =>
        new NotificationService(
          { get: () => ({ notificationsEnabled: true }) },
          {
            t: () => {
              throw new Error('translation failed')
            }
          },
          undefined,
          makeBackend().backend
        ),
      () => {
        const { backend } = makeBackend()
        backend.create.mockImplementation(() => {
          throw new Error('construction failed')
        })
        return new NotificationService(
          { get: () => ({ notificationsEnabled: true }) },
          { t: (key) => key },
          undefined,
          backend
        )
      },
      () => {
        const { backend } = makeBackend()
        backend.create.mockReturnValue({
          on: vi.fn(),
          show: vi.fn(() => {
            throw new Error('show failed')
          })
        })
        return new NotificationService(
          { get: () => ({ notificationsEnabled: true }) },
          { t: (key) => key },
          undefined,
          backend
        )
      }
    ]

    for (const createService of failures) {
      expect(() => createService().show('title', 'body')).not.toThrow()
    }
  })
})
