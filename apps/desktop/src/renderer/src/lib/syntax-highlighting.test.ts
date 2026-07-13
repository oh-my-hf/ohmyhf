import { describe, expect, it } from 'vitest'
import { SHIKI_LANGUAGE_IDS } from './file-kinds'
import { highlightCode, loadHighlightLanguage } from './syntax-highlighting'

describe('syntax highlighting', () => {
  it('highlights Python with one light/dark token tree and no WASM setup', async () => {
    const html = await highlightCode('def greet(name):\n    return f"Hello, {name}"', 'python')

    expect(html).toContain('class="shiki shiki-themes github-light github-dark-dimmed"')
    expect(html).toContain('class="line"')
    expect(html).toContain('--shiki-dark:')
    expect(html).toContain('>def</span>')
  })

  it.each(SHIKI_LANGUAGE_IDS)('loads the explicit %s grammar', async (language) => {
    await expect(loadHighlightLanguage(language)).resolves.toBeUndefined()
  })
})
