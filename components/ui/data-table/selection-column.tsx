import type { CellContext, Column, ColumnDef, HeaderContext, RowSelectionState, TableOptions } from "@tanstack/react-table"

import { Checkbox } from "@/components/ui/checkbox"

/** The selection column's id; `DataTable` lays its cells out by it. */
export const SELECTION_COLUMN_ID = "select"

/** `DataTable`'s row checkboxes (UX 4.12.4). The caller holds the selected `getRowId` values, also across pages. */
export interface DataTableSelection<T> {
  selected: string[]
  onSelectedChange(ids: string[]): void
  /** A row's checkbox is "Select {label}": "Select Supernatural, Season 4". */
  getRowLabel(row: T): string
}

export const SELECT_HEAD_CLASS = "h-10 w-px pr-0 pl-4 text-left align-middle"
/** On a card the checkbox sits in the top left corner, beside the title. */
export const SELECT_CELL_CLASS = "w-px py-3 pr-0 pl-4 align-middle dt-cards:absolute dt-cards:top-3.5 dt-cards:left-4 dt-cards:p-0"
export const SELECTABLE_ROW_CLASS = "data-selected:bg-primary-indicator/8 data-selected:hover:bg-primary-indicator/12 dt-cards:pl-11"

/** The caller's list of ids as TanStack Table's selection state, and each change back as a list. */
export function selectionOptions<T>(selectable: DataTableSelection<T> | undefined): Partial<TableOptions<T>> {
  if (!selectable) return {}
  const rowSelection: RowSelectionState = Object.fromEntries(selectable.selected.map((id) => [id, true]))
  return {
    enableRowSelection: true,
    state: { rowSelection },
    onRowSelectionChange: (updater) => {
      const next = typeof updater === "function" ? updater(rowSelection) : updater
      selectable.onSelectedChange(Object.keys(next).filter((id) => next[id]))
    },
  }
}

interface SelectionColumnOptions {
  /** Test id base: the header box is `{testId}-select-all`, a row's `{testId}-row-{rowId}-select`. */
  testId?: string
  /** The header box's name. */
  selectAllLabel?: string
}

/** The column carries its options, so its header and cells can be components that never change. */
type SelectionColumnDef<T> = ColumnDef<T> & {
  selection: Required<Pick<SelectionColumnOptions, "selectAllLabel">> & SelectionColumnOptions & { getRowLabel(row: T): string }
}

const optionsOf = <T,>(column: Column<T, unknown>) => (column.columnDef as SelectionColumnDef<T>).selection

// TanStack's flexRender renders a header or cell function as a component, so these two keep one
// identity: a function made per render would remount the checkbox and drop its focus. The flex
// span centres the box in its cell, whatever the line height.
function SelectAllHeader<T>({ table, column }: HeaderContext<T, unknown>) {
  const { selectAllLabel, testId } = optionsOf(column)
  const all = table.getIsAllPageRowsSelected()
  return (
    <span className="flex">
      <Checkbox
        aria-label={selectAllLabel}
        checked={all}
        indeterminate={!all && table.getIsSomePageRowsSelected()}
        onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked)}
        data-testid={testId && `${testId}-select-all`}
      />
    </span>
  )
}

function SelectRowCell<T>({ row, column }: CellContext<T, unknown>) {
  const { getRowLabel, testId } = optionsOf(column)
  return (
    <span className="flex">
      <Checkbox
        aria-label={`Select ${getRowLabel(row.original)}`}
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        onCheckedChange={(checked) => row.toggleSelected(checked)}
        data-testid={testId && `${testId}-row-${row.id}-select`}
      />
    </span>
  )
}

/**
 * A leading column of checkboxes on TanStack Table row selection (8.21): the
 * header selects every row of the page, or clears them; while only some are
 * selected it shows the minus glyph and reads as mixed. Each row's box is
 * named "Select {label}" ("Select Supernatural, Season 4", UX 11.1).
 *
 * The table holds the state: pass `state.rowSelection` and
 * `onRowSelectionChange` to `useReactTable`, so a caller can refuse a change
 * (a batch at its limit of unticked titles leaves every row as it was).
 * Calling it on every render is fine: its header and cells keep their identity.
 *
 * ```ts
 * const columns = [selectionColumn<Item>((item) => item.title, { testId: "admin-cleanup-batch-b1" }), ...rest]
 * ```
 */
export function selectionColumn<T>(
  getRowLabel: (row: T) => string,
  { testId, selectAllLabel = "Select all on this page" }: SelectionColumnOptions = {}
): ColumnDef<T> {
  const column: SelectionColumnDef<T> = {
    id: SELECTION_COLUMN_ID,
    enableSorting: false,
    header: SelectAllHeader,
    cell: SelectRowCell,
    selection: { getRowLabel, testId, selectAllLabel },
  }
  return column
}
