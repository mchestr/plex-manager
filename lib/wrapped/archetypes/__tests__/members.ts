/**
 * Built members for the archetype tests: a deliberately plain viewer whose
 * only strong trait can be switched on.
 */

import { dayKey } from "@/lib/utils/zoned-time"
import type { PlayEvent } from "@/lib/wrapped/sources/watch-history-source"
import { computeMemberStats, type MemberStats } from "@/lib/wrapped/stats/compute"
import type { StatsContext } from "@/lib/wrapped/stats/keys"

import { play, statsContext } from "../../stats/__tests__/build-events"

export const ZONE = "UTC"
const HOURS = [9, 11, 13, 15, 17, 19, 21, 23]

const at = (day: number, slot: number) => {
  const date = new Date(Date.UTC(2026, 0, 3 + day))
  const hh = String(HOURS[slot % HOURS.length]).padStart(2, "0")
  return `${date.toISOString().slice(0, 10)}T${hh}:00`
}

/**
 * Twenty two-hour films and forty episodes of eight series, one play a day,
 * spread over the week and the clock: 70 hours with no habit that stands out.
 * Every play finishes.
 */
export function plainViewer({ abandonFilms = false } = {}): PlayEvent[] {
  const films = Array.from({ length: 20 }, (_, i) =>
    play({
      at: at(i * 5, i),
      zone: ZONE,
      film: `${100 + i}`,
      seconds: abandonFilms && i % 2 === 0 ? 2400 : 7200,
      percent: abandonFilms && i % 2 === 0 ? 30 : 100,
    })
  )
  const episodes = Array.from({ length: 40 }, (_, i) =>
    play({ at: at(i * 5 + 2, i + 3), zone: ZONE, series: `${500 + (i % 8)}`, season: 1, episode: Math.floor(i / 8) + 1, seconds: 2700 })
  )
  return [...films, ...episodes].sort((a, b) => a.startedAt - b.startedAt)
}

/** Each play started two days after its title came out. */
export function premiereChaser(): PlayEvent[] {
  return plainViewer().map((e) => ({ ...e, originallyAvailableAt: dayKey(e.startedAt - 2 * 86_400_000, ZONE) }))
}

export const context: StatsContext = statsContext(ZONE)

export function statsOf(events: readonly PlayEvent[], ctx: StatsContext = context): MemberStats {
  return computeMemberStats(events, ctx, {
    lifetime: null,
    metadata: null,
    requests: null,
    aggregate: null,
    library: null,
    excludedContentRatings: [],
  })
}
