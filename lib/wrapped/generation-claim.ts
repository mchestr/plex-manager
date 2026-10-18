/**
 * One Rewind generation at a time per member and year.
 *
 * ## Overview
 *
 * `generatePlexWrapped` still runs inside the request (P2.17 moves it to
 * BullMQ), so two tabs, a double click or a scripted loop could start several
 * paid runs for the same row, and a late failure could overwrite a newer
 * result (SEC-22, RWP-12). A run must first claim the `PlexWrapped` row, and
 * it writes its outcome only while it still holds that claim:
 *
 * ```
 * claimGeneration ─► createMany(skipDuplicates)        the row exists ("pending" if new)
 *                 ─► updateManyAndReturn(               ┬ 1 row: claimed, updatedAt = claimedAt
 *                      not generating, or generating    └ 0 rows: a live run holds it ─► null
 *                      for 15+ minutes)
 *   … statistics, LLM …
 * writeIfClaimed  ─► updateMany(id, generating,         ┬ count 1: this run's outcome is stored
 *                      updatedAt in the claim window)   └ count 0: discarded and logged
 * ```
 *
 * ## Special cases
 *
 * - **Stale takeover.** A claim untouched for {@link STALE_CLAIM_MS} (a crashed
 *   or hung run) can be taken over, matching `REWIND_STALE_SWEEP`.
 * - **Claim window.** `updatedAt` identifies the run: the claim writes
 *   `claimedAt` explicitly, and Prisma stores an explicit `@updatedAt` value.
 *   A final write matches `updatedAt` in `[claimedAt, claimedAt + 15 min)`
 *   rather than exactly `claimedAt`, because `disableWrappedShareLink` may
 *   clear the token mid-run, which moves `updatedAt` forward. A newer claim is
 *   never inside the window: taking over needs the row idle for 15 minutes
 *   after its last write, and that write was at or after `claimedAt`.
 * - **Completed rows.** Only admins regenerate a completed Rewind. A member's
 *   claim never matches one, even if the row completed after the action read it.
 *
 * @module lib/wrapped/generation-claim
 */

import "server-only"

import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("REWIND_CLAIM")

/** How long a claim holds without a write before another run may take it over. */
export const STALE_CLAIM_MS = 15 * 60 * 1000

/** A held claim: the row and the time that identifies this run. */
export interface GenerationClaim {
  wrappedId: string
  claimedAt: Date
}

/**
 * True for a `generating` row whose claim is still live at `now`.
 *
 * @example
 * ```ts
 * const now = new Date("2026-12-01T12:00:00Z")
 * isLiveClaim({ status: "generating", updatedAt: new Date("2026-12-01T11:50:00Z") }, now) // true
 * isLiveClaim({ status: "generating", updatedAt: new Date("2026-12-01T11:44:00Z") }, now) // false
 * ```
 */
export function isLiveClaim(row: { status: string; updatedAt: Date }, now: Date): boolean {
  return row.status === "generating" && row.updatedAt.getTime() > now.getTime() - STALE_CLAIM_MS
}

/**
 * Claims the member's row for `year` for one run.
 *
 * @param options.regenerate - true for an admin, who may claim a completed row
 * @returns the claim, or `null` when another live run holds the row (or, for a
 * member, when it has completed)
 */
export async function claimGeneration(
  userId: string,
  year: number,
  { regenerate }: { regenerate: boolean }
): Promise<GenerationClaim | null> {
  await prisma.plexWrapped.createMany({
    data: [{ userId, year, status: "pending", data: "{}" }],
    skipDuplicates: true,
  })

  const claimedAt = new Date()
  // The claim statement returns the row's id, so no second query can fail
  // after the row is already marked "generating".
  const claimed = await prisma.plexWrapped.updateManyAndReturn({
    where: {
      userId,
      year,
      OR: [
        { status: regenerate ? { not: "generating" } : { notIn: ["generating", "completed"] } },
        { status: "generating", updatedAt: { lt: new Date(claimedAt.getTime() - STALE_CLAIM_MS) } },
      ],
    },
    data: { status: "generating", error: null, updatedAt: claimedAt },
    select: { id: true },
  })
  if (claimed.length === 0) {
    return null
  }
  return { wrappedId: claimed[0].id, claimedAt }
}

/**
 * Writes a run's outcome only while the run still holds its claim.
 *
 * @returns `false`, after logging, when a newer run took the row over or an
 * admin replaced it; the row is left untouched
 */
export async function writeIfClaimed(
  claim: GenerationClaim,
  data: Prisma.PlexWrappedUpdateManyMutationInput
): Promise<boolean> {
  const { wrappedId, claimedAt } = claim
  const { count } = await prisma.plexWrapped.updateMany({
    where: {
      id: wrappedId,
      status: "generating",
      updatedAt: { gte: claimedAt, lt: new Date(claimedAt.getTime() + STALE_CLAIM_MS) },
    },
    data,
  })
  if (count === 0) {
    logger.warn("Rewind run lost its claim; discarding its outcome", {
      wrappedId,
      claimedAt: claimedAt.toISOString(),
      outcome: typeof data.status === "string" ? data.status : undefined,
    })
    return false
  }
  return true
}
