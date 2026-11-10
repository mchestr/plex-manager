"use client"

import { type ColumnDef, flexRender, getCoreRowModel, type Header, type Row, useReactTable } from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { type ReactNode, useMemo } from "react"

import { Icon } from "@/components/ui/icon"
import { TableSkeleton } from "@/components/ui/skeleton"
import { useReplaceParams } from "@/hooks/use-replace-params"
import { sortParam, type TableSort } from "@/lib/ui/table-params"
import { cn } from "@/lib/utils"

import type { DataTableColumnMeta } from "./column-meta"
import { type DataTableGrouping, GroupRows, groupRows } from "./group-rows"
import { ACTIONS_CELL_CLASS, cardSlot, CELL_LABEL_CLASS, cellClass, headerClass, ROW_CLASS, type TableSize } from "./layout"
import { TablePagination } from "./pagination"
import { type RowAction, RowActions } from "./row-actions"
import {
  type DataTableSelection,
  SELECT_CELL_CLASS,
  SELECT_HEAD_CLASS,
  SELECTABLE_ROW_CLASS,
  SELECTION_COLUMN_ID,
  selectionColumn,
  selectionOptions,
} from "./selection-column"

export type { DataTableGrouping, DataTableSelection }

/** How a row links out: its first cell's href, its action menu, and the name that heads the menu. */
interface RowLinks<T> {
  /** The first cell renders a real Link to it; rows never take an onClick (UI-23). */
  getRowHref?: (row: T) => Route
  rowActions?: (row: T) => RowAction[]
  /** Required with `rowActions`: "Actions for {name}". */
  getRowName?: (row: T) => string
  /** Told when any row's action menu opens or closes (a live page holds its refresh). */
  onRowActionsOpenChange?: (open: boolean) => void
}

interface DataTableProps<T> extends RowLinks<T> {
  /**
   * The columns. A column sorts only with `enableSorting: true`, and its `id`
   * is the `?sort=` value. `meta` takes `DataTableColumnMeta`; a column's
   * header is a string, which also labels its field on a card. A `footer` on
   * any column adds a totals row.
   */
  columns: ColumnDef<T>[]
  data: T[]
  getRowId: (row: T) => string
  /** The table's accessible name: "Members". */
  label: string
  /** Plural, lower case, for the footer: "Showing all 7 members". */
  noun: string
  /** A FilterBar. */
  toolbar?: ReactNode
  pagination: { page: number; pageSize: number; total: number }
  pageSizes?: readonly number[]
  sort?: TableSort
  /** An EmptyState, shown when `data` is empty. */
  empty: ReactNode
  /** Skeleton rows in place of the body. */
  loading?: boolean
  /**
   * How much room the columns need, on the table's own width (`layout.ts`):
   * `narrow` for two or three short columns, `wide` for eight or more.
   */
  size?: TableSize
  selectable?: DataTableSelection<T>
  groupBy?: DataTableGrouping<T>
  /** A `DataTableBulkBar`, shown above the table while `selectable.selected` holds a row. */
  bulkBar?: ReactNode
  "data-testid"?: string
}

function nextSort(sort: TableSort | undefined, id: string): TableSort | null {
  if (sort?.id !== id) return { id, desc: false }
  return sort.desc ? null : { id, desc: true }
}

function footerClass(meta: DataTableColumnMeta | undefined) {
  return cn(
    "px-4 py-3 align-middle dt-cards:p-0 dt-cards:empty:hidden",
    meta?.align === "end" && "text-right tabular-nums dt-cards:text-left",
    meta?.priority === 3 && "dt-compact:hidden"
  )
}

/**
 * The admin list (ui-design-system 5.5, UI-23) on TanStack Table, with the URL
 * driving sort and page (`manualSorting`, `manualPagination`): the server
 * reads them with `parseTableParams`, slices the rows and passes them in.
 *
 * Headers are `<th scope="col">` with `aria-sort`; a sort button replaces
 * `?sort=` and goes back to page 1. It is one `<table>` at every width: below
 * its `size`'s card width (a container query on the table's own width, so the
 * server HTML is already right on a phone) CSS lays each row out as a card of
 * labelled fields from `meta.card`, and the explicit table roles keep its
 * semantics through the display change. Rows emit `${testId}-row-${id}`.
 *
 * `selectable` adds a first column of checkboxes (`selection-column.tsx`:
 * `${testId}-select-all`, `${testId}-row-${id}-select`), `groupBy` puts each
 * group in its own `tbody` under a header row (`group-rows.tsx`:
 * `${testId}-group-${key}`), and `bulkBar` shows while rows are selected.
 * Without them the table renders as it always has.
 */
export function DataTable<T>({
  columns,
  data,
  getRowId,
  label,
  noun,
  toolbar,
  pagination,
  pageSizes,
  sort,
  empty,
  loading = false,
  size = "default",
  getRowHref,
  rowActions,
  getRowName,
  onRowActionsOpenChange,
  selectable,
  groupBy,
  bulkBar,
  ...props
}: DataTableProps<T>) {
  const testId = props["data-testid"] ?? "data-table"
  const { replace } = useReplaceParams()
  const selection = selectionOptions(selectable)
  // Stable while the caller's columns and row label are: a new column list rebuilds every Column and remounts the cells
  const getRowLabel = selectable?.getRowLabel
  const tableColumns = useMemo(
    () => (getRowLabel ? [selectionColumn(getRowLabel, { testId, selectAllLabel: `Select all ${noun} on this page` }), ...columns] : columns),
    [getRowLabel, columns, testId, noun]
  )
  // The selection column comes first; the caller's first column still heads the card and carries the link
  const offset = selectable ? 1 : 0

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table returns new functions each render, so React Compiler leaves this component alone, as the table needs
  const table = useReactTable({
    ...selection,
    data,
    columns: tableColumns,
    getRowId: (row) => getRowId(row),
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    rowCount: pagination.total,
    state: {
      sorting: sort ? [sort] : [],
      pagination: { pageIndex: pagination.page - 1, pageSize: pagination.pageSize },
      ...selection.state,
    },
  })

  const onSort = (id: string) => {
    const next = nextSort(sort, id)
    replace({ sort: next && sortParam(next), page: null })
  }

  const headerCell = (header: Header<T, unknown>) => {
    const { columnDef } = header.column
    const sortable = columnDef.enableSorting === true
    const direction = sort?.id === header.column.id ? (sort.desc ? "descending" : "ascending") : "none"
    const content = header.isPlaceholder ? null : flexRender(columnDef.header, header.getContext())
    const selectHead = selectable && header.column.id === SELECTION_COLUMN_ID
    return (
      <th
        key={header.id}
        role="columnheader"
        scope="col"
        aria-sort={sortable ? direction : undefined}
        data-testid={`${testId}-column-${header.column.id}`}
        className={selectHead ? SELECT_HEAD_CLASS : headerClass(columnDef.meta, cardSlot(columnDef.meta, header.index - offset))}
      >
        {sortable ? (
          <button
            type="button"
            onClick={() => onSort(header.column.id)}
            className="-mx-1.5 inline-flex items-center gap-1 rounded-sm px-1.5 py-1 hover:text-foreground"
            data-testid={`${testId}-sort-${header.column.id}`}
          >
            {content}
            <Icon
              icon={direction === "ascending" ? ArrowUp : direction === "descending" ? ArrowDown : ChevronsUpDown}
              size={14}
            />
          </button>
        ) : (
          content
        )}
      </th>
    )
  }

  const rows = table.getRowModel().rows
  const withActions = Boolean(rowActions && getRowName)

  const renderRow = (row: Row<T>, id?: string) => {
    const href = getRowHref?.(row.original)
    const actions = withActions ? rowActions!(row.original) : []
    return (
      <tr
        key={row.id}
        id={id}
        role="row"
        data-selected={selectable && row.getIsSelected() ? "" : undefined}
        className={selectable ? cn(ROW_CLASS, SELECTABLE_ROW_CLASS) : ROW_CLASS}
        data-testid={`${testId}-row-${row.id}`}
      >
        {row.getVisibleCells().map((cell, cellIndex) => {
          const { columnDef } = cell.column
          const content = flexRender(columnDef.cell, cell.getContext())
          if (selectable && cell.column.id === SELECTION_COLUMN_ID) {
            return (
              // eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role -- a td is a cell; the explicit role keeps it one when the row lays out as a card
              <td key={cell.id} role="cell" data-card="select" className={SELECT_CELL_CLASS}>
                {content}
              </td>
            )
          }
          const index = cellIndex - offset
          const slot = cardSlot(columnDef.meta, index)
          return (
            // eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role -- a td is a cell; the explicit role keeps it one when the row lays out as a card
            <td key={cell.id} role="cell" data-card={slot} className={cellClass(columnDef.meta, slot, withActions)}>
              {slot === "field" && typeof columnDef.header === "string" && (
                <span data-slot="cell-label" className={CELL_LABEL_CLASS}>
                  {columnDef.header}
                </span>
              )}
              {index === 0 && href ? (
                <Link data-testid={`${testId}-link-${row.id}`} href={href} className="rounded-sm font-medium text-foreground hover:underline">
                  {content}
                </Link>
              ) : (
                content
              )}
            </td>
          )
        })}
        {withActions && (
          // eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role -- a td is a cell; the explicit role keeps it one when the row lays out as a card
          <td role="cell" data-card="actions" className={ACTIONS_CELL_CLASS}>
            {actions.length > 0 && (
              <RowActions
                name={getRowName!(row.original)}
                actions={actions}
                onOpenChange={onRowActionsOpenChange}
                data-testid={`${testId}-actions-${row.id}`}
              />
            )}
          </td>
        )}
      </tr>
    )
  }

  let body: ReactNode
  if (loading) {
    body = <TableSkeleton rows={Math.min(pagination.pageSize, 8)} columns={Math.min(columns.length, 6)} />
  } else if (data.length === 0) {
    body = empty
  } else {
    const colSpan = tableColumns.length + (withActions ? 1 : 0)
    body = (
      <table role="table" aria-label={label} className="w-full border-collapse text-ui dt-cards:block">
        <thead className="border-b dt-cards:hidden">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id} role="row">
              {group.headers.map(headerCell)}
              {withActions && (
                <th role="columnheader" scope="col" className="w-12 px-2">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          ))}
        </thead>
        {groupBy ? (
          groupRows(rows, groupBy.getGroupKey).map((group) => (
            <GroupRows
              key={group.key}
              table={table}
              group={group}
              header={groupBy.renderHeader(group.key, group.rows.map((row) => row.original))}
              colSpan={colSpan}
              selectable={Boolean(selectable)}
              initialRows={groupBy.initialRows}
              testId={`${testId}-group-${group.key}`}
              renderRow={renderRow}
            />
          ))
        ) : (
          <tbody className="divide-y dt-cards:block">{rows.map((row) => renderRow(row))}</tbody>
        )}
        {columns.some((column) => column.footer !== undefined) && (
          <tfoot className="border-t font-medium dt-cards:block" data-testid={`${testId}-totals`}>
            {table.getFooterGroups().map((group) => (
              <tr key={group.id} role="row" className="dt-cards:flex dt-cards:flex-wrap dt-cards:gap-x-4 dt-cards:gap-y-1 dt-cards:px-4 dt-cards:py-3">
                {group.headers.map((header) => (
                  // eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role -- a td is a cell; the explicit role keeps it one when the row lays out as a card
                  <td key={header.id} role="cell" className={footerClass(header.column.columnDef.meta)}>
                    {flexRender(header.column.columnDef.footer, header.getContext())}
                  </td>
                ))}
                {/* eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role -- as above */}
                {withActions && <td role="cell" className="dt-cards:hidden" />}
              </tr>
            ))}
          </tfoot>
        )}
      </table>
    )
  }

  return (
    <div
      data-slot="data-table"
      data-table-size={size}
      className="@container/data-table flex w-full min-w-0 flex-col gap-3"
      data-testid={testId}
    >
      {toolbar}
      {selectable && selectable.selected.length > 0 && bulkBar}
      {/* A table wider than its card scrolls inside it instead of widening the page. `relative`
          keeps the sr-only header labels, which are absolutely placed, inside the scroll. */}
      <div className="relative overflow-x-auto rounded-lg border bg-card" data-testid={`${testId}-scroll`}>
        {body}
      </div>
      {!loading && data.length > 0 && (
        <TablePagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          noun={noun}
          pageSizes={pageSizes}
          onPageChange={(page) => replace({ page: page === 1 ? null : page })}
          onPageSizeChange={(pageSize) => replace({ pageSize, page: null })}
          testId={`${testId}-pagination`}
        />
      )}
    </div>
  )
}
