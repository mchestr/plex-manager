/**
 * The feature switch (TS 8.12, 10.3 `updateCleanupSettings` step 2, E20),
 * and the 7-day hold that Feature on and `resumeCleanup` share.
 * Server-only.
 *
 * | Event | Claim | Writes |
 * |---|---|---|
 * | Feature on | the run claim, busy: `"busy"` | `enabled`, `enabledAt`, `holdUntil`, the recovery of `deleting` items with the approval cleared, earlier leave dates moved to the hold, in one transaction |
 * | Feature off | none, never busy | `enabled: false` in its own statement. Then, in a second statement, `approved` items go back to `leaving` with the approval cleared |
 *
 * Feature off never takes the claim and never waits: an act step locks the
 * settings row first and checks `enabled` before each item, so the off
 * write commits after the item in flight, and no other item starts. Off
 * changes no other item: Leaving soon, Keeps and held items stay.
 *
 * @module lib/cleanup/actions/settings/feature
 */

import "server-only"

import { RESUME_HOLD_DAYS } from "@/lib/cleanup/constants"
import { recoverDeleting } from "@/lib/cleanup/run/recover"
import { releaseRunClaim, takeRunClaim } from "@/lib/cleanup/run/run-claim"
import { CLEANUP_SETTINGS_ID, today } from "@/lib/cleanup/settings"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { addDays } from "@/lib/ui/date-range"

/** A transaction of an action that holds the run claim (TS 8.1 item 4). */
export const CLAIMED_TRANSACTION = { timeout: 15_000 }

/** The day key before which nothing is deleted: `day` (today in the server zone) plus 7 days. */
export function holdFrom(day: string): string {
  return addDays(day, RESUME_HOLD_DAYS)
}

/**
 * The hold of Feature on and Resume, in the caller's transaction, under the
 * run claim: every `deleting` item goes back to `leaving` with its approval
 * cleared (safety-r2-7), then every leave date before `holdUntil` moves to
 * it. Held items have no leave date and stay. Returns the moved dates.
 */
export async function applyHold(tx: PrismaTransactionClient, holdUntil: string): Promise<number> {
  await recoverDeleting(tx, { clearApproval: true })
  const { count } = await tx.cleanupItem.updateMany({ where: { leaveOn: { lt: holdUntil } }, data: { leaveOn: holdUntil } })
  return count
}

/**
 * Every `approved` item back to `leaving`, with the approval cleared, in its
 * own statement (architecture-r2-7). `needsApproval` stays, so the batch
 * waits for a new approval. Returns the count.
 */
export async function unapproveAll(): Promise<number> {
  const { count } = await prisma.cleanupItem.updateMany({ where: { state: "approved" }, data: { state: "leaving", approvedAt: null, approvedBy: null } })
  return count
}

/** `on`: this call turned the feature on. `unchanged`: it was on already. `busy`: a run holds the claim. */
export type FeatureOn = "on" | "unchanged" | "busy"

/** Feature on (TS 8.12): under the run claim, released with the change check (TS 8.1 item 7). */
export async function turnFeatureOn(now: Date, actorId: string): Promise<FeatureOn> {
  const held = await takeRunClaim(now)
  if (!held) return "busy"
  try {
    const holdUntil = holdFrom(await today(now))
    return await prisma.$transaction(async (tx) => {
      const { count } = await tx.cleanupSettings.updateMany({
        where: { id: CLEANUP_SETTINGS_ID, enabled: false },
        data: { enabled: true, enabledAt: now, holdUntil },
      })
      if (count === 0) return "unchanged"
      await applyHold(tx, holdUntil)
      return "on"
    }, CLAIMED_TRANSACTION)
  } finally {
    await releaseRunClaim(held.claim, held.baseline, { actorId })
  }
}

/**
 * Feature off (TS 8.12) with no claim. Null when it was off already, else
 * the count of approved items that went back to waiting.
 */
export async function turnFeatureOff(): Promise<number | null> {
  const { count } = await prisma.cleanupSettings.updateMany({ where: { id: CLEANUP_SETTINGS_ID, enabled: true }, data: { enabled: false } })
  return count === 0 ? null : unapproveAll()
}
