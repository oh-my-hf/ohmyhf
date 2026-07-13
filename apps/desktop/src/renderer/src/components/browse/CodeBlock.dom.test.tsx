// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const highlighting = vi.hoisted(() => ({ highlightCode: vi.fn() }))

vi.mock('@/lib/syntax-highlighting', () => highlighting)
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params?.language ? `${key}:${params.language}` : key
  })
}))

import { CodeBlock, HIGHLIGHT_MAX_CHARS } from './CodeBlock'

afterEach(() => {
  cleanup()
  highlighting.highlightCode.mockReset()
})

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('CodeBlock async highlighting', () => {
  it('highlights recognized code at the exact 100,000-character boundary', async () => {
    highlighting.highlightCode.mockResolvedValue(
      '<pre class="shiki"><code><span style="color:#000">ready</span></code></pre>'
    )
    const code = 'x'.repeat(HIGHLIGHT_MAX_CHARS)

    const { container } = render(<CodeBlock code={code} language="python" />)

    await waitFor(() => expect(container.querySelector('.shiki')).not.toBeNull())
    expect(screen.queryByText('detail:preview.highlightTooLarge')).toBeNull()
  })

  it('never paints a late result from the previously selected file', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    highlighting.highlightCode
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { container, rerender } = render(<CodeBlock code="old file" language="python" />)

    rerender(<CodeBlock code="new file" language="python" />)
    first.resolve('<pre class="shiki"><code>STALE_RESULT</code></pre>')
    await waitFor(() => expect(container.textContent).not.toContain('STALE_RESULT'))
    second.resolve('<pre class="shiki"><code>NEW_RESULT</code></pre>')
    await waitFor(() => expect(container.textContent).toContain('NEW_RESULT'))
  })

  it('shows a distinct load failure and retries the same input', async () => {
    highlighting.highlightCode
      .mockRejectedValueOnce(new Error('chunk failed'))
      .mockResolvedValueOnce('<pre class="shiki"><code>RECOVERED</code></pre>')
    const { container } = render(<CodeBlock code="print(1)" language="python" />)

    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'common:retry' }))

    await waitFor(() => expect(container.textContent).toContain('RECOVERED'))
    expect(highlighting.highlightCode).toHaveBeenCalledTimes(2)
  })
})
