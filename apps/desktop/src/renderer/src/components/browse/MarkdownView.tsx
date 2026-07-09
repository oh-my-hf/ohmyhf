import { useEffect, useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import type { RepoKind } from '@oh-my-huggingface/shared'
import { openExternal } from '@/lib/ipc'
import { useAppStore } from '@/stores/app'

const RESOLVE_PREFIX: Record<RepoKind, string> = {
  model: '',
  dataset: 'datasets/',
  space: 'spaces/'
}

/**
 * Model cards are untrusted third-party content: raw HTML is allowed through
 * rehype-raw but everything is sanitized before rendering. Language classNames
 * survive so Shiki can highlight code.
 */
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ['className', /^language-./]]
  }
}

function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---')) return markdown
  const end = markdown.indexOf('\n---', 3)
  return end === -1 ? markdown : markdown.slice(end + 4)
}

function CodeBlock({ code, language }: { code: string; language?: string }): React.JSX.Element {
  const [html, setHtml] = useState<string | null>(null)
  const dark = document.documentElement.classList.contains('dark')

  useEffect(() => {
    let cancelled = false
    if (!language) return
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

export interface MarkdownViewProps {
  markdown: string
  kind: RepoKind
  repoId: string
  revision?: string
}

export function MarkdownView({
  markdown,
  kind,
  repoId,
  revision = 'main'
}: MarkdownViewProps): React.JSX.Element {
  useAppStore((s) => s.settings.theme) // re-render highlights on theme switch
  const content = useMemo(() => stripFrontmatter(markdown), [markdown])
  const base = `https://huggingface.co/${RESOLVE_PREFIX[kind]}${repoId}`

  const resolveRelative = (url: string, forImage: boolean): string => {
    if (/^(https?:|data:)/.test(url)) return url
    if (url.startsWith('#')) return url
    const clean = url.replace(/^\.?\//, '')
    return `${base}/${forImage ? 'resolve' : 'blob'}/${revision}/${clean}`
  }

  return (
    <div className="prose-card">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
        urlTransform={(url) => url}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault()
                if (href && !href.startsWith('#')) openExternal(resolveRelative(href, false))
              }}
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <img src={typeof src === 'string' ? resolveRelative(src, true) : undefined} alt={alt ?? ''} loading="lazy" />
          ),
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const language = /language-(\w+)/.exec(className ?? '')?.[1]
            const text = String(children ?? '')
            if (!language && !text.includes('\n')) {
              return <code>{text}</code>
            }
            return <CodeBlock code={text.replace(/\n$/, '')} language={language} />
          }
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}
