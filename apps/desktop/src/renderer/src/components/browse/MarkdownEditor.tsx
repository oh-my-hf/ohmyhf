import { useCallback, useEffect, useRef, useState } from 'react'
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
import { applyFormat, continueLine, mentionAtCaret, type Format } from '@/lib/editor'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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

/** Avatar/name for a mentioned user, remembered so chips can re-render with the avatar. */
interface MentionInfo {
  avatarUrl?: string
  fullname?: string
}

/*
 * The editor is a `white-space: pre-wrap` contenteditable whose content is a flat
 * run of text nodes and atomic `@mention` chip spans (contenteditable="false").
 * Newlines live as "\n" inside text nodes (Enter is handled manually), so the DOM
 * ⇄ markdown bridge is trivial and the string helpers in lib/editor.ts still apply.
 */

/** "@username" length a chip stands for in the serialized string. */
function chipLen(el: HTMLElement): number {
  return (el.dataset.mention ?? '').length + 1
}

/** Serialize the editor DOM (or a fragment wrapper) back to markdown text. */
function serialize(root: HTMLElement): string {
  let out = ''
  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? ''
    } else if (node instanceof HTMLElement) {
      if (node.dataset.mention) out += `@${node.dataset.mention}`
      else if (node.tagName === 'BR') out += '\n'
      else out += node.textContent ?? ''
    }
  })
  return out
}

/** String offset of the caret within the editor (chips count as their "@username"). */
function caretOffset(root: HTMLElement): number | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (range.startContainer !== root && !root.contains(range.startContainer)) return null
  const pre = document.createRange()
  pre.selectNodeContents(root)
  pre.setEnd(range.startContainer, range.startOffset)
  const wrapper = document.createElement('div')
  wrapper.appendChild(pre.cloneContents())
  return serialize(wrapper).length
}

/** Place the caret at a string offset (mirrors caretOffset). */
function setCaret(root: HTMLElement, offset: number): void {
  const sel = window.getSelection()
  if (!sel) return
  let remaining = offset
  const range = document.createRange()
  for (const node of Array.from(root.childNodes)) {
    const len =
      node.nodeType === Node.TEXT_NODE
        ? (node.textContent?.length ?? 0)
        : node instanceof HTMLElement
          ? node.dataset.mention
            ? chipLen(node)
            : node.tagName === 'BR'
              ? 1
              : (node.textContent?.length ?? 0)
          : 0
    if (remaining <= len) {
      if (node.nodeType === Node.TEXT_NODE) {
        range.setStart(node, remaining)
      } else if (remaining >= len) {
        range.setStartAfter(node)
      } else {
        range.setStartBefore(node)
      }
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
      return
    }
    remaining -= len
  }
  range.selectNodeContents(root)
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
}

/** Build a chip node for @username (with avatar when known). */
function makeChip(username: string, info: MentionInfo | undefined): HTMLElement {
  const chip = document.createElement('span')
  chip.dataset.mention = username
  chip.contentEditable = 'false'
  chip.className =
    'mx-px inline-flex items-center gap-1 rounded-full border border-select/30 bg-select/10 px-1.5 align-middle text-[12.5px] font-medium text-select'
  if (info?.avatarUrl) {
    const img = document.createElement('img')
    img.src = info.avatarUrl
    img.alt = ''
    img.className = 'size-4 rounded-full'
    chip.appendChild(img)
  }
  chip.appendChild(document.createTextNode(`@${username}`))
  return chip
}

/** Matches a mention token at a valid boundary (line start or after whitespace/brackets). */
const MENTION_TOKEN = /(^|[\s([{>])@([\w.-]{1,30})/g

/**
 * Turn @mentions into profile links so the Preview shows what the posted comment
 * will actually look like (the Hub linkifies mentions in rendered markdown).
 */
function linkifyMentions(markdown: string): string {
  return markdown.replace(
    MENTION_TOKEN,
    (_, boundary: string, name: string) => `${boundary}[@${name}](https://huggingface.co/${name})`
  )
}

/** Rebuild the editor DOM from markdown, chip-ifying mention tokens. */
function renderInto(root: HTMLElement, markdown: string, meta: Map<string, MentionInfo>): void {
  root.textContent = ''
  let last = 0
  MENTION_TOKEN.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MENTION_TOKEN.exec(markdown)) !== null) {
    const boundary = m[1] ?? ''
    const username = m[2] ?? ''
    const at = m.index + boundary.length
    if (at > last) root.appendChild(document.createTextNode(markdown.slice(last, at)))
    root.appendChild(makeChip(username, meta.get(username)))
    last = at + 1 + username.length
    MENTION_TOKEN.lastIndex = last
  }
  if (last < markdown.length) root.appendChild(document.createTextNode(markdown.slice(last)))
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
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const editorRef = useRef<HTMLDivElement | null>(null)
  // Known avatars/names, so re-renders keep chips rich; survives across edits.
  const mentionMeta = useRef<Map<string, MentionInfo>>(new Map())
  // Latest value for the callback ref — remount sync must not close over a stale prop.
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])

  const mentionQuery = useDebounced(mention?.query ?? '', 200)
  const userSearch = useQuery({
    queryKey: ['user-search', mentionQuery],
    queryFn: () => invoke('hub:searchUsers', { query: mentionQuery }),
    enabled: mention !== null && mentionQuery.length >= 1,
    staleTime: 60_000
  })
  const mentionResults: UserSearchResult[] =
    mention && mentionQuery.length >= 1 ? (userSearch.data ?? []) : []
  const activeIndex = Math.min(mentionIndex, Math.max(0, mentionResults.length - 1))

  /** Paint `value` into the contenteditable when the DOM is empty/stale. */
  const syncEditorDom = (root: HTMLDivElement): void => {
    if (valueRef.current === serialize(root)) return
    renderInto(root, valueRef.current, mentionMeta.current)
  }

  // Callback ref: Radix Presence can mount the Write pane *after* a tab-change
  // effect would have run (and found editorRef === null). Syncing here restores
  // text as soon as the node actually attaches.
  const setEditorRef = useCallback((node: HTMLDivElement | null) => {
    editorRef.current = node
    if (node) syncEditorDom(node)
  }, [])

  // Push the current DOM to the parent as markdown.
  const emit = (): string => {
    const root = editorRef.current
    if (!root) return value
    const next = serialize(root)
    onChange(next)
    return next
  }

  const syncMention = (): void => {
    const root = editorRef.current
    if (!root) return
    const offset = caretOffset(root)
    const next = offset === null ? null : mentionAtCaret(serialize(root), offset)
    if (next?.query !== mention?.query) setMentionIndex(0)
    setMention(next)
  }

  // External value changes (draft cleared after send, restored on error) while
  // the editor is mounted. Tab switches are handled by forceMount + setEditorRef.
  useEffect(() => {
    const root = editorRef.current
    if (!root) return
    syncEditorDom(root)
  }, [value])

  const onInput = (): void => {
    emit()
    syncMention()
  }

  /** Replace an in-progress "@query" with a chip and a trailing space. */
  const insertMention = (user: UserSearchResult): void => {
    const root = editorRef.current
    if (!root || !mention) return
    mentionMeta.current.set(user.name, { avatarUrl: user.avatarUrl, fullname: user.fullname })
    const md = serialize(root)
    const caret = mention.start + 1 + mention.query.length
    const next = `${md.slice(0, mention.start)}@${user.name} ${md.slice(caret)}`
    renderInto(root, next, mentionMeta.current)
    setCaret(root, mention.start + user.name.length + 2)
    setMention(null)
    onChange(next)
  }

  /** Apply a string-level edit (toolbar/list) then restore the caret. */
  const applyEdit = (next: string, selStart: number): void => {
    const root = editorRef.current
    if (!root) return
    renderInto(root, next, mentionMeta.current)
    root.focus()
    setCaret(root, selStart)
    onChange(next)
  }

  const format = (fmt: Format): void => {
    const root = editorRef.current
    if (!root) return
    const md = serialize(root)
    const caret = caretOffset(root) ?? md.length
    const { next, selectStart } = applyFormat(md, caret, caret, fmt)
    applyEdit(next, selectStart)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
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
    if (e.key === 'Enter' && !e.shiftKey) {
      const root = editorRef.current
      const caret = root ? caretOffset(root) : null
      // GitHub-style list continuation; otherwise insert a literal newline
      // (default contenteditable Enter would splinter into <div>/<br> blocks).
      if (root && caret !== null) {
        const result = continueLine(serialize(root), caret)
        e.preventDefault()
        if (result) {
          applyEdit(result.next, result.selectStart)
        } else {
          const md = serialize(root)
          applyEdit(`${md.slice(0, caret)}\n${md.slice(caret)}`, caret + 1)
        }
      }
    }
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
    <div className="rounded-lg border bg-bg transition-colors duration-150 focus-within:border-focus/50">
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
        {/* forceMount keeps the contenteditable alive across Preview round-trips;
            without it Radix unmounts the pane and the DOM (but not `value`) is lost.
            Inactive state is hidden via data-state so both panes don't stack. */}
        <TabsContent
          value="write"
          forceMount
          className="relative data-[state=inactive]:hidden"
        >
          <div
            ref={setEditorRef}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-expanded={mention !== null}
            aria-autocomplete="list"
            data-placeholder={placeholder}
            onInput={onInput}
            onKeyUp={syncMention}
            onClick={syncMention}
            onBlur={() => setMention(null)}
            onKeyDown={onKeyDown}
            className="max-h-80 min-h-20 overflow-y-auto px-3 py-2.5 pb-6 text-[13px] whitespace-pre-wrap outline-none empty:before:text-ink-faint empty:before:content-[attr(data-placeholder)]"
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
              className="animate-fade-rise absolute inset-x-2 bottom-full z-30 mb-1 max-h-56 overflow-y-auto rounded-md border bg-bg p-1 shadow-overlay"
            >
              {mentionQuery.length === 0 && (
                <p className="flex items-center gap-1.5 px-2 py-1.5 text-[12px] text-ink-faint">
                  <AtSign className="size-3.5" aria-hidden />
                  {t('editor.mentionHint')}
                </p>
              )}
              {mentionQuery.length >= 1 && !userSearch.isLoading && mentionResults.length === 0 && (
                <p className="px-2 py-1.5 text-[12px] text-ink-faint">{t('editor.mentionEmpty')}</p>
              )}
              {mentionResults.map((user, index) => (
                <button
                  key={user.name}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  // preventDefault keeps the editor focused so the caret survives insertion.
                  onMouseDown={(e) => {
                    e.preventDefault()
                    insertMention(user)
                  }}
                  onMouseEnter={() => setMentionIndex(index)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px]',
                    index === activeIndex && 'bg-select/10 text-select'
                  )}
                >
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt=""
                      className="size-5 shrink-0 rounded-full border"
                    />
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
            <MarkdownView markdown={linkifyMentions(value)} kind={kind} repoId={repoId} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
