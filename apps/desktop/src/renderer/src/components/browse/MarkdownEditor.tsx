import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bold,
  Code,
  Italic,
  Link as LinkIcon,
  List,
  TextQuote,
  type LucideIcon
} from 'lucide-react'
import type { RepoKind } from '@oh-my-huggingface/shared'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { MarkdownView } from '@/components/browse/MarkdownView'

type Format = 'bold' | 'italic' | 'code' | 'link' | 'quote' | 'list'

interface FormatResult {
  next: string
  selectStart: number
  selectEnd: number
}

function applyFormat(value: string, start: number, end: number, format: Format): FormatResult {
  const selected = value.slice(start, end)
  const wrap = (fence: string): FormatResult => ({
    next: value.slice(0, start) + fence + selected + fence + value.slice(end),
    selectStart: start + fence.length,
    selectEnd: end + fence.length
  })
  switch (format) {
    case 'bold':
      return wrap('**')
    case 'italic':
      return wrap('*')
    case 'code':
      return wrap('`')
    case 'link': {
      // Selection becomes the link text; the url placeholder stays selected for overtyping.
      const next = `${value.slice(0, start)}[${selected}](url)${value.slice(end)}`
      const urlStart = start + selected.length + 3
      return { next, selectStart: urlStart, selectEnd: urlStart + 3 }
    }
    case 'quote':
    case 'list': {
      const marker = format === 'quote' ? '> ' : '- '
      // start === 0 must clamp to 0: lastIndexOf('\n', -1) would still find a leading newline.
      const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1
      const block = value.slice(lineStart, end)
      const prefixed = block
        .split('\n')
        .map((line) => marker + line)
        .join('\n')
      return {
        next: value.slice(0, lineStart) + prefixed + value.slice(end),
        selectStart: lineStart,
        selectEnd: lineStart + prefixed.length
      }
    }
  }
}

export interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  /** Invoked on Cmd/Ctrl+Enter. The caller owns the actual send flow. */
  onSubmit?: () => void
  placeholder?: string
  kind: RepoKind
  repoId: string
}

export function MarkdownEditor({
  value,
  onChange,
  onSubmit,
  placeholder,
  kind,
  repoId
}: MarkdownEditorProps): React.JSX.Element {
  const { t } = useTranslation('detail')
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow with the draft, capped so long replies scroll instead of eating the thread.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`
  }, [value, tab])

  const format = (fmt: Format): void => {
    const el = textareaRef.current
    if (!el) return
    const { next, selectStart, selectEnd } = applyFormat(
      value,
      el.selectionStart,
      el.selectionEnd,
      fmt
    )
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(selectStart, selectEnd)
    })
  }

  const tools: Array<{ id: Format; icon: LucideIcon; label: string }> = [
    { id: 'bold', icon: Bold, label: t('editor.bold') },
    { id: 'italic', icon: Italic, label: t('editor.italic') },
    { id: 'code', icon: Code, label: t('editor.code') },
    { id: 'link', icon: LinkIcon, label: t('editor.link') },
    { id: 'quote', icon: TextQuote, label: t('editor.quote') },
    { id: 'list', icon: List, label: t('editor.bulletList') }
  ]

  return (
    <div className="rounded-lg border bg-bg transition-colors duration-150 focus-within:border-primary">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'write' | 'preview')}>
        <div className="flex items-center justify-between gap-2 border-b pr-1.5">
          <TabsList className="border-b-0">
            <TabsTrigger value="write" className="py-1.5 text-[12.5px]">
              {t('editor.write')}
            </TabsTrigger>
            <TabsTrigger value="preview" className="py-1.5 text-[12.5px]">
              {t('editor.preview')}
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-0.5">
            {tools.map(({ id, icon: Icon, label }) => (
              <Button
                key={id}
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={label}
                title={label}
                disabled={tab !== 'write'}
                onClick={() => format(id)}
              >
                <Icon className="size-3.5" aria-hidden />
              </Button>
            ))}
          </div>
        </div>
        <TabsContent value="write" className="relative">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                onSubmit?.()
              }
            }}
            placeholder={placeholder}
            rows={3}
            className="min-h-20 resize-none overflow-y-auto rounded-t-none border-0 bg-transparent px-3 py-2.5 pb-6 focus-visible:border-transparent focus-visible:ring-0"
          />
          <span
            className="pointer-events-none absolute right-2.5 bottom-1.5 font-mono text-[10.5px] text-ink-faint"
            title={t('editor.charCount')}
          >
            {value.length}
          </span>
        </TabsContent>
        <TabsContent value="preview" className="max-h-80 min-h-20 overflow-y-auto p-3">
          {value.trim() === '' ? (
            <p className="text-[12.5px] text-ink-faint">{t('editor.previewEmpty')}</p>
          ) : (
            <MarkdownView markdown={value} kind={kind} repoId={repoId} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
