/**
 * The batch reads of the item actions (TS 8.7, 10.3, E28, E36, E37): the day
 * in the server zone, one batch by its id, the selection read of
 * `getCleanupBatchSelection`, and the target of the batch form of Postpone
 * and Exclude. Server-only.
 *
 * A batch is never stored (E7): each read builds every batch again from the
 * item rows with `loadBatches()`, as the Leaving soon loader does, so the
 * page and the action compare the same `count` and `keysHash`.
 *
 * @module lib/cleanup/actions/items/batch
 */

import "server-only"

import { type ItemsFailure, refuse, refuseWith } from "@/lib/cleanup/actions/items/result"
import { SELECT_ONE } from "@/lib/cleanup/actions/items/words"
import { type Batch, batchCounts, batchHash, loadBatches, resolveApproval, selectionOf } from "@/lib/cleanup/run/batches"
import { type CleanupSettingsRow, readCleanupSettingsRow, serverZone } from "@/lib/cleanup/settings"
import type { CleanupBatchSelection } from "@/lib/cleanup/types/screens"
import type { CleanupItem } from "@/lib/generated/prisma/client"
import { dayKey } from "@/lib/utils/zoned-time"
import type { BatchTarget } from "@/lib/validations/cleanup-actions"

/** The settings row, the server zone and today in it. */
export interface CleanupDay {
  settings: CleanupSettingsRow
  zone: string
  today: string
}

/** Reads the settings row and the server zone, and gives today's day key at `now`. */
export async function loadDay(now: Date): Promise<CleanupDay> {
  const [settings, zone] = await Promise.all([readCleanupSettingsRow(), serverZone()])
  return { settings, zone, today: dayKey(now.getTime(), zone) }
}

/** The batch `batchId` as the Leaving soon tab builds it now, or null when it has no item. */
export async function readBatch(batchId: string, day: CleanupDay): Promise<Batch | null> {
  const { settings, zone, today } = day
  const { deletion, entry } = await loadBatches({ today, holdUntil: settings.holdUntil, budget: settings.options.budget, zone })
  return [...deletion, ...entry].find((batch) => batch.id === batchId) ?? null
}

/** A batch with no item: its counts are zero, and `keysHash` is the hash of no key. */
function emptyBatch(batchId: string): Batch {
  return { ...batchCounts([]), id: batchId, kind: "deletion", ruleId: "", items: [], keysHash: batchHash([]), importListExclusion: false,
    dueSince: null, dueAt: null, plan: null, oversize: [] }
}

/**
 * `getCleanupBatchSelection` (E36, TS 10.3): the batch counts and the asked
 * keys that are still in it, with their values. A batch that has no item now
 * answers with zero counts and no key. It writes nothing.
 */
export async function batchSelection(batchId: string, keys: readonly string[], now: Date): Promise<CleanupBatchSelection> {
  const batch = await readBatch(batchId, await loadDay(now))
  return selectionOf(batch ?? emptyBatch(batchId), keys)
}

/** The keys that the batch form acts on (E37): the batch minus the unticked keys that are in it. */
export interface BatchTargetItems {
  batchId: string
  items: CleanupItem[]
  /** The unticked keys that are in the batch (architecture-r6-5). */
  excluded: number
}

/**
 * Builds the set of the batch form of Postpone and Exclude again (TS 10.3
 * batch form steps 1 and 2): the batch must still have the `count` and
 * `keysHash` that the card showed, an unticked key outside the batch is
 * ignored, and the set must hold `selectedCount` keys. Else
 * `CLEANUP_REVIEW_STALE`, and the caller changes nothing.
 */
export async function resolveBatchTarget(target: BatchTarget, day: CleanupDay): Promise<BatchTargetItems | ItemsFailure> {
  const batch = await readBatch(target.batchId, day)
  if (!batch || batch.kind !== "deletion") return refuse("CLEANUP_REVIEW_STALE")
  const approval = resolveApproval(batch, { count: target.count, keysHash: target.keysHash, excludeKeys: target.excludeKeys ?? [] })
  if (approval.status === "stale") return refuse("CLEANUP_REVIEW_STALE")
  if (approval.status === "empty") return refuseWith("VALIDATION", SELECT_ONE)
  if (approval.items.length !== target.selectedCount) return refuse("CLEANUP_REVIEW_STALE")
  return { batchId: batch.id, items: approval.items, excluded: approval.excluded }
}
