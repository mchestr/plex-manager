/**
 * What a member activity run records for each member the inactivity sweep
 * acted on (`InactivityRun.entries`): the member id, the outcome and the dates
 * the decision used. Never a name, so a removed member leaves no personal data
 * behind beyond their id.
 *
 * | Outcome           | Meaning                                                        |
 * |-------------------|----------------------------------------------------------------|
 * | `removed`         | The sweep removed the member's share of the Plex server        |
 * | `already_removed` | The share was already gone; the clean-up still ran             |
 * | `failed`          | The share was not removed; `code` says why                     |
 *
 * A `removed` or `already_removed` entry with `code: "offboard_failed"` lost
 * its share, but the clean-up after it did not finish, so the run stopped.
 * | `skipped`         | A re-check just before the removal protected the member; `code` is the skip |
 *
 * @module lib/inactivity/entries
 */

import { z } from "zod"

const inactivityEntrySchema = z.object({
  userId: z.string().min(1),
  outcome: z.enum(["removed", "already_removed", "failed", "skipped"]),
  /** The latest of the newest play, the day the member joined and the day their access came back (ISO). */
  lastActiveAt: z.iso.datetime(),
  /** The newest play (ISO); null when Tautulli has none. */
  lastSeenAt: z.iso.datetime().nullable(),
  /** A failure code (`busy`, `PLEX_AUTH`, ...) or the skip that protected the member. */
  code: z.string().optional(),
})

export type InactivityEntry = z.infer<typeof inactivityEntrySchema>

export type InactivityOutcome = InactivityEntry["outcome"]

/** The entries of a stored run, dropping any row that no longer matches the shape. */
export function parseInactivityEntries(stored: unknown): InactivityEntry[] {
  const rows = Array.isArray(stored) ? stored : []
  return rows.flatMap((row) => {
    const parsed = inactivityEntrySchema.safeParse(row)
    return parsed.success ? [parsed.data] : []
  })
}
