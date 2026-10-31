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
 * | `failed`          | The removal did not happen or did not finish; `code` says why  |
 * | `skipped`         | A re-check just before the removal protected the member; `code` is the skip |
 *
 * @module lib/inactivity/entries
 */

import { z } from "zod"

const inactivityEntrySchema = z.object({
  userId: z.string().min(1),
  outcome: z.enum(["removed", "already_removed", "failed", "skipped"]),
  /** The later of the newest play and the day the member joined (ISO). */
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
