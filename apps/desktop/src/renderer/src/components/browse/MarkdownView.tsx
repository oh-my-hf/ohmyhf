import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import {
  hubBlobUrl,
  hubRelativeUrl,
  normalizeHubEndpoint,
  type RepoKind
} from '@oh-my-huggingface/shared'
import { openExternal } from '@/lib/ipc'
import { normalizeShikiLanguage } from '@/lib/file-kinds'
import { CodeBlock } from '@/components/browse/CodeBlock'
import { Lightbox } from '@/components/ui/lightbox'
import { useAppStore } from '@/stores/app'

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

/** Preserve punctuation in fence names (`c++`, `c#`, `objective-c`). */
export function markdownCodeLanguage(className: string | undefined): string | undefined {
  const raw = className
    ?.split(/\s+/)
    .find((token) => token.startsWith('language-'))
    ?.slice('language-'.length)
  return normalizeShikiLanguage(raw) ?? raw
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
  revision = 'main',
  endpoint?: string | null
): string {
  const query = new URLSearchParams({
    kind,
    repoId,
    revision,
    path,
    endpoint: normalizeHubEndpoint(endpoint)
  })
  return `omhf-file://repo/?${query.toString()}`
}

/** Resolve a repo-relative Markdown link while preserving its URL suffix. */
export function repoMarkdownLinkUrl(
  kind: RepoKind,
  repoId: string,
  revision: string,
  reference: string,
  endpoint?: string | null
): string {
  const suffixAt = reference.search(/[?#]/)
  const encodedPath = suffixAt < 0 ? reference : reference.slice(0, suffixAt)
  const suffix = suffixAt < 0 ? '' : reference.slice(suffixAt)
  let decodedPath = encodedPath
  try {
    decodedPath = decodeURIComponent(encodedPath)
  } catch {
    /* not percent-encoded */
  }
  return `${hubBlobUrl(kind, repoId, revision, decodedPath, endpoint)}${suffix}`
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
  const { t } = useTranslation('common')
  const content = useMemo(() => stripFrontmatter(markdown), [markdown])
  const endpoint = useAppStore((s) => s.settings.hubEndpoint)
  // Any rendered image opens full-size in the lightbox.
  const [lightbox, setLightbox] = useState<string>()

  const resolveRelative = (url: string, forImage: boolean): string => {
    if (/^[a-z][a-z\d+.-]*:/i.test(url)) return url
    if (url.startsWith('//')) return hubRelativeUrl(url, endpoint)
    if (url.startsWith('#')) return url
    const clean = url.replace(/^\.?\//, '')
    if (!kind || !repoId) return hubRelativeUrl(clean, endpoint)
    if (!forImage) {
      // Markdown URLs may carry a query/fragment, while Hub path helpers encode
      // literal file names. Split the URL suffix first to avoid turning `#L1`
      // into part of the file name or double-encoding `%20`.
      return repoMarkdownLinkUrl(kind, repoId, revision, clean, endpoint)
    }
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
    return repoFileUrl(kind, repoId, decoded, revision, endpoint)
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
            const image = (
              <img
                src={resolved}
                alt={alt ?? ''}
                loading="lazy"
                className={resolved ? 'cursor-zoom-in' : undefined}
              />
            )
            if (!resolved) return image
            return (
              <button
                type="button"
                aria-label={alt ? t('zoomImageNamed', { name: alt }) : t('zoomImage')}
                className="block max-w-full rounded-lg bg-transparent p-0 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                onClick={(event) => {
                  // A Markdown image can itself be wrapped in a link. Zoom is
                  // the image button's action, so don't also open that link.
                  event.stopPropagation()
                  setLightbox(resolved)
                }}
              >
                {image}
              </button>
            )
          },
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const language = markdownCodeLanguage(className)
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
