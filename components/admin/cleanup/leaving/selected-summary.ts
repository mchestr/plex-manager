/**
 * The one summary of the selected items of a deletion batch (TS 12.6
 * `leaving/` item 7, E35, E36, delivery-r5-3). The batch footer, the approve
 * button, the approve dialog and the footer Postpone and Exclude all read it,
 * so their counts and words cannot differ. Client-safe, no React.
 *
 * The selection is a set of unticked rows. Each carries the values that the
 * card read and `inBatch`: a key that left the batch stays in the set, but
 * only the rows with `inBatch: true` leave the counts.
 *
 * @module components/admin/cleanup/leaving/selected-summary
 */

import { ACTION_CARE, ACTION_IDS, type ActionId } from "@/lib/validations/cleanup-vocabulary"

/** One unticked row of a deletion batch (E36). `sizeBytes` is a decimal string. */
export type UntickedRow = {
  itemKey: string
  action: ActionId
  importListExclusion: boolean
  sizeBytes: string
  /** False once the key left the batch: it stays unticked if it comes back, but leaves no count. */
  inBatch: boolean
}

/** The batch counts that the loader and `getCleanupBatchSelection` give. `bytes` is a decimal string. */
export interface BatchTotals {
  count: number
  bytes: string
  actionCounts: Partial<Record<ActionId, number>>
  exclusionCount: number
}

/** The selected items: the count, the least careful action left (null at 0), the exclusion count and the bytes (a decimal string). */
export interface SelectedSummary {
  count: number
  action: ActionId | null
  exclusionCount: number
  bytes: string
}

const toBigInt = (value: string): bigint => (/^\d+$/.test(value) ? BigInt(value) : 0n)

/**
 * The batch minus its unticked rows that are in the batch. The action is the
 * least careful one left (lowest `ACTION_CARE`). A key listed twice counts
 * once.
 *
 * @example
 * ```ts
 * selectedSummary({ count: 3, bytes: "30", actionCounts: { "movie.delete": 2, "movie.unmonitorDeleteFiles": 1 }, exclusionCount: 1 },
 *   [{ itemKey: "movie:tmdb:1", action: "movie.delete", importListExclusion: true, sizeBytes: "10", inBatch: true }])
 * // { count: 2, action: "movie.delete", exclusionCount: 0, bytes: "20" }
 * ```
 */
export function selectedSummary(batch: BatchTotals, unticked: readonly UntickedRow[]): SelectedSummary {
  const counts: Partial<Record<ActionId, number>> = { ...batch.actionCounts }
  let count = batch.count
  let exclusionCount = batch.exclusionCount
  let bytes = toBigInt(batch.bytes)
  const seen = new Set<string>()
  for (const row of unticked) {
    if (!row.inBatch || seen.has(row.itemKey)) continue
    seen.add(row.itemKey)
    count -= 1
    counts[row.action] = (counts[row.action] ?? 0) - 1
    if (row.importListExclusion) exclusionCount -= 1
    bytes -= toBigInt(row.sizeBytes)
  }
  const left = ACTION_IDS.filter((id) => (counts[id] ?? 0) > 0)
  const action = left.reduce<ActionId | null>((least, id) => (least === null || ACTION_CARE[id] < ACTION_CARE[least] ? id : least), null)
  return {
    count: Math.max(0, count),
    action: count > 0 ? action : null,
    exclusionCount: Math.max(0, exclusionCount),
    bytes: (bytes > 0n ? bytes : 0n).toString(),
  }
}
