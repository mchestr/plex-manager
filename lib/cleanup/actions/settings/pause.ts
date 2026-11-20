/**
 * "Pause all cleanup" and "Resume cleanup" (TS 8.12, 10.3, E20,
 * architecture-r2-7). Server-only.
 *
 * Pause takes no claim, never waits and never fails with `CONFLICT`. It
 * sets `pausedAt` and `pausedBy` in its own statement. After that commits, a
 * second statement moves `approved` items back to `leaving` with the
 * approval cleared. The two never share a transaction: the act step locks
 * the settings row first, so this order never deadlocks, and the act step
 * stops before its next item.
 *
 * Resume takes the run claim. In one transaction it clears the pause, sets
 * the 7-day hold, recovers `deleting` items with the approval cleared, and
 * moves earlier leave dates to the hold. It releases with the change check.
 *
 * Pause while paused, and resume while not paused, change nothing.
 *
 * @module lib/cleanup/actions/settings/pause
 */

import "server-only"

import { applyHold, CLAIMED_TRANSACTION, holdFrom, unapproveAll } from "@/lib/cleanup/actions/settings/feature"
import { releaseRunClaim, takeRunClaim } from "@/lib/cleanup/run/run-claim"
import { CLEANUP_SETTINGS_ID, readCleanupSettingsRow, today } from "@/lib/cleanup/settings"
import { prisma } from "@/lib/prisma"

/** `changed` false: it was paused already, and nothing was written. */
export interface PauseOutcome {
  changed: boolean
  unapproved: number
}

/** Pauses all cleanup at `now`, by `actorId`. */
export async function pauseAll(actorId: string, now: Date): Promise<PauseOutcome> {
  await readCleanupSettingsRow() // creates the row on a first use, so the guarded write below can match it
  const { count } = await prisma.cleanupSettings.updateMany({
    where: { id: CLEANUP_SETTINGS_ID, pausedAt: null },
    data: { pausedAt: now, pausedBy: actorId },
  })
  if (count === 0) return { changed: false, unapproved: 0 }
  return { changed: true, unapproved: await unapproveAll() }
}

export type ResumeOutcome =
  | { status: "resumed"; holdUntil: string; moved: number }
  | { status: "unchanged"; holdUntil: string }
  | { status: "busy" }

/** The hold that is in force when nothing changes: the stored one, or today when it has passed. */
const currentHold = (stored: string | null, day: string) => (stored && stored > day ? stored : day)

/** Resumes cleanup at `now`, with the hold of Feature on (TS 8.12). */
export async function resumeAll(actorId: string, now: Date): Promise<ResumeOutcome> {
  const [row, day] = await Promise.all([readCleanupSettingsRow(), today(now)])
  const unchanged: ResumeOutcome = { status: "unchanged", holdUntil: currentHold(row.holdUntil, day) }
  if (!row.pausedAt) return unchanged
  const held = await takeRunClaim(now)
  if (!held) return { status: "busy" }
  try {
    const holdUntil = holdFrom(day)
    return await prisma.$transaction(async (tx): Promise<ResumeOutcome> => {
      const { count } = await tx.cleanupSettings.updateMany({
        where: { id: CLEANUP_SETTINGS_ID, pausedAt: { not: null } },
        data: { pausedAt: null, pausedBy: null, holdUntil },
      })
      if (count === 0) return unchanged
      return { status: "resumed", holdUntil, moved: await applyHold(tx, holdUntil) }
    }, CLAIMED_TRANSACTION)
  } finally {
    await releaseRunClaim(held.claim, held.baseline, { actorId })
  }
}
