import { useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import type { RepoKind } from '@oh-my-huggingface/shared'
import { openExternal } from '@/lib/ipc'
import { RESOLVE_PREFIX } from '@/lib/file-kinds'
import { CodeBlock } from '@/components/browse/CodeBlock'
import { Lightbox } from '@/components/ui/lightbox'

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

/**
 * URL for a repo file served through the app's omhf-file:// protocol: the
 * main process fetches the Hub resolve URL with the hub client's auth and
 * proxy, so images in private/gated repos render (a direct https resolve URL
 * carries no Authorization header and 401s). Public repos pass through the
 * same path unauthenticated. `path` is the raw (undecoded) repo path.
 */
export function repoFileUrl(
  kind: RepoKind,
  repoId: string,
  path: string,
  revision = 'main'
): string {
  const query = new URLSearchParams({ kind, repoId, revision, path })
  return `omhf-file://repo/?${query.toString()}`
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
  const base =
    kind && repoId ? `https://huggingface.co/${RESOLVE_PREFIX[kind]}${repoId}` : undefined
  // Any rendered image opens full-size in the lightbox.
  const [lightbox, setLightbox] = useState<string>()

  const resolveRelative = (url: string, forImage: boolean): string => {
    if (/^(https?:|data:)/.test(url)) return url
    if (url.startsWith('#')) return url
    const clean = url.replace(/^\.?\//, '')
    if (!kind || !repoId || !base) return `https://huggingface.co/${clean}`
    if (!forImage) return `${base}/blob/${revision}/${clean}`
    // Repo-relative images go through the authenticated omhf-file protocol so
    // private/gated repo assets render. Markdown srcs are URL references:
    // drop any query/fragment and percent-decode into the raw repo path
    // (a stray '%' that is not an escape keeps the original string).
    const filePath = clean.split(/[?#]/, 1)[0] ?? clean
    let decoded = filePath
    try {
      decoded = decodeURIComponent(filePath)
    } catch {
      /* not percent-encoded */
    }
    return repoFileUrl(kind, repoId, decoded, revision)
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
          img: ({ src, alt }) => {
            const resolved = typeof src === 'string' ? resolveRelative(src, true) : undefined
            return (
              <img
                src={resolved}
                alt={alt ?? ''}
                loading="lazy"
                className="cursor-zoom-in"
                onClick={() => resolved !== undefined && setLightbox(resolved)}
              />
            )
          },
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
      <Lightbox src={lightbox} onClose={() => setLightbox(undefined)} />
    </div>
  )
}
