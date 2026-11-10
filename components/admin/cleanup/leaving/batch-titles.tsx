import { sizeText } from "@/components/admin/cleanup/preview/sizes"
import { itemName } from "@/components/admin/cleanup/results/view"
import type { DeletionBatchData } from "@/lib/cleanup/types/list-parts"

/** A phone shows this many titles of a batch before its buttons (UX 4.7.2 item 1). */
export const PHONE_TITLES = 6

/**
 * The first 6 titles of a deletion batch with their sizes, largest first,
 * then "and {N} more" (UX 4.7.2 item 1, `-titles`). Only on a phone: the
 * card never asks for an approval without titles on screen.
 */
export function BatchTitles({ batch, base }: { batch: Pick<DeletionBatchData, "rows" | "count">; base: string }) {
  const rows = batch.rows.slice(0, PHONE_TITLES)
  const more = batch.count - rows.length
  return (
    <div className="flex flex-col gap-1.5 md:hidden" data-testid={`${base}-titles`}>
      <ul className="divide-y rounded-md border text-ui">
        {rows.map((row) => (
          <li key={row.itemKey} className="flex items-baseline justify-between gap-4 px-3 py-1.5">
            <span className="min-w-0 truncate text-foreground">{itemName(row)}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">{sizeText(row.sizeBytes)}</span>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="text-label text-muted-foreground">and {more} more</p>}
    </div>
  )
}
