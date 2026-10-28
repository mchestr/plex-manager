import type { ColumnMeta, RowData } from "@tanstack/react-table"

declare module "@tanstack/react-table" {
  /**
   * Per-column layout hints on `ColumnDef.meta` (ui-design-system 5.5):
   * - `align: 'end'` right-aligns numbers in the table; cards left-align them under their label;
   * - `priority: 3` drops the column, header and cells together, in the size's compact band, the
   *   strip just above its card width;
   * - `card` places the cell when rows render as cards: `title` heads the card, `sub` is an
   *   unlabelled muted line under it (for a cell that may render nothing), `field` is a labelled
   *   grid cell headed by the column's header (so it always renders something, "–" at least),
   *   and `hidden` leaves the column out. The first column defaults to `title`, every other to `hidden`.
   */
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: "end"
    priority?: 1 | 2 | 3
    card?: "title" | "sub" | "field" | "hidden"
  }
}

export type DataTableColumnMeta = ColumnMeta<RowData, unknown>
