import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'

/**
 * Full-window image viewer: dark scrim, the image at its natural size (capped
 * to the viewport), dismissed by clicking anywhere or pressing Escape.
 */
export function Lightbox({
  src,
  onClose
}: {
  /** Absolute image URL; undefined renders nothing. */
  src?: string
  onClose: () => void
}): React.JSX.Element {
  const { t } = useTranslation('common')
  return (
    <DialogPrimitive.Root open={src !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="animate-fade fixed inset-0 z-50 bg-black/85" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center p-6 outline-none"
          onClick={onClose}
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">{t('imageViewer')}</DialogPrimitive.Title>
          {src !== undefined && (
            <img
              src={src}
              alt=""
              className="max-h-full max-w-full rounded-lg object-contain shadow-overlay"
              draggable={false}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
