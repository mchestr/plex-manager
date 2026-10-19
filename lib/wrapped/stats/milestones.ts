/**
 * The milestone ladder on the number page (page 02): the day the member's
 * cumulative hours crossed each rung.
 *
 * The ladder scales with the total: it is the highest four rungs of
 * `RUNGS` at or below the total hours, so 1,307 hours gives 250, 500,
 * 750 and 1,000, and 60 hours gives 10, 25 and 50. Under 10 hours there is
 * no ladder.
 *
 * @module lib/wrapped/stats/milestones
 */

import type { PlayEvent } from "@/lib/wrapped/sources/watch-history-source"
import { dayKey } from "@/lib/wrapped/time/zone"

import { videoEvents, type StatsContext } from "./keys"

/** Every rung a ladder may use, in hours. */
const RUNGS = [10, 25, 50, 100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000]
const LADDER_LENGTH = 4

export interface Milestone {
  hours: number
  /** The day, in the member's zone, of the play that crossed the rung. */
  date: string
}

/**
 * @example
 * ```ts
 * computeMilestones(events, ctx).map((m) => m.hours) // [250, 500, 750, 1000] at 1,307 hours
 * ```
 */
export function computeMilestones(events: readonly PlayEvent[], ctx: Pick<StatsContext, "zone">): Milestone[] {
  const plays = videoEvents(events).sort((a, b) => a.startedAt - b.startedAt)
  const totalSeconds = plays.reduce((sum, e) => sum + e.playSeconds, 0)
  const ladder = RUNGS.filter((hours) => hours * 3600 <= totalSeconds).slice(-LADDER_LENGTH)

  const milestones: Milestone[] = []
  let seconds = 0
  for (const e of plays) {
    seconds += e.playSeconds
    while (milestones.length < ladder.length && seconds >= ladder[milestones.length] * 3600) {
      milestones.push({ hours: ladder[milestones.length], date: dayKey(e.startedAt, ctx.zone) })
    }
  }
  return milestones
}
