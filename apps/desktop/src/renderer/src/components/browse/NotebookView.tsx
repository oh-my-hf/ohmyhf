import { useState } from 'react'
import type { RepoKind } from '@oh-my-huggingface/shared'
import type { NotebookCell, NotebookOutput, ParsedNotebook } from '@/lib/notebook'
import { CodeBlock } from '@/components/browse/CodeBlock'
import { MarkdownView } from '@/components/browse/MarkdownView'
import { Lightbox } from '@/components/ui/lightbox'

interface NotebookViewProps {
  notebook: ParsedNotebook
  /** Repo context so markdown-cell relative images load via omhf-file://. */
  kind: RepoKind
  repoId: string
}

/** `In [n]:` / `Out[n]:` gutter label; blank prompt for never-executed cells. */
function Prompt({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="shrink-0 pt-2 pr-2 text-right font-mono text-[11px] text-ink-faint select-none">
      {label}
    </div>
  )
}

function CodeArea({ code, language }: { code: string; language?: string }): React.JSX.Element {
  return (
    <div className="min-w-0 flex-1 overflow-hidden rounded-md border border-border-card bg-panel [&_pre]:overflow-x-auto [&_pre]:p-2.5 [&_pre]:font-mono [&_pre]:text-[12px] [&_pre]:leading-relaxed [&_.shiki]:bg-transparent!">
      <CodeBlock code={code} language={language} />
    </div>
  )
}

function OutputBlock({
  output,
  onZoom
}: {
  output: NotebookOutput
  onZoom: (src: string) => void
}): React.JSX.Element | null {
  switch (output.kind) {
    case 'stream':
      return (
        <pre
          className={`overflow-x-auto rounded-md px-2.5 py-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap ${
            output.stream === 'stderr' ? 'bg-error/10 text-error' : 'bg-panel-2 text-ink'
          }`}
        >
          {output.text}
        </pre>
      )
    case 'text':
      return (
        <pre className="overflow-x-auto rounded-md bg-panel-2 px-2.5 py-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink">
          {output.text}
        </pre>
      )
    case 'error':
      return (
        <pre className="overflow-x-auto rounded-md bg-error/10 px-2.5 py-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-error">
          {output.text}
        </pre>
      )
    case 'image':
      return (
        <img
          src={output.image.dataUri}
          alt=""
          className="max-w-full cursor-zoom-in rounded-md border border-border-card bg-white"
          onClick={() => onZoom(output.image.dataUri)}
        />
      )
    case 'html':
      // Rendered through the same sanitizing pipeline as model cards (raw HTML
      // is parsed then stripped of scripts/handlers); covers pandas tables etc.
      return (
        <div className="overflow-x-auto rounded-md bg-panel-2 px-2.5 py-2">
          <MarkdownView markdown={output.html} />
        </div>
      )
    default:
      return null
  }
}

function Cell({
  cell,
  language,
  kind,
  repoId,
  onZoom
}: {
  cell: NotebookCell
  language?: string
  kind: RepoKind
  repoId: string
  onZoom: (src: string) => void
}): React.JSX.Element {
  if (cell.type === 'markdown') {
    return (
      <div className="px-1 py-1">
        <MarkdownView markdown={cell.source} kind={kind} repoId={repoId} />
      </div>
    )
  }
  if (cell.type === 'raw') {
    return (
      <pre className="mx-1 overflow-x-auto rounded-md bg-panel-2 px-2.5 py-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink-muted">
        {cell.source}
      </pre>
    )
  }
  const prompt = cell.executionCount != null ? `In [${cell.executionCount}]:` : 'In [ ]:'
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start">
        <Prompt label={prompt} />
        <CodeArea code={cell.source} language={language} />
      </div>
      {cell.outputs && cell.outputs.length > 0 && (
        <div className="flex flex-col gap-1.5 pl-[3.25rem]">
          {cell.outputs.map((output, i) => (
            <OutputBlock key={i} output={output} onZoom={onZoom} />
          ))}
        </div>
      )}
    </div>
  )
}

export function NotebookView({ notebook, kind, repoId }: NotebookViewProps): React.JSX.Element {
  const [lightbox, setLightbox] = useState<string>()
  return (
    <div className="flex flex-col gap-4 p-4">
      {notebook.cells.map((cell, i) => (
        <Cell
          key={i}
          cell={cell}
          language={notebook.language}
          kind={kind}
          repoId={repoId}
          onZoom={setLightbox}
        />
      ))}
      <Lightbox src={lightbox} onClose={() => setLightbox(undefined)} />
    </div>
  )
}
