import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  AtSign,
  Bold,
  Code,
  Italic,
  Link as LinkIcon,
  List,
  TextQuote,
  type LucideIcon
} from 'lucide-react'
import type { RepoKind, UserSearchResult } from '@oh-my-huggingface/shared'
import { invoke } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { useDebounced } from '@/hooks/use-debounced'
import {
  applyFormat,
  continueLine,
  mentionAtCaret,
  type ActiveMention,
  type Format
} from '@/lib/editor'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { MarkdownView } from '@/components/browse/MarkdownView'

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
  const [mention, setMention] = useState<ActiveMention | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const mentionQuery = useDebounced(mention?.query ?? '', 200)
  const userSearch = useQuery({
    queryKey: ['user-search', mentionQuery],
    queryFn: () => invoke('hub:searchUsers', { query: mentionQuery }),
    enabled: mention !== null && mentionQuery.length >= 1,
    staleTime: 60_000
  })
  const mentionResults: UserSearchResult[] =
    mention && mentionQuery.length >= 1 ? (userSearch.data ?? []) : []

  /** Re-derive the active @mention from the current caret position. */
  const syncMention = (el: HTMLTextAreaElement): void => {
    const next =
      el.selectionStart === el.selectionEnd ? mentionAtCaret(el.value, el.selectionStart) : null
    if (next?.query !== mention?.query) setMentionIndex(0)
    setMention(next)
  }

  // Results can shrink between keystrokes; never let the highlight point past the end.
  const activeIndex = Math.min(mentionIndex, Math.max(0, mentionResults.length - 1))

  const applyEdit = (next: string, selectStart: number, selectEnd = selectStart): void => {
    onChange(next)
    const el = textareaRef.current
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      el.setSelectionRange(selectStart, selectEnd)
    })
  }

  const insertMention = (user: UserSearchResult): void => {
    if (!mention) return
    const caret = mention.start + 1 + mention.query.length
    const inserted = `@${user.name} `
    const next = value.slice(0, mention.start) + inserted + value.slice(caret)
    setMention(null)
    applyEdit(next, mention.start + inserted.length)
  }

  /** GitHub-style Enter behavior: continue `>`/`-`/`*`/`1.` markers, exit on empty items. */
  const continueListOnEnter = (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    const el = e.currentTarget
    if (el.selectionStart !== el.selectionEnd) return false
    const result = continueLine(value, el.selectionStart)
    if (!result) return false
    applyEdit(result.next, result.selectStart)
    return true
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onSubmit?.()
      return
    }
    if (mention && mentionResults.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const delta = e.key === 'ArrowDown' ? 1 : -1
        setMentionIndex((activeIndex + delta + mentionResults.length) % mentionResults.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const user = mentionResults[activeIndex]
        if (user) insertMention(user)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMention(null)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && continueListOnEnter(e)) {
      e.preventDefault()
    }
  }

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
            onChange={(e) => {
              onChange(e.target.value)
              syncMention(e.target)
            }}
            onSelect={(e) => syncMention(e.currentTarget)}
            onBlur={() => setMention(null)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={3}
            role="combobox"
            aria-expanded={mention !== null}
            aria-autocomplete="list"
            className="min-h-20 resize-none overflow-y-auto rounded-t-none border-0 bg-transparent px-3 py-2.5 pb-6 focus-visible:border-transparent focus-visible:ring-0"
          />
          <span
            className="pointer-events-none absolute right-2.5 bottom-1.5 font-mono text-[10.5px] text-ink-faint"
            title={t('editor.charCount')}
          >
            {value.length}
          </span>

          {mention !== null && (
            <div
              role="listbox"
              aria-label={t('editor.mentionHint')}
              className="animate-fade-rise absolute inset-x-2 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-md border bg-bg p-1 shadow-overlay"
            >
              {mentionQuery.length === 0 && (
                <p className="flex items-center gap-1.5 px-2 py-1.5 text-[12px] text-ink-faint">
                  <AtSign className="size-3.5" aria-hidden />
                  {t('editor.mentionHint')}
                </p>
              )}
              {mentionQuery.length >= 1 && !userSearch.isLoading && mentionResults.length === 0 && (
                <p className="px-2 py-1.5 text-[12px] text-ink-faint">
                  {t('editor.mentionEmpty')}
                </p>
              )}
              {mentionResults.map((user, index) => (
                <button
                  key={user.name}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  // preventDefault keeps the textarea focused so the caret survives insertion.
                  onMouseDown={(e) => {
                    e.preventDefault()
                    insertMention(user)
                  }}
                  onMouseEnter={() => setMentionIndex(index)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px]',
                    index === activeIndex && 'bg-primary/10 text-primary'
                  )}
                >
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="size-5 shrink-0 rounded-full border" />
                  ) : (
                    <AtSign className="size-4 shrink-0 text-ink-faint" aria-hidden />
                  )}
                  <span className="font-medium">{user.name}</span>
                  {user.fullname && user.fullname !== user.name && (
                    <span className="min-w-0 truncate text-[12px] text-ink-faint">
                      {user.fullname}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
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
