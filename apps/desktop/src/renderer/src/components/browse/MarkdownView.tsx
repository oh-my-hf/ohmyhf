import { useMemo } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import type { RepoKind } from '@oh-my-huggingface/shared'
import { openExternal } from '@/lib/ipc'
import { RESOLVE_PREFIX } from '@/lib/file-kinds'
import { CodeBlock } from '@/components/browse/CodeBlock'

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

export interface MarkdownViewProps {
  markdown: string
  /** Repo context for resolving relative links; omit for non-repo content (posts). */
  kind?: RepoKind
  repoId?: string
  revision?: string
}

export function MarkdownView({
  markdown,
  kind,
  repoId,
  revision = 'main'
}: MarkdownViewProps): React.JSX.Element {
  const content = useMemo(() => stripFrontmatter(markdown), [markdown])
  const base = kind && repoId ? `https://huggingface.co/${RESOLVE_PREFIX[kind]}${repoId}` : undefined

  const resolveRelative = (url: string, forImage: boolean): string => {
    if (/^(https?:|data:)/.test(url)) return url
    if (url.startsWith('#')) return url
    const clean = url.replace(/^\.?\//, '')
    return base
      ? `${base}/${forImage ? 'resolve' : 'blob'}/${revision}/${clean}`
      : `https://huggingface.co/${clean}`
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
            <img
              src={typeof src === 'string' ? resolveRelative(src, true) : undefined}
              alt={alt ?? ''}
              loading="lazy"
            />
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
