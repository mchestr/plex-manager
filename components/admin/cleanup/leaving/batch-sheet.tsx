"use client"

import { type ColumnDef, flexRender, getCoreRowModel, type RowSelectionState, useReactTable } from "@tanstack/react-table"
import { useMemo } from "react"

import { sizeText } from "@/components/admin/cleanup/preview/sizes"
import { itemName } from "@/components/admin/cleanup/results/view"
import { Button } from "@/components/ui/button"
import { SELECTION_COLUMN_ID, selectionColumn } from "@/components/ui/data-table/selection-column"
import { Poster } from "@/components/ui/poster"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useReplaceParams } from "@/hooks/use-replace-params"
import type { BatchRow, DeletionBatchData } from "@/lib/cleanup/types/list-parts"
import { useFormat } from "@/lib/format-context"
import { posterPalette } from "@/lib/ui/poster-palette"
import { cn } from "@/lib/utils"
import type { BoundFormat } from "@/lib/utils/format"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

/** The card shows the 10 largest rows, then "Show all {N}" pages the rest, 50 a page (UX 4.7.1). */
export const FIRST_ROWS = 10

const HEADS: Record<Level, string> = { movie: "Movie", show: "Show", season: "Season" }
const HEAD = "h-10 px-4 text-left text-label font-medium whitespace-nowrap text-muted-foreground"
const CELL = "px-4 py-3 align-middle"

/** What the batch table needs of the card's selection (`use-batch-selection.ts`). */
export interface BatchTableSelection {
  isTicked: (itemKey: string) => boolean
  /** Returns false when the untick would pass the limit of unticked titles. */
  setTicked: (rows: readonly BatchRow[], ticked: boolean) => { ok: boolean }
}

export interface BatchTableProps {
  batch: DeletionBatchData
  /** `admin-cleanup-batch-{batchId}`, or with `-sheet` in the Review each Sheet (UX 10.2). */
  base: string
  selection: BatchTableSelection
  /** An untick at the limit changed nothing: the card shows the error toast. */
  onLimit: () => void
  onWhy: (row: BatchRow, button: HTMLElement) => void
  /** "Show all {N}" was pressed: every row of the page shows, with the pager. */
  expanded: boolean
  onShowAll: () => void
  className?: string
}

/** "5 seasons", "Season 4" or the year under the title. */
function subLine(row: BatchRow): string | null {
  if (row.level === "show" && row.seasonCount !== null) return `${row.seasonCount} ${row.seasonCount === 1 ? "season" : "seasons"}`
  if (row.level === "season" && row.seasonNumber !== null) return `Season ${row.seasonNumber}`
  return row.year === null ? null : String(row.year)
}

function playedWords(value: BatchRow["lastPlayedAt"], f: BoundFormat): string {
  if (value === "never") return "Never"
  return value === null ? "Unknown" : f.date(value)
}

function columns(level: Level, base: string, f: BoundFormat, onWhy: BatchTableProps["onWhy"]): ColumnDef<BatchRow>[] {
  return [
    selectionColumn<BatchRow>((row) => itemName(row), { testId: base, selectAllLabel: "Select all titles of the batch on this page" }),
    {
      id: "title",
      header: HEADS[level],
      cell: ({ row }) => (
        <span className="flex items-center gap-3">
          <Poster
            ratingKey={row.original.posterKey}
            title={row.original.title}
            size="xs"
            style={{ width: 32 }}
            decorative
            fallback={<span className="block size-full" style={{ background: posterPalette(row.original.posterKey ?? row.original.title).field }} />}
          />
          <span className="flex min-w-0 flex-col">
            <span className="font-medium text-foreground">{row.original.title}</span>
            {subLine(row.original) && <span className="text-label text-muted-foreground">{subLine(row.original)}</span>}
          </span>
        </span>
      ),
    },
    { id: "size", header: "Size", cell: ({ row }) => sizeText(row.original.sizeBytes) },
    { id: "played", header: level === "movie" ? "Last played" : "Last played (any episode)", cell: ({ row }) => playedWords(row.original.lastPlayedAt, f) },
    {
      id: "why",
      header: () => <span className="sr-only">Why</span>,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Why: ${itemName(row.original)}`}
          onClick={(event) => onWhy(row.original, event.currentTarget)}
          data-testid={`${base}-row-${row.original.itemKey}-why`}
        >
          Why
        </Button>
      ),
    },
  ]
}

const CELL_CLASS: Record<string, string> = {
  [SELECTION_COLUMN_ID]: "w-px py-3 pr-0 pl-4 align-middle",
  title: cn(CELL, "min-w-0"),
  size: cn(CELL, "text-right whitespace-nowrap tabular-nums"),
  played: cn(CELL, "whitespace-nowrap max-md:hidden"),
  why: cn(CELL, "w-px text-right"),
}
const HEAD_CLASS: Record<string, string> = {
  [SELECTION_COLUMN_ID]: "h-10 w-px pr-0 pl-4 text-left align-middle",
  size: cn(HEAD, "text-right"),
  played: cn(HEAD, "max-md:hidden"),
  why: "w-px px-4",
}

/**
 * The rows of a deletion batch (UX 4.7.1): a semantic `table` that looks
 * like `DataTable`, as the Results table does, with `selectionColumn()` on
 * `useReactTable`. It is not a `DataTable`, which writes `?page=` for the
 * list below and puts its base id on its root (ux-a11y-r3-5). The
 * selection is the card's set of unticked keys: a page select-all at the
 * limit unticks none of its rows. "Show all {N}" shows the page of 50, and
 * the pager writes `?batch=` and `?batchPage=`.
 */
export function BatchTable({ batch, base, selection, onLimit, onWhy, expanded, onShowAll, className }: BatchTableProps) {
  const f = useFormat()
  const { replace } = useReplaceParams()
  // One array per page and state: a new `data` array each render makes TanStack Table reset its state, and render again without end
  const rows = useMemo(() => (expanded ? batch.rows : batch.rows.slice(0, FIRST_ROWS)), [batch.rows, expanded])
  // Stable cells: a cell made per render would remount, and its "Why" button would lose focus
  const columnDefs = useMemo(() => columns(batch.level, base, f, onWhy), [batch.level, base, f, onWhy])
  const rowSelection: RowSelectionState = Object.fromEntries(rows.filter((row) => selection.isTicked(row.itemKey)).map((row) => [row.itemKey, true]))
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table returns new functions each render, so React Compiler leaves this component alone, as the table needs
  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    getRowId: (row) => row.itemKey,
    getCoreRowModel: getCoreRowModel(),
    autoResetAll: false,
    enableRowSelection: true,
    state: { rowSelection },
    onRowSelectionChange: (updater) => {
      const next = typeof updater === "function" ? updater(rowSelection) : updater
      const tick = rows.filter((row) => !rowSelection[row.itemKey] && next[row.itemKey])
      const untick = rows.filter((row) => rowSelection[row.itemKey] && !next[row.itemKey])
      if (tick.length > 0) selection.setTicked(tick, true)
      if (untick.length > 0 && !selection.setTicked(untick, false).ok) onLimit()
    },
  })
  const page = batch.rowsPage
  const go = (to: number) => replace({ batch: batch.id, batchPage: to === 1 ? null : to })

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="relative overflow-x-auto rounded-lg border bg-card">
        <table role="table" className="w-full border-collapse text-ui" data-testid={`${base}-table`}>
          <caption className="sr-only">Titles of the batch of {batch.ruleName}</caption>
          <thead className="border-b">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} role="row">
                {group.headers.map((header) => (
                  <th key={header.id} role="columnheader" scope="col" className={HEAD_CLASS[header.column.id] ?? HEAD}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y">
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                role="row"
                data-selected={row.getIsSelected() ? "" : undefined}
                className="hover:bg-accent/40 data-selected:bg-primary-indicator/8"
                data-testid={`${base}-row-${row.id}`}
              >
                {row.getVisibleCells().map((cell) => (
                  // eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role -- a td is a cell; the explicit role keeps it one
                  <td key={cell.id} role="cell" className={CELL_CLASS[cell.column.id] ?? CELL}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!expanded && batch.count > rows.length && (
        <Button variant="outline" size="sm" className="self-start" onClick={onShowAll} data-testid={`${base}-show-all`}>
          Show all {batch.count}
        </Button>
      )}
      {expanded && batch.rowsPageCount > 1 && (
        <div className="flex items-center gap-2">
          <span className="mr-auto text-label text-muted-foreground tabular-nums">
            Page {page} of {batch.rowsPageCount}
          </span>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go(page - 1)} data-testid={`${base}-page-prev`}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={page >= batch.rowsPageCount} onClick={() => go(page + 1)} data-testid={`${base}-page-next`}>
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

export interface BatchSheetProps extends Omit<BatchTableProps, "base" | "className"> {
  /** `admin-cleanup-batch-{batchId}`: the Sheet's ids add `-sheet` (UX 10.2). */
  base: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** "6 selected, 1.24 TB." */
  selectedLine: string
}

/**
 * "Review each" on a phone (UX 4.7.2 item 3): a bottom Sheet with the batch
 * table and the card's selection. Its ids carry `-sheet` after the batch
 * id. It has no buttons of its own: Postpone, Exclude and the approve button
 * exist once, on the card.
 */
export function BatchSheet({ base, open, onOpenChange, selectedLine, ...table }: BatchSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" grabber className="gap-4 overflow-y-auto" data-testid={`${base}-sheet`}>
        <SheetHeader>
          <SheetTitle>Review the batch of {table.batch.ruleName}</SheetTitle>
          <SheetDescription>{selectedLine} Untick a title to leave it out of this approval.</SheetDescription>
        </SheetHeader>
        <BatchTable base={`${base}-sheet`} {...table} />
      </SheetContent>
    </Sheet>
  )
}
