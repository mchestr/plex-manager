/**
 * Retention of the run's tables (TS 2.7, 8.3 step 11), in the pattern of
 * `prune()` in `lib/inactivity/run.ts`. Server-only.
 *
 * | Data | Kept |
 * |---|---|
 * | `CleanupRun` | the newest 30 rows, all kinds |
 * | `CleanupOutcome` `deleted`, `failed` | 365 days |
 * | `CleanupOutcome` `rescued`, `released` | 90 days |
 * | `CleanupProtection` ended | 30 days after `endedAt` |
 *
 * It also ends every active Keep and exclusion whose end has passed, with
 * `expireProtections()` of `lib/cleanup/protections.ts` (`endedBy:
 * "expired"`, `endedAt` = its `expiresAt`). An outcome kind that this build
 * does not know is kept. Library snapshots are pruned by the read job
 * (`lib/cleanup/snapshot/store.ts`).
 *
 * @module lib/cleanup/run/prune
 */

import "server-only"

import { ENDED_KEEP_VISIBLE_DAYS, KEPT_RUNS, OUTCOME_KEEP_DAYS } from "@/lib/cleanup/constants"
import { expireProtections } from "@/lib/cleanup/protections"
import { prisma } from "@/lib/prisma"

const DAY_MS = 86_400_000

export interface PruneResult {
  runs: number
  outcomes: number
  /** Ended Keeps and exclusions deleted. */
  protections: number
  /** Keeps and exclusions that reached their end. */
  expired: number
}

/** Prunes the runs, the outcomes and the ended protections, and expires Keeps and exclusions (TS 2.7). */
export async function pruneCleanup(now: Date = new Date()): Promise<PruneResult> {
  const before = (days: number) => new Date(now.getTime() - days * DAY_MS)
  const old = await prisma.cleanupRun.findMany({ orderBy: { startedAt: "desc" }, skip: KEPT_RUNS, select: { id: true } })
  const runs = old.length > 0 ? (await prisma.cleanupRun.deleteMany({ where: { id: { in: old.map((row) => row.id) } } })).count : 0
  const outcomes = await prisma.cleanupOutcome.deleteMany({
    where: { OR: Object.entries(OUTCOME_KEEP_DAYS).map(([kind, days]) => ({ kind, actedAt: { lt: before(days) } })) },
  })
  const { keeps, exclusions } = await expireProtections(now)
  const protections = await prisma.cleanupProtection.deleteMany({ where: { status: "ended", endedAt: { lt: before(ENDED_KEEP_VISIBLE_DAYS) } } })
  return { runs, outcomes: outcomes.count, protections: protections.count, expired: keeps + exclusions }
}
