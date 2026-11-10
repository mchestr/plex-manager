/**
 * `excludeCleanupItems` without the action shell (TS 10.3, E33, E37,
 * architecture-r7-4). Server-only.
 *
 * Each title gets one transaction (`excludeKey()`). The exclusion ends at the
 * end of the `until` day in the server zone, or never. The item form takes
 * `itemKeys`, the batch form the set of the batch footer, built again on the
 * server. A title that no item row and no library data knows is skipped
 * silently; a single such key gives `NOT_FOUND`. One key refused by E33
 * gives `CLEANUP_DELETING` in the item form.
 *
 * One audit row names the excluded keys. If a row left Leaving soon, the
 * Plex collections are asked to sync. A conflict error stops the action
 * with `CONFLICT` after both, so the titles excluded before it are audited
 * (safety-r8-1, owner-r8-2, architecture-r8-1).
 *
 * @module lib/cleanup/actions/items/exclude
 */

import "server-only"

import type { z } from "zod"

import { ok } from "@/lib/actions/result"
import { loadDay, resolveBatchTarget } from "@/lib/cleanup/actions/items/batch"
import { excludeKey } from "@/lib/cleanup/actions/items/exclude-key"
import { distinct, isWriteConflict, itemsConflict, type ItemsResult, refuse, refuseWith } from "@/lib/cleanup/actions/items/result"
import { readTitles } from "@/lib/cleanup/actions/items/titles"
import { requestCollectionSync } from "@/lib/cleanup/collections/request"
import { dayEndsAt } from "@/lib/cleanup/protections"
import { keyList } from "@/lib/cleanup/run/release"
import type { ExcludeCleanupItemsResult } from "@/lib/cleanup/types/actions"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import type { excludeInput } from "@/lib/validations/cleanup-actions"

export type ExcludeInput = z.output<typeof excludeInput>

/** The words of a single key that no item row and no library data knows. */
export const NOT_IN_LIBRARY = "This title is not in the library data."

/** Excludes the keys or the batch, audits and asks for a collection sync (TS 10.3). */
export async function excludeItems(input: ExcludeInput, { userId, now }: { userId: string; now: Date }): Promise<ItemsResult<ExcludeCleanupItemsResult>> {
  const day = await loadDay(now)
  if (input.until !== null && input.until < day.today) return refuseWith("VALIDATION", "Choose today or a later date.")
  let keys: string[]
  let batch: Record<string, unknown> = {}
  if (input.batch) {
    const target = await resolveBatchTarget(input.batch, day)
    if ("success" in target) return target
    keys = target.items.map((item) => item.itemKey)
    batch = { batchId: target.batchId, excluded: target.excluded }
  } else {
    keys = distinct(input.itemKeys ?? [])
  }
  const titles = await readTitles(keys)
  const single = !input.batch && keys.length === 1
  if (single && !titles.has(keys[0])) return refuseWith("NOT_FOUND", NOT_IN_LIBRARY)

  const options = { userId, now, note: input.note || null, expiresAt: input.until === null ? null : dayEndsAt(input.until, day.zone) }
  const excluded: string[] = []
  let rescued = 0
  let exited = 0
  let skipped = 0
  let finished = true
  try {
    for (const key of keys) {
      const title = titles.get(key)
      if (!title) continue
      const done = await excludeKey(title, options)
      if (done.kind === "skipped") skipped += 1
      else {
        excluded.push(key)
        rescued += done.rescued
        exited += done.exited
      }
    }
  } catch (error) {
    if (!isWriteConflict(error)) throw error
    finished = false
  }
  if (excluded.length > 0 || skipped > 0) {
    logAuditEvent(AuditEventType.CLEANUP_ITEMS_EXCLUDED, userId, {
      ...keyList(excluded), until: input.until, hasNote: options.note !== null, rescued, skipped, ...batch,
    })
  }
  if (exited > 0) await requestCollectionSync("exclude")
  if (!finished) return itemsConflict()
  if (single && skipped === 1) return refuse("CLEANUP_DELETING")
  return ok({ excluded: excluded.length, rescued, skipped })
}
