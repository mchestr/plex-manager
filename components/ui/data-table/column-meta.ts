import type { ColumnMeta, RowData } from "@tanstack/react-table"

declare module "@tanstack/react-table" {
  /**
   * Per-column layout hints on `ColumnDef.meta` (ui-design-system 5.5):
   * - `align: 'end'` right-aligns numbers;
   * - `priority: 3` hides the column below `lg`;
   * - `mobile` places the cell in the stacked list below `md`. The first
   *   column defaults to `title`, every other to `hidden`.
   */
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: "end"
    priority?: 1 | 2 | 3
    mobile?: "title" | "sub" | "badges" | "meta" | "hidden"
  }
}

export type DataTableColumnMeta = ColumnMeta<RowData, unknown>
