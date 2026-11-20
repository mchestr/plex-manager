/**
 * Recovery of items that a crash left in `deleting` (TS 8.8 step 2,
 * safety-r2-7). Server-only. The caller holds the run claim, so no live act
 * step owns them.
 *
 * | Caller | `clearApproval` | An item goes back to |
 * |---|---|---|
 * | A live run (TS 8.3 step 8), the act step | false | `approved` when it has `approvedAt`, else `leaving` |
 * | `resumeCleanup`, Feature on (TS 8.12) | true | `leaving`, with the approval cleared, as a pause does |
 *
 * So a crashed item never blocks a Keep until a pause hold ends. The act
 * step then takes the recovered items first, with every check.
 *
 * @module lib/cleanup/run/recover
 */

import "server-only"

import type { PrismaTransactionClient } from "@/lib/prisma"

/** Moves every `deleting` item back to its previous state, in the caller's transaction. Returns the count of recovered items. */
export async function recoverDeleting(tx: PrismaTransactionClient, { clearApproval }: { clearApproval: boolean }): Promise<number> {
  if (clearApproval) {
    const { count } = await tx.cleanupItem.updateMany({ where: { state: "deleting" }, data: { state: "leaving", approvedAt: null, approvedBy: null } })
    return count
  }
  const approved = await tx.cleanupItem.updateMany({ where: { state: "deleting", approvedAt: { not: null } }, data: { state: "approved" } })
  const leaving = await tx.cleanupItem.updateMany({ where: { state: "deleting", approvedAt: null }, data: { state: "leaving" } })
  return approved.count + leaving.count
}
