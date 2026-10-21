"use client"

import { HideTitle } from "@/components/rewind/hide/hide-title"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { PageTable } from "@/lib/rewind/registry"

/** One list row's numbers and its months, built on the server. */
export interface RowDetail {
  title: string
  /** The row's title key (`series:<key>`, `film:<key>`), which "Hide this title" hides by. */
  titleKey?: string
  numbers: ReadonlyArray<[label: string, value: string]>
  /** Minutes by month; a film has none. */
  table?: PageTable | null
}

interface RowSheetProps {
  row: RowDetail | null
  onClose: () => void
}

/**
 * A list row's sheet (Rewind design 4.3, pages 05 and 06): the title's
 * numbers, its minutes by month as a table, and "Hide this title" (P7.7).
 */
export function RowSheet({ row, onClose }: RowSheetProps) {
  return (
    <Sheet open={row !== null} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" grabber data-testid="rewind-row-sheet" className="font-display">
        {row && (
          <>
            <SheetHeader>
              <SheetTitle dir="auto">{row.title}</SheetTitle>
            </SheetHeader>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-ui">
              {row.numbers.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            {row.table && <RowTable title={row.title} table={row.table} />}
            {row.titleKey && <HideTitle titleKey={row.titleKey} title={row.title} />}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function RowTable({ title, table }: { title: string; table: PageTable }) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scroll container must take focus to scroll by keyboard
    <div className="min-h-0 overflow-auto" tabIndex={0} role="region" aria-label={`${title} by month`}>
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
          {table.rows.map(([head, ...cells]) => (
            <tr key={head} className="border-b border-border">
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
  )
}
