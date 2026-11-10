/**
 * The titles that left Leaving soon after a snapshot was taken (correctness
 * review C-03). Server-only.
 *
 * A run, "Run all rules now" and the turn-on review read the newest complete
 * snapshot, which can be older than the act step that deleted a title or
 * rescued it on fresh reads. Such a title is still a match in that snapshot,
 * so new matches and the turn-on set leave its key out: the next read
 * decides.
 *
 * @module lib/cleanup/run/exited
 */

import "server-only"

import { prisma } from "@/lib/prisma"

/**
 * The item keys that left Leaving soon as `deleted` or `rescued` after
 * `takenAt`, the time of the snapshot that a run or a turn-on reads. That
 * snapshot does not know the exit, so its match of such a title is stale.
 */
export async function exitedSince(takenAt: string | null | undefined): Promise<Set<string>> {
  const at = takenAt ? new Date(takenAt) : null
  if (!at || Number.isNaN(at.getTime())) return new Set()
  const rows = await prisma.cleanupOutcome.findMany({ where: { kind: { in: ["deleted", "rescued"] }, actedAt: { gt: at } }, select: { itemKey: true },
    distinct: ["itemKey"] })
  return new Set(rows.map((row) => row.itemKey))
}
