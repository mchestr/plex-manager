/**
 * A member's standing on the Invites page, from stored values only: the page
 * never waits on Tautulli. Apply and Make check again with live reads. Pure
 * and client-safe.
 *
 * | State | When |
 * |---|---|
 * | `pending` | an open PENDING application |
 * | `approved` | an open APPROVED application, no paid subscription |
 * | `paused` | an open APPROVED application and a paid subscription |
 * | `refused`, `revoked` | the last refusal or revoke is less than 30 days old |
 * | `paid` | no open application and a paid subscription |
 * | `can_apply` | the stored hours are more than the first tier's, or no hours are stored |
 * | `below_bar` | the stored hours are not more than the first tier's |
 *
 * @module lib/affiliates/standing
 */

const WAIT_MS = 30 * 24 * 60 * 60 * 1000

export type Standing =
  | { state: "pending"; appliedAt: Date }
  | { state: "approved" | "paused" | "paid" }
  | { state: "refused" | "revoked"; reason: string | null; applyAgainAt: Date }
  | { state: "can_apply"; hours: number | null }
  | { state: "below_bar"; hours: number; barHours: number }

export interface StandingFacts {
  open: { status: string; appliedAt: Date } | null
  /** The newest REFUSED or REVOKED application, with when it was decided or ended. */
  lastRefusal: { status: "REFUSED" | "REVOKED"; reason: string | null; at: Date } | null
  paid: boolean
  /** The stored all-time hours; null before the first read. */
  hours: number | null
  /** The first tier's hours: applying needs more than this. */
  barHours: number
}

/** The member's standing at `now` (see the module overview). */
export function affiliateStanding(facts: StandingFacts, now: Date): Standing {
  const { open, lastRefusal, paid, hours, barHours } = facts
  if (open?.status === "PENDING") return { state: "pending", appliedAt: open.appliedAt }
  if (open?.status === "APPROVED") return { state: paid ? "paused" : "approved" }

  if (lastRefusal && now.getTime() - lastRefusal.at.getTime() < WAIT_MS) {
    return {
      state: lastRefusal.status === "REFUSED" ? "refused" : "revoked",
      reason: lastRefusal.reason,
      applyAgainAt: new Date(lastRefusal.at.getTime() + WAIT_MS),
    }
  }
  if (paid) return { state: "paid" }
  if (hours === null || hours > barHours) return { state: "can_apply", hours }
  return { state: "below_bar", hours, barHours }
}
