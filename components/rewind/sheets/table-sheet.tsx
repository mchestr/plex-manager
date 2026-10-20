"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { PageTable } from "@/lib/rewind/registry"

interface TableSheetProps {
  open: boolean
  onClose: () => void
  /** The page's name, for the sheet title. */
  pageName: string
  table: PageTable
}

/**
 * A chart page's data as a real table (Rewind design 4.6, 11.1, FR-16): a
 * bottom sheet on paper with a scrollable `<table>` whose caption names the
 * counting window and zone. Opens from the "Table" button and the T key.
 */
export function TableSheet({ open, onClose, pageName, table }: TableSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" grabber data-testid="rewind-table-sheet" className="font-display">
        <SheetHeader>
          <SheetTitle>{pageName} as a table</SheetTitle>
        </SheetHeader>
        {/* Focusable, so a keyboard can scroll a table wider than the sheet (axe scrollable-region-focusable). */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scroll container must take focus to scroll by keyboard */}
        <div className="min-h-0 overflow-auto" tabIndex={0} role="region" aria-label={`${pageName} table`}>
          <table className="w-full border-collapse text-left text-ui tabular-nums">
            <caption className="pb-3 text-left font-text text-ui text-muted-foreground">{table.caption}</caption>
            <thead>
              <tr className="border-b border-border-strong">
                {table.columns.map((column) => (
                  <th key={column} scope="col" className="px-2 py-2 font-semibold first:pl-0">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map(([head, ...cells], r) => (
                <tr key={r} className="border-b border-border">
                  <th scope="row" className="px-2 py-2 font-medium first:pl-0">
                    {head}
                  </th>
                  {cells.map((cell, c) => (
                    <td key={c} className="px-2 py-2">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SheetContent>
    </Sheet>
  )
}
