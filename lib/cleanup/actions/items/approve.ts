/**
 * The approval of a deletion batch (`deleteCleanupBatch`, TS 10.3, E28, E35,
 * E36, safety-r5-3). Server-only.
 *
 * 1. The feature must be on and not paused, and `reviewedAt` fresh.
 * 2. The batch must have the `count` and `keysHash` that the card showed.
 *    `approve = batch - excludeKeys`: an unticked key outside the batch is
 *    ignored, so it can never add a deletion. `selected` must name the count,
 *    the least careful action and the exclusion count of `approve`. Above 50
 *    titles, `typedCount` must equal the count.
 * 3. One interactive transaction holds every write. It first runs the E20
 *    guard write once: zero settings rows roll back with `CLEANUP_PAUSED` or
 *    `CLEANUP_OFF`. Then one `updateMany` per group of at most 100 keys with
 *    one `(action, importListExclusion)` pair that step 2 read. The `where`
 *    holds both values and `leaveOn <= today`, so a reconcile or a postpone
 *    in the window makes the total short. A short total rolls back every
 *    group, and so does a deadlock with a batch Postpone: both give
 *    `CLEANUP_REVIEW_STALE`, and nothing is approved.
 * 4. One `CLEANUP_BATCH_APPROVED` row. The caller enqueues the act step.
 *
 * @module lib/cleanup/actions/items/approve
 */

import "server-only"

import type { z } from "zod"

import { ok } from "@/lib/actions/result"
import { loadDay, readBatch } from "@/lib/cleanup/actions/items/batch"
import { isStaleReview, type ItemsResult, liveRefusal, refuse, refuseWith } from "@/lib/cleanup/actions/items/result"
import { SELECT_ONE } from "@/lib/cleanup/actions/items/words"
import { TYPED_APPROVAL_ABOVE } from "@/lib/cleanup/constants"
import { batchCounts, resolveApproval } from "@/lib/cleanup/run/batches"
import { ROWS_PER_TRANSACTION, TRANSACTION_OPTIONS } from "@/lib/cleanup/run/show-raise"
import { CLEANUP_SETTINGS_ID } from "@/lib/cleanup/settings"
import { isTransactionConflict } from "@/lib/db/serializable"
import type { CleanupItem } from "@/lib/generated/prisma/client"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import type { deleteCleanupBatchInput } from "@/lib/validations/cleanup-actions"

export type DeleteBatchInput = z.output<typeof deleteCleanupBatchInput>

/** One group of the approval write: keys that share the action and the exclusion that the hash check read. */
interface ApprovalGroup {
  action: string
  importListExclusion: boolean
  keys: string[]
}

/** Groups the items by `(action, importListExclusion)`, at most 100 keys a group (TS 10.3 step 5.2). */
function approvalGroups(items: readonly Pick<CleanupItem, "itemKey" | "action" | "importListExclusion">[]): ApprovalGroup[] {
  const pairs = new Map<string, ApprovalGroup>()
  for (const item of items) {
    const id = `${item.action}|${item.importListExclusion}`
    const pair = pairs.get(id) ?? { action: item.action, importListExclusion: item.importListExclusion, keys: [] }
    pair.keys.push(item.itemKey)
    pairs.set(id, pair)
  }
  return [...pairs.values()].flatMap((pair) => {
    const groups: ApprovalGroup[] = []
    for (let i = 0; i < pair.keys.length; i += ROWS_PER_TRANSACTION) groups.push({ ...pair, keys: pair.keys.slice(i, i + ROWS_PER_TRANSACTION) })
    return groups
  })
}

type Stop = "CLEANUP_OFF" | "CLEANUP_PAUSED" | "CLEANUP_REVIEW_STALE"

/** Rolls the approval back with a refusal code. */
class StopApproval extends Error {
  constructor(readonly code: Stop) {
    super("cleanup.approval_stopped")
    this.name = "StopApproval"
  }
}

/**
 * The stop guard of E20 (TS 8.9 step 1): a no-op write of the settings row
 * that needs the feature on and no pause. It takes the row lock, so a pause
 * that commits first always wins. Null while live, else the code to stop with.
 */
async function guardWrite(tx: PrismaTransactionClient): Promise<"CLEANUP_OFF" | "CLEANUP_PAUSED" | null> {
  const { count } = await tx.cleanupSettings.updateMany({ where: { id: CLEANUP_SETTINGS_ID, enabled: true, pausedAt: null }, data: { enabled: true } })
  if (count > 0) return null
  const row = await tx.cleanupSettings.findUnique({ where: { id: CLEANUP_SETTINGS_ID }, select: { enabled: true } })
  return row?.enabled ? "CLEANUP_PAUSED" : "CLEANUP_OFF"
}

/** The writes of step 3, in one transaction. Throws {@link StopApproval} to roll back. */
async function writeApproval(groups: readonly ApprovalGroup[], expected: number, ctx: { userId: string; now: Date; today: string }) {
  await prisma.$transaction(async (tx) => {
    const stop = await guardWrite(tx)
    if (stop) throw new StopApproval(stop)
    let total = 0
    for (const { action, importListExclusion, keys } of groups) {
      const where = { itemKey: { in: keys }, state: "leaving", needsApproval: true, leaveOn: { lte: ctx.today }, action, importListExclusion }
      const { count } = await tx.cleanupItem.updateMany({ where, data: { state: "approved", approvedAt: ctx.now, approvedBy: ctx.userId, failCode: null } })
      total += count
    }
    if (total !== expected) throw new StopApproval("CLEANUP_REVIEW_STALE")
  }, TRANSACTION_OPTIONS)
}

/** What the approval wrote. */
export interface ApprovedBatch {
  approved: number
}

/** `deleteCleanupBatch` without the action shell: the checks, the transaction and the audit row. */
export async function approveDeletionBatch(input: DeleteBatchInput, { userId, now }: { userId: string; now: Date }): Promise<ItemsResult<ApprovedBatch>> {
  const day = await loadDay(now)
  const notLive = liveRefusal(day.settings)
  if (notLive) return notLive
  if (isStaleReview(input.reviewedAt, now)) return refuse("CLEANUP_REVIEW_STALE")
  const batch = await readBatch(input.batchId, day)
  if (!batch || batch.kind !== "deletion") return refuse("CLEANUP_REVIEW_STALE")
  const approval = resolveApproval(batch, input)
  if (approval.status === "stale") return refuse("CLEANUP_REVIEW_STALE")
  if (approval.status === "empty") return refuseWith("VALIDATION", SELECT_ONE)
  const count = approval.items.length
  const typed = count > TYPED_APPROVAL_ABOVE
  if (typed && input.typedCount !== count) return refuseWith("VALIDATION", `Type ${count} to confirm.`)
  try {
    await writeApproval(approvalGroups(approval.items), count, { userId, now, today: day.today })
  } catch (error) {
    if (error instanceof StopApproval) return refuse(error.code)
    if (isTransactionConflict(error)) return refuse("CLEANUP_REVIEW_STALE")
    throw error
  }
  logAuditEvent(AuditEventType.CLEANUP_BATCH_APPROVED, userId, {
    kind: "deletion", ruleId: batch.ruleId, count, bytes: batchCounts(approval.items).bytes.toString(), excluded: approval.excluded,
    keysHash: batch.keysHash, typed,
  })
  return ok({ approved: count })
}
