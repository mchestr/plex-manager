"use client"

import { CountRegion } from "@/components/admin/cleanup/editor/live-region"
import { sizeText } from "@/components/admin/cleanup/preview/sizes"
import { Button } from "@/components/ui/button"
import { nounWord } from "@/lib/cleanup/fields/words"
import type { PreviewResponse } from "@/lib/cleanup/types/preview"
import { useFormat } from "@/lib/format-context"
import { cn } from "@/lib/utils"

interface CountBarProps {
  preview: PreviewResponse
  /** A newer preview is on its way: the region keeps the settled words. */
  updating: boolean
  /** A condition editor is open: its footer speaks instead (UX 7.10 item 3). */
  quiet: boolean
  /** Matches now minus matches before the last edit. Null before the first edit. */
  delta: number | null
  /** A new rule: Save reads "Create (dry run)". */
  isNew: boolean
  /** The draft has changes. A new rule passes true. Save is disabled without them. */
  dirty: boolean
  saving?: boolean
  /** Scroll to Results and focus its heading. */
  onResults: () => void
  onSave: () => void
}

/**
 * The bar fixed at the bottom of the editor below `lg` (UX 4.3.8 item 7):
 * above the admin tab bar below `md`, at `bottom: 0` from `md` to `lg`, where
 * the tab bar is gone and the rail sits on the left. It shows "197 movies,
 * 1.3 TB" and the delta line, "Results", and below `md` "Save" (from `md` the
 * header keeps "Save rule"). It holds the only count region below `lg`
 * (UX 7.10 item 1), and sets the page's `scroll-padding-bottom` so a focused
 * control never hides under it (SC 2.4.11). A spacer keeps the page's end
 * clear of it.
 */
export function CountBar({ preview, updating, quiet, delta, isNew, dirty, saving = false, onResults, onSave }: CountBarProps) {
  const f = useFormat()
  const noun = nounWord(preview.matches, preview.level)
  return (
    <>
      <div aria-hidden="true" className="h-16 lg:hidden" />
      <div
        role="region"
        aria-label="Rule count"
        data-testid="admin-cleanup-count-bar"
        className={cn(
          "fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-(--z-tabbar) flex items-center gap-3 border-t bg-popover px-4 py-2 md:bottom-0 md:left-14 md:pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden",
          "max-md:[html:has(&)]:scroll-pb-[calc(8rem+env(safe-area-inset-bottom))] md:max-lg:[html:has(&)]:scroll-pb-[4.5rem]"
        )}
      >
        <div aria-hidden="true" className={cn("min-w-0 flex-1 transition-opacity", updating && "opacity-55")}>
          <p className="truncate text-ui font-semibold text-foreground tabular-nums">
            {f.number(preview.matches)} {noun}, {sizeText(preview.bytes)}
          </p>
          {delta !== null && delta !== 0 && (
            <p className="truncate text-label text-muted-foreground">
              {f.number(Math.abs(delta))} {delta > 0 ? "more" : "fewer"} than before your last change
            </p>
          )}
        </div>
        <CountRegion preview={preview} updating={updating} quiet={quiet} delta={delta} />
        <Button variant="outline" size="sm" onClick={onResults} data-testid="admin-cleanup-count-bar-results">
          Results
        </Button>
        <Button
          size="sm"
          disabled={!dirty}
          loading={saving}
          loadingLabel="Saving"
          onClick={onSave}
          className="md:hidden"
          data-testid="admin-cleanup-count-bar-save"
        >
          {isNew ? "Create (dry run)" : "Save"}
        </Button>
      </div>
    </>
  )
}
