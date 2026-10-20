"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"

interface ContentsSheetProps {
  open: boolean
  onClose: () => void
  /** Every selected page, in issue order, with its folio. */
  pages: ReadonlyArray<{ folio: number; name: string }>
  /** Close the sheet and turn to the page at this 0-based index. */
  onGoTo: (index: number) => void
}

/**
 * Contents (Rewind design 4.4 "Finale"): every page of the issue with its
 * folio, read from the selected list, so it renumbers with the issue. Each
 * row turns to its page.
 */
export function ContentsSheet({ open, onClose, pages, onGoTo }: ContentsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" grabber data-testid="rewind-contents-sheet" className="font-display">
        <SheetHeader>
          <SheetTitle>Contents</SheetTitle>
        </SheetHeader>
        <ol className="flex flex-col">
          {pages.map((page, i) => (
            <li key={page.folio} className="border-b border-border">
              <Button variant="ghost" className="h-11 w-full justify-start gap-4 px-0" data-testid="rewind-contents-page" onClick={() => onGoTo(i)}>
                <span className="w-7 text-left font-bold tabular-nums">{String(page.folio).padStart(2, "0")}</span>
                <span>{page.name}</span>
              </Button>
            </li>
          ))}
        </ol>
      </SheetContent>
    </Sheet>
  )
}
