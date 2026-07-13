import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { SHORTCUT_GROUPS, shortcutList } from '@/lib/shortcuts'
import { useAppStore } from '@/stores/app'

/** Keyboard-shortcuts overlay, opened with `?` or from the command palette. */
export function ShortcutsHelpDialog(): React.JSX.Element {
  const { t } = useTranslation('shortcuts')
  const open = useAppStore((s) => s.shortcutsOpen)
  const setOpen = useAppStore((s) => s.setShortcutsOpen)
  const appInfo = useAppStore((s) => s.appInfo)
  const defs = shortcutList(appInfo?.platform === 'darwin')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[32rem]">
        <DialogTitle className="text-smd font-semibold text-ink-strong">{t('title')}</DialogTitle>
        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-5">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group} className="flex flex-col gap-2">
              <h3 className="text-[12px] font-semibold text-ink-faint">{t(`groups.${group}`)}</h3>
              <dl className="flex flex-col gap-1.5">
                {defs
                  .filter((def) => def.group === group)
                  .map((def) => (
                    <div key={def.labelKey} className="flex items-center justify-between gap-3">
                      <dt className="min-w-0 truncate text-[12.5px] text-ink">{t(def.labelKey)}</dt>
                      <dd className="flex shrink-0 items-center gap-1">
                        {def.keys.map((key, i) => (
                          <Fragment key={`${def.labelKey}:${key}:${i}`}>
                            <Kbd className="h-[18px] min-w-[18px] text-[10.5px]">{key}</Kbd>
                          </Fragment>
                        ))}
                      </dd>
                    </div>
                  ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
