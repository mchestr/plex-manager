"use client"

import type { Row, Table } from "@tanstack/react-table"
import { type ReactNode, useId, useRef, useState } from "react"
import { flushSync } from "react-dom"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Icon } from "@/components/ui/icon"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"

/** `DataTable`'s header rows over the rows that share a key, in the order the data brings them. */
export interface DataTableGrouping<T> {
  getGroupKey(row: T): string
  /** The header's words, which also name its checkbox and toggle: "Nov 19: 12 seasons, 210 GB". */
  renderHeader(key: string, rows: T[]): ReactNode
  /** Rows a group shows before its "Show all {N}". */
  initialRows?: number
}

/** The rows of one group, in the order the data brings them. */
export interface RowGroup<T> {
  key: string
  rows: Row<T>[]
}

/** Splits the page's rows into groups, keyed in the order each key first appears (the server sorts). */
export function groupRows<T>(rows: Row<T>[], getGroupKey: (row: T) => string): RowGroup<T>[] {
  const groups = new Map<string, Row<T>[]>()
  for (const row of rows) {
    const key = getGroupKey(row.original)
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  return Array.from(groups, ([key, groupRows]) => ({ key, rows: groupRows }))
}

interface GroupRowsProps<T> {
  table: Table<T>
  group: RowGroup<T>
  /** The header's words: "Nov 19: 12 seasons, 210 GB". */
  header: ReactNode
  /** Every column of the table, the actions column included. */
  colSpan: number
  /** Draws the group checkbox in the selection column. */
  selectable: boolean
  /** Rows shown before "Show all {N}"; every row when left out. */
  initialRows?: number
  /** The group's test id, `{table}-group-{key}`; its parts add `-select`, `-toggle` and `-show-all`. */
  testId: string
  /** One body row, with the DOM id the toggle's `aria-controls` names. */
  renderRow: (row: Row<T>, id: string) => ReactNode
}

const FOCUSABLE = 'a[href], button:not([disabled]), [role="checkbox"]:not([aria-disabled="true"]), [tabindex="0"]'

/**
 * One group of a `DataTable` as its own `tbody` (UX 4.12.4): a header row
 * whose cell is `<th scope="rowgroup">`, a checkbox that selects every row of
 * the group ("Select Nov 19: 12 seasons, 210 GB", mixed while only some are),
 * and a `Collapsible` toggle named by the header's words.
 *
 * The toggle shows and hides the rows by state: the table never holds a
 * `Collapsible.Panel`, whose `div` cannot be a child of `tbody`. The root
 * renders as the header cell itself. With `initialRows`, the group shows its
 * first rows and "Show all {N}"; that button then leaves, and focus moves to
 * the first row it revealed.
 */
export function GroupRows<T>({ table, group, header, colSpan, selectable, initialRows, testId, renderRow }: GroupRowsProps<T>) {
  const [open, setOpen] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const domId = useId()
  const labelId = `${domId}-label`
  const { rows } = group

  const limit = showAll || initialRows === undefined ? rows.length : Math.min(initialRows, rows.length)
  const shown = open ? rows.slice(0, limit) : []
  const rowId = (index: number) => `${domId}-row-${index}`

  const selectableRows = rows.filter((row) => row.getCanSelect())
  const selectedCount = selectableRows.filter((row) => row.getIsSelected()).length
  const allSelected = selectableRows.length > 0 && selectedCount === selectableRows.length

  const selectGroup = (checked: boolean) =>
    table.setRowSelection((old) => {
      const next = { ...old }
      for (const row of selectableRows) {
        if (checked) next[row.id] = true
        else delete next[row.id]
      }
      return next
    })

  return (
    <tbody data-slot="data-table-group" className="divide-y border-t dt-cards:block dt-cards:first-of-type:border-t-0">
      <tr role="row" className="bg-muted/50 dt-cards:flex dt-cards:items-center dt-cards:gap-3 dt-cards:px-4 dt-cards:py-2" data-testid={testId}>
        {selectable && (
          // eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role -- a td is a cell; the explicit role keeps it one when the row lays out as a card
          <td role="cell" className="w-px py-2 pr-0 pl-4 align-middle dt-cards:w-auto dt-cards:p-0">
            <span id={`${domId}-select`} hidden>
              Select
            </span>
            <span className="flex">
              <Checkbox
                aria-labelledby={`${domId}-select ${labelId}`}
                checked={allSelected}
                indeterminate={!allSelected && selectedCount > 0}
                disabled={selectableRows.length === 0}
                onCheckedChange={selectGroup}
                data-testid={`${testId}-select`}
              />
            </span>
          </td>
        )}
        <Collapsible
          open={open}
          onOpenChange={setOpen}
          render={<th role="rowheader" scope="rowgroup" colSpan={selectable ? colSpan - 1 : colSpan} />}
          className="px-4 py-1.5 text-left align-middle font-normal dt-cards:min-w-0 dt-cards:flex-1 dt-cards:p-0"
        >
          <span className="flex min-w-0 items-center justify-between gap-3">
            <CollapsibleTrigger
              ref={toggleRef}
              aria-controls={shown.length > 0 ? shown.map((_, index) => rowId(index)).join(" ") : undefined}
              className="-mx-1 inline-flex min-w-0 items-center gap-1.5 rounded-sm px-1 py-1 text-left text-label font-semibold text-foreground hover:bg-accent"
              data-testid={`${testId}-toggle`}
            >
              <Icon
                icon={icons.chevronDown}
                className={cn("text-muted-foreground transition-transform duration-(--duration-fast) ease-(--ease-out-quiet)", !open && "-rotate-90")}
              />
              <span id={labelId} className="min-w-0">
                {header}
              </span>
            </CollapsibleTrigger>
            {open && limit < rows.length && (
              <Button
                variant="link"
                size="sm"
                id={`${domId}-show-all`}
                aria-labelledby={`${domId}-show-all ${labelId}`}
                className="-my-1 h-7 shrink-0 px-1"
                onClick={() => {
                  const first = rowId(limit)
                  flushSync(() => setShowAll(true))
                  const target = document.getElementById(first)?.querySelector<HTMLElement>(FOCUSABLE) ?? toggleRef.current
                  target?.focus()
                }}
                data-testid={`${testId}-show-all`}
              >
                Show all {rows.length}
              </Button>
            )}
          </span>
        </Collapsible>
      </tr>
      {shown.map((row, index) => renderRow(row, rowId(index)))}
    </tbody>
  )
}
