import { cn } from "@/lib/utils"

import type { DataTableColumnMeta } from "./column-meta"

/**
 * How much room a DataTable's columns need, measured on its own container
 * (never the viewport). Every size has a `dt-cards` and a `dt-compact` rule in
 * `app/globals.css`:
 *
 * | size    | cards below | priority 3 leaves the table below |
 * |---------|-------------|-----------------------------------|
 * | narrow  | 24rem       | 28rem                             |
 * | default | 40rem       | 50rem                             |
 * | wide    | 60rem       | 68rem                             |
 *
 * @internal
 */
export const TABLE_SIZES = ["narrow", "default", "wide"] as const
export type TableSize = (typeof TABLE_SIZES)[number]
export type CardSlot = NonNullable<DataTableColumnMeta["card"]>

/** The first column heads the card unless told otherwise; every other column stays out of it. */
export function cardSlot(meta: DataTableColumnMeta | undefined, index: number): CardSlot {
  return meta?.card ?? (index === 0 ? "title" : "hidden")
}

/** One source for hiding, so a column's `<th>` and its `<td>`s always hide together. */
function hides(meta: DataTableColumnMeta | undefined, slot: CardSlot) {
  return cn(meta?.priority === 3 && "dt-compact:hidden", slot === "hidden" && "dt-cards:hidden")
}

export function headerClass(meta: DataTableColumnMeta | undefined, slot: CardSlot) {
  return cn(
    "h-10 px-4 text-left text-label font-medium whitespace-nowrap text-muted-foreground",
    meta?.align === "end" && "text-right [&>button]:ml-auto",
    hides(meta, slot)
  )
}

const CARD_CELL: Record<CardSlot, string> = {
  title: "dt-cards:order-first dt-cards:col-span-full dt-cards:block dt-cards:min-w-0 dt-cards:p-0",
  // An empty sub (the cell rendered nothing) leaves the grid, so it adds no row gap
  sub: "dt-cards:-order-1 dt-cards:col-span-full dt-cards:-mt-2 dt-cards:block dt-cards:min-w-0 dt-cards:truncate dt-cards:p-0 dt-cards:text-label dt-cards:text-muted-foreground dt-cards:empty:hidden",
  field: "dt-cards:block dt-cards:min-w-0 dt-cards:p-0 dt-cards:text-left dt-cards:break-words",
  hidden: "",
}

/** `withActions`: the title and sub lines leave room for the actions button in the card's corner. */
export function cellClass(meta: DataTableColumnMeta | undefined, slot: CardSlot, withActions: boolean) {
  return cn(
    "px-4 py-3 align-middle",
    meta?.align === "end" && "text-right tabular-nums",
    CARD_CELL[slot],
    hides(meta, slot),
    withActions && (slot === "title" || slot === "sub") && "dt-cards:pr-10"
  )
}

/** A card is a grid of labelled fields: one column, two from 16rem, four from 36rem. */
export const ROW_CLASS =
  "hover:bg-accent/40 dt-cards:relative dt-cards:grid dt-cards:grid-cols-1 dt-cards:gap-x-4 dt-cards:gap-y-3 dt-cards:px-4 dt-cards:py-3 dt-cards:@3xs/data-table:grid-cols-2 dt-cards:@xl/data-table:grid-cols-4"

/** Out of the card's grid, in its top right corner. */
export const ACTIONS_CELL_CLASS = "px-2 py-1.5 text-right dt-cards:absolute dt-cards:top-3 dt-cards:right-3 dt-cards:p-0"

/** The column's header above a field's value; shown only on cards, where the `<thead>` is hidden. */
export const CELL_LABEL_CLASS = "hidden text-label text-muted-foreground dt-cards:mb-1 dt-cards:block"
