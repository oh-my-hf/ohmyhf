import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownToLine, ChevronLeft, ChevronRight, FileQuestion } from 'lucide-react'
import type { RepoKind } from '@oh-my-huggingface/shared'
import { repoFileUrl } from '@/components/browse/MarkdownView'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'

interface PdfPreviewProps {
  kind: RepoKind
  repoId: string
  path: string
  onDownload: () => void
  downloading: boolean
}

export function PdfPreview({
  kind,
  repoId,
  path,
  onDownload,
  downloading
}: PdfPreviewProps): React.JSX.Element {
  const { t } = useTranslation(['detail', 'common'])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // Keep the pdf.js document across page flips without re-fetching.
  const docRef = useRef<import('pdfjs-dist').PDFDocumentProxy | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setPage(1)
    setPageCount(0)
    docRef.current = null

    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        // Vite emits the worker as a static asset URL (?url).
        const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        const doc = await pdfjs.getDocument({ url: repoFileUrl(kind, repoId, path) }).promise
        if (cancelled) {
          await doc.cleanup()
          return
        }
        docRef.current = doc
        setPageCount(doc.numPages)
        setLoading(false)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
      const doc = docRef.current
      docRef.current = null
      if (doc) void doc.cleanup()
    }
  }, [kind, repoId, path])

  useEffect(() => {
    const doc = docRef.current
    const canvas = canvasRef.current
    if (!doc || !canvas || page < 1 || page > pageCount) return
    let cancelled = false

    void (async () => {
      try {
        const pdfPage = await doc.getPage(page)
        if (cancelled) return
        const viewport = pdfPage.getViewport({ scale: 1.25 })
        const context = canvas.getContext('2d')
        if (!context) return
        canvas.width = viewport.width
        canvas.height = viewport.height
        await pdfPage.render({ canvasContext: context, viewport, canvas }).promise
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [page, pageCount, loading])

  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (error || pageCount === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={FileQuestion}
          title={t('detail:preview.pdfErrorTitle')}
          body={t('detail:preview.pdfErrorBody')}
          action={
            <Button variant="secondary" size="sm" loading={downloading} onClick={onDownload}>
              <ArrowDownToLine className="size-3.5" aria-hidden />
              {t('detail:files.download')}
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <span className="text-[12px] text-ink-muted">
          {t('detail:preview.pdfPage', { page, total: pageCount })}
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t('detail:datasetPreview.prev')}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t('detail:datasetPreview.next')}
            disabled={page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-panel/40 p-4">
        <canvas ref={canvasRef} className="max-w-full shadow-sm" />
      </div>
    </div>
  )
}
