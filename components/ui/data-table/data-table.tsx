"use client"

import { type ColumnDef, flexRender, getCoreRowModel, type Header, useReactTable } from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"

import { Icon } from "@/components/ui/icon"
import { TableSkeleton } from "@/components/ui/skeleton"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useReplaceParams } from "@/hooks/use-replace-params"
import { sortParam, type TableSort } from "@/lib/ui/table-params"
import { cn } from "@/lib/utils"

import { TablePagination } from "./pagination"
import { type RowAction, RowActions } from "./row-actions"
import { StackedList } from "./stacked-list"

/** How a row links out: its first cell's href, its action menu, and the name that heads the menu. */
export interface RowLinks<T> {
  /** The first cell renders a real Link to it; rows never take an onClick (UI-23). */
  getRowHref?: (row: T) => Route
  rowActions?: (row: T) => RowAction[]
  /** Required with `rowActions`: "Actions for {name}". */
  getRowName?: (row: T) => string
}

interface DataTableProps<T> extends RowLinks<T> {
  /**
   * The columns. A column sorts only with `enableSorting: true`, and its `id`
   * is the `?sort=` value. `meta` takes `DataTableColumnMeta`.
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
  "data-testid"?: string
}

const ALIGN_END = "text-right [&>button]:ml-auto"

function nextSort(sort: TableSort | undefined, id: string): TableSort | null {
  if (sort?.id !== id) return { id, desc: false }
  return sort.desc ? null : { id, desc: true }
}

/**
 * The admin list (ui-design-system 5.5, UI-23) on TanStack Table, with the URL
 * driving sort and page (`manualSorting`, `manualPagination`): the server
 * reads them with `parseTableParams`, slices the rows and passes them in.
 *
 * Headers are `<th scope="col">` with `aria-sort`; a sort button replaces
 * `?sort=` and goes back to page 1. Below `md` the same columns render a
 * stacked list from `meta.mobile`. Rows emit `${testId}-row-${id}`.
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
  getRowHref,
  rowActions,
  getRowName,
  ...props
}: DataTableProps<T>) {
  const testId = props["data-testid"] ?? "data-table"
  const stacked = useMediaQuery("(max-width: 47.9375rem)")
  const { replace } = useReplaceParams()

  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => getRowId(row),
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    rowCount: pagination.total,
    state: {
      sorting: sort ? [sort] : [],
      pagination: { pageIndex: pagination.page - 1, pageSize: pagination.pageSize },
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
    return (
      <th
        key={header.id}
        scope="col"
        aria-sort={sortable ? direction : undefined}
        className={cn(
          "h-10 px-4 text-left text-label font-medium whitespace-nowrap text-muted-foreground",
          columnDef.meta?.align === "end" && ALIGN_END,
          columnDef.meta?.priority === 3 && "hidden lg:table-cell"
        )}
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

  let body: ReactNode
  if (loading) {
    body = <TableSkeleton rows={Math.min(pagination.pageSize, 8)} columns={Math.min(columns.length, stacked ? 2 : 6)} />
  } else if (data.length === 0) {
    body = empty
  } else if (stacked) {
    body = (
      <StackedList rows={rows} label={label} getRowHref={getRowHref} rowActions={rowActions} getRowName={getRowName} testId={testId} />
    )
  } else {
    body = (
      <table aria-label={label} className="w-full border-collapse text-ui">
        <thead className="border-b">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map(headerCell)}
              {withActions && (
                <th scope="col" className="w-12 px-2">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => {
            const href = getRowHref?.(row.original)
            return (
              <tr key={row.id} className="hover:bg-accent/40" data-testid={`${testId}-row-${row.id}`}>
                {row.getVisibleCells().map((cell, index) => {
                  const { meta } = cell.column.columnDef
                  const content = flexRender(cell.column.columnDef.cell, cell.getContext())
                  return (
                    <td
                      key={cell.id}
                      className={cn(
                        "px-4 py-3 align-middle",
                        meta?.align === "end" && "text-right tabular-nums",
                        meta?.priority === 3 && "hidden lg:table-cell"
                      )}
                    >
                      {index === 0 && href ? (
                        <Link href={href} className="rounded-sm font-medium text-foreground hover:underline">
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </td>
                  )
                })}
                {withActions && (
                  <td className="px-2 py-1.5 text-right">
                    <RowActions
                      name={getRowName!(row.original)}
                      actions={rowActions!(row.original)}
                      data-testid={`${testId}-actions-${row.id}`}
                    />
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    )
  }

  return (
    <div data-slot="data-table" className="flex flex-col gap-3" data-testid={testId}>
      {toolbar}
      <div className="overflow-hidden rounded-lg border bg-card">{body}</div>
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
