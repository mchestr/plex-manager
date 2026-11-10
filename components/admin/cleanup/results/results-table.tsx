import type { Ref } from "react"

import { sizeText } from "@/components/admin/cleanup/preview/sizes"
import { itemName } from "@/components/admin/cleanup/results/view"
import { WhyText } from "@/components/admin/cleanup/results/why-text"
import { Button } from "@/components/ui/button"
import { Poster } from "@/components/ui/poster"
import { LEVEL_NAMES } from "@/lib/cleanup/fields/words"
import type { PreviewRow, RequestedBy } from "@/lib/cleanup/types/preview"
import { cn } from "@/lib/utils"
import type { BoundFormat } from "@/lib/utils/format"
import type { PreviewSort, PreviewTab } from "@/lib/validations/cleanup-actions"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

interface ResultsTableProps {
  rows: readonly PreviewRow[]
  tab: PreviewTab
  level: Level
  sort: PreviewSort
  /** The sr-only caption: "Matches for Movies nobody watches". */
  caption: string
  f: BoundFormat
  /** Opens the Why Sheet of a row. */
  onWhy: (itemKey: string) => void
  /** Takes focus after a page change, so the reader lands on the new rows. */
  tableRef?: Ref<HTMLTableElement>
}

/** The Why column heading of each tab. Only Matches has words in UX 8.4; the others say what their Why text holds. */
const WHY_HEADINGS: Record<PreviewTab, string> = {
  matches: "Why it matches",
  nearMisses: "Why it does not match",
  protected: "What keeps it safe",
  missing: "What is unknown",
  cannotDelete: "Why it cannot be deleted",
}

/** The column that each sort orders, for `aria-sort` (UX 11.1 item 7). "Closest first" orders by a gap that no column shows. */
const SORTED_COLUMN: Partial<Record<PreviewSort, { column: "title" | "size" | "played"; direction: "ascending" | "descending" }>> = {
  title: { column: "title", direction: "ascending" },
  largest: { column: "size", direction: "descending" },
  oldestPlay: { column: "played", direction: "ascending" },
}

/**
 * "Nobody", "Nobody (import list)", "{name}, former member", "{name}, {month year}" (UX 8.4).
 *
 * @internal Exported for tests.
 */
export function requestedWords(value: RequestedBy, f: BoundFormat): string[] {
  if (value === null) return ["Unknown"]
  if (value === "none" || value.length === 0) return ["Nobody"]
  if (value === "importList") return ["Nobody (import list)"]
  return value.map((requester) => {
    if (requester.status === "former") return `${requester.name}, former member`
    if (requester.status === "unknown") return requester.name
    return `${requester.name}, ${f.date(requester.at, "month-year-short")}`
  })
}

function playedWords(value: PreviewRow["lastPlayedAt"], f: BoundFormat): string {
  if (value === "never") return "Never"
  return value === null ? "Unknown" : f.date(value)
}

const HEAD = "h-10 px-4 text-left text-label font-medium whitespace-nowrap text-muted-foreground"
const CELL = "px-4 py-3 align-middle"
/** Below `md` a row is a card: the title and size on top, the requesters and Why under them (UX 4.3.7 item 2). */
const ROW =
  "hover:bg-accent/40 max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-3 max-md:gap-y-3 max-md:px-4 max-md:py-3"

function ResultRow({ row, f, onWhy }: { row: PreviewRow; f: BoundFormat; onWhy: (itemKey: string) => void }) {
  const name = itemName(row)
  return (
    <tr role="row" className={ROW} data-testid={`admin-cleanup-results-row-${row.itemKey}`}>
      {/* eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role -- a td is a cell; the explicit role keeps it one when the row lays out as a card */}
      <td role="cell" className={cn(CELL, "min-w-60 max-md:col-start-1 max-md:row-start-1 max-md:min-w-0 max-md:p-0")}>
        <div className="flex items-center gap-3 max-md:items-start">
          <Poster ratingKey={row.posterKey} title={name} size="xs" style={{ width: 32 }} decorative />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p>
              <span className="font-medium text-foreground">{name}</span>
              {row.year !== null && <span className="text-muted-foreground"> ({row.year})</span>}
            </p>
            <p className="text-label text-muted-foreground max-md:hidden">{LEVEL_NAMES[row.level]}</p>
            <WhyText parts={row.why} className="text-label md:hidden" />
          </div>
        </div>
      </td>
      {/* eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role -- as above */}
      <td role="cell" className={cn(CELL, "max-w-80 min-w-64 max-md:hidden")}>
        <WhyText parts={row.why} />
      </td>
      {/* eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role -- as above */}
      <td role="cell" className={cn(CELL, "text-right whitespace-nowrap tabular-nums max-md:col-start-2 max-md:row-start-1 max-md:p-0")}>
        {sizeText(row.sizeBytes)}
      </td>
      {/* eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role -- as above */}
      <td role="cell" className={cn(CELL, "whitespace-nowrap max-md:hidden")}>
        {playedWords(row.lastPlayedAt, f)}
      </td>
      {/* eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role -- as above */}
      <td role="cell" className={cn(CELL, "whitespace-nowrap max-md:hidden")}>
        {row.addedAt === null ? "Unknown" : f.date(row.addedAt)}
      </td>
      {/* eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role -- as above */}
      <td role="cell" className={cn(CELL, "max-md:col-start-1 max-md:row-start-2 max-md:self-center max-md:p-0 max-md:text-label max-md:text-muted-foreground")}>
        <span className="md:hidden">Requested by: </span>
        {requestedWords(row.requestedBy, f).map((words, index) => (
          <span key={index} className="md:block">
            {index > 0 && <span className="md:hidden">; </span>}
            {words}
          </span>
        ))}
      </td>
      {/* eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role -- as above */}
      <td role="cell" className={cn(CELL, "text-right max-md:col-start-2 max-md:row-start-2 max-md:p-0")}>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Why: ${name}`}
          onClick={() => onWhy(row.itemKey)}
          data-testid={`admin-cleanup-results-row-${row.itemKey}-why`}
        >
          Why
        </Button>
      </td>
    </tr>
  )
}

/**
 * The Results list (UX 4.3.7): one semantic table with a caption, styled like
 * `DataTable` (a bordered box, 13 px muted headers). Below `md`, CSS lays each
 * row out as a card, and the explicit roles keep the table semantics through
 * the display change. Rows take no `onClick`: "Why" is the main action of
 * each row, named "Why: {title}".
 */
export function ResultsTable({ rows, tab, level, sort, caption, f, onWhy, tableRef }: ResultsTableProps) {
  const sorted = SORTED_COLUMN[sort]
  const ariaSort = (column: "title" | "size" | "played") => (sorted?.column === column ? sorted.direction : undefined)
  return (
    <div className="relative overflow-x-auto rounded-lg border bg-card">
      <table ref={tableRef} tabIndex={-1} role="table" className="w-full border-collapse text-ui outline-none max-md:block">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b max-md:hidden">
          <tr role="row">
            <th role="columnheader" scope="col" aria-sort={ariaSort("title")} className={HEAD}>
              Title
            </th>
            <th role="columnheader" scope="col" className={HEAD}>
              {WHY_HEADINGS[tab]}
            </th>
            <th role="columnheader" scope="col" aria-sort={ariaSort("size")} className={cn(HEAD, "text-right")}>
              Size
            </th>
            <th role="columnheader" scope="col" aria-sort={ariaSort("played")} className={HEAD}>
              {level === "movie" ? "Last played" : "Last played (any episode)"}
            </th>
            <th role="columnheader" scope="col" className={HEAD}>
              Added
            </th>
            <th role="columnheader" scope="col" className={HEAD}>
              Requested by
            </th>
            <th role="columnheader" scope="col" className="w-16 px-4">
              <span className="sr-only">Why</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y max-md:block">
          {rows.map((row) => (
            <ResultRow key={row.itemKey} row={row} f={f} onWhy={onWhy} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
