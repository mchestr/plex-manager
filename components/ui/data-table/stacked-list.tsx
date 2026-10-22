"use client"

import { type Cell, flexRender, type Row } from "@tanstack/react-table"
import Link from "next/link"

import type { DataTableColumnMeta } from "./column-meta"
import type { RowLinks } from "./data-table"
import { RowActions } from "./row-actions"

type Slot = NonNullable<DataTableColumnMeta["mobile"]>

function slotOf<T>(cell: Cell<T, unknown>, index: number): Slot {
  return cell.column.columnDef.meta?.mobile ?? (index === 0 ? "title" : "hidden")
}

interface StackedListProps<T> extends RowLinks<T> {
  rows: Row<T>[]
  label: string
  testId: string
}

/**
 * The DataTable below `md`: the same column defs, one stacked row each
 * (title, sub line, badges, meta line) with the row's actions button beside
 * it, and no sideways scroll.
 */
export function StackedList<T>({
  rows,
  label,
  getRowHref,
  rowActions,
  getRowName,
  onRowActionsOpenChange,
  testId,
}: StackedListProps<T>) {
  return (
    <ul aria-label={label} data-slot="stacked-list" className="divide-y" data-testid={`${testId}-list`}>
      {rows.map((row) => {
        const cells = row.getVisibleCells()
        const bySlot = (slot: Slot) =>
          cells
            .filter((cell, index) => slotOf(cell, index) === slot)
            .map((cell) => <span key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</span>)
        const href = getRowHref?.(row.original)
        const title = bySlot("title")
        const sub = bySlot("sub")
        const badges = bySlot("badges")
        const meta = bySlot("meta")
        const actions = rowActions?.(row.original) ?? []

        return (
          <li key={row.id} className="flex items-start gap-3 px-4 py-3" data-testid={`${testId}-row-${row.id}`}>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="truncate text-ui font-medium text-foreground">
                {href ? (
                  <Link data-testid={`${testId}-link-${row.id}`} href={href} className="rounded-sm hover:underline">
                    {title}
                  </Link>
                ) : (
                  title
                )}
              </div>
              {sub.length > 0 && <div className="truncate text-label text-muted-foreground">{sub}</div>}
              {badges.length > 0 && <div className="flex flex-wrap items-center gap-1.5">{badges}</div>}
              {meta.length > 0 && (
                <div className="flex flex-wrap gap-x-3 text-label text-muted-foreground tabular-nums">{meta}</div>
              )}
            </div>
            {actions.length > 0 && getRowName && (
              <RowActions
                name={getRowName(row.original)}
                actions={actions}
                onOpenChange={onRowActionsOpenChange}
                data-testid={`${testId}-actions-${row.id}`}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}
