/**
 * The approval of an entry batch (`approveCleanupEntryBatch`, TS 10.3, E13,
 * E28, E36, safety-r7-2). Server-only.
 *
 * The feature must be on and not paused, and `reviewedAt` fresh. The action
 * takes the run claim, then reads the batch `entry-<ruleId>`: it must have
 * the `count` and `keysHash` that the card showed, and an unticked key
 * outside it is ignored. `joinItems()` moves the held rows of the rule to
 * `leaving` in transactions of 100 rows, with a leave date from the merged
 * grace. A show starts at its show floor, and a season raises its show
 * (E21). Unticked rows stay `held`. The claim is released with the change
 * check, then one `CLEANUP_BATCH_APPROVED` row is written and the Plex
 * collections are asked to sync.
 *
 * @module lib/cleanup/actions/items/entry
 */

import "server-only"

import type { z } from "zod"

import { ok } from "@/lib/actions/result"
import { loadDay, readBatch } from "@/lib/cleanup/actions/items/batch"
import { isStaleReview, type ItemsResult, liveRefusal, refuse, refuseWith, runBusy } from "@/lib/cleanup/actions/items/result"
import { SELECT_ONE } from "@/lib/cleanup/actions/items/words"
import { requestCollectionSync } from "@/lib/cleanup/collections/request"
import { batchCounts, resolveApproval } from "@/lib/cleanup/run/batches"
import { joinItems } from "@/lib/cleanup/run/entries"
import { loadReconcileContext, releaseRunClaim, takeRunClaim } from "@/lib/cleanup/run/run-claim"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import type { approveEntryBatchInput } from "@/lib/validations/cleanup-actions"

export type EntryBatchInput = z.output<typeof approveEntryBatchInput>

/** `approveCleanupEntryBatch` without the action shell. `joined` counts the titles that joined Leaving soon. */
export async function approveEntryBatch(input: EntryBatchInput, { userId, now }: { userId: string; now: Date }): Promise<ItemsResult<{ joined: number }>> {
  const day = await loadDay(now)
  const notLive = liveRefusal(day.settings)
  if (notLive) return notLive
  if (isStaleReview(input.reviewedAt, now)) return refuse("CLEANUP_REVIEW_STALE")
  const held = await takeRunClaim(now)
  if (!held) return runBusy()
  let audit: Record<string, unknown> | null = null
  try {
    const batch = await readBatch(input.batchId, day)
    if (!batch || batch.kind !== "entry") return refuse("CLEANUP_REVIEW_STALE")
    const approval = resolveApproval(batch, input)
    if (approval.status === "stale") return refuse("CLEANUP_REVIEW_STALE")
    if (approval.status === "empty") return refuseWith("VALIDATION", SELECT_ONE)
    const ctx = await loadReconcileContext({ now, actorId: userId })
    const rule = ctx.rules.get(batch.ruleId)
    if (!rule) return refuse("CLEANUP_REVIEW_STALE") // the rule went back to Dry run: reconcile releases its held rows
    const { joined } = await joinItems(ctx, { rule, held: approval.items })
    const joinedKeys = new Set(joined)
    audit = {
      kind: "entry", ruleId: batch.ruleId, count: joined.length,
      bytes: batchCounts(approval.items.filter((item) => joinedKeys.has(item.itemKey))).bytes.toString(),
      excluded: approval.excluded, keysHash: batch.keysHash, typed: false,
    }
    return ok({ joined: joined.length })
  } finally {
    await releaseRunClaim(held.claim, held.baseline, { actorId: userId })
    if (audit) {
      logAuditEvent(AuditEventType.CLEANUP_BATCH_APPROVED, userId, audit)
      await requestCollectionSync("entry-approval")
    }
  }
}
