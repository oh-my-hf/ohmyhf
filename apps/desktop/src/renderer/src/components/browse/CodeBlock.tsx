import { useEffect, useState } from 'react'
import { useAppStore } from '@/stores/app'

/** Shiki is skipped above this size — tokenizing near-megabyte files janks the UI thread. */
const HIGHLIGHT_MAX_CHARS = 100_000

/**
 * Syntax-highlighted code block, shared by the Markdown renderer and the file
 * preview. Falls back to a plain `<pre>` while Shiki loads, for unknown
 * languages, and for very large inputs.
 */
export function CodeBlock({
  code,
  language
}: {
  code: string
  language?: string
}): React.JSX.Element {
  const [html, setHtml] = useState<string | null>(null)
  useAppStore((s) => s.settings.theme) // re-render highlights on theme switch
  const dark = document.documentElement.classList.contains('dark')

  useEffect(() => {
    let cancelled = false
    if (!language || code.length > HIGHLIGHT_MAX_CHARS) return
    void import('shiki')
      .then((shiki) =>
        shiki.codeToHtml(code, {
          lang: language,
          theme: dark ? 'github-dark' : 'github-light'
        })
      )
      .then((out) => {
        if (!cancelled) setHtml(out)
      })
      .catch(() => {
        /* unknown language: keep plain rendering */
      })
    return () => {
      cancelled = true
    }
  }, [code, language, dark])

  if (html) {
    // Shiki output is generated locally from already-sanitized text content.
    return <div dangerouslySetInnerHTML={{ __html: html }} />
  }
  return (
    <pre>
      <code>{code}</code>
    </pre>
  )
}
