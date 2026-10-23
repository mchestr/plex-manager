/**
 * A member's year in numbers for Discord (`/mystats` and the linked-role
 * hours), read two ways that agree (P11.12, RWP-17):
 *
 * - {@link statsFromFacts}: the stored v3 Rewind's facts, so no upstream
 *   call is made;
 * - {@link statsFromEvents}: the member's plays, through the same Rewind
 *   stat modules (totals, time, calendar and the one title ranking) that
 *   built those facts.
 *
 * A golden fixture gives the same result both ways.
 *
 * @module lib/discord/stats/year-stats
 */

import { z } from "zod"

import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import type { PlayEvent } from "@/lib/wrapped/sources/watch-history-source"
import { computeCalendar } from "@/lib/wrapped/stats/calendar"
import type { StatsContext } from "@/lib/wrapped/stats/keys"
import { compareRanked, rankTitles } from "@/lib/wrapped/stats/rank"
import { computeTime } from "@/lib/wrapped/stats/time"
import { computeTotals } from "@/lib/wrapped/stats/totals"

export const memberYearStatsSchema = z.object({
  year: z.number().int(),
  /** Where the numbers came from: the stored Rewind, or a read of the history. */
  source: z.enum(["rewind", "history"]),
  totalMinutes: z.number().int().nonnegative(),
  counts: z.object({ episodes: z.number().int(), series: z.number().int(), films: z.number().int() }),
  topShow: z.string().nullable(),
  topFilm: z.string().nullable(),
  /** The busiest start hour, 0-23, in the member's zone. */
  peakHour: z.number().int().min(0).max(23).nullable(),
  longestStreakDays: z.number().int().positive().nullable(),
})

export type MemberYearStats = z.infer<typeof memberYearStatsSchema>

/** Whole hours, floored once from minutes, as the Rewind facts count them. */
export function hoursOf(stats: Pick<MemberYearStats, "totalMinutes">): number {
  return Math.floor(stats.totalMinutes / 60)
}

const numberFact = (facts: RewindFactsV3, id: keyof RewindFactsV3) => {
  const value = facts[id]?.value
  return typeof value === "number" ? value : null
}
const textFact = (facts: RewindFactsV3, id: keyof RewindFactsV3) => {
  const value = facts[id]?.value
  return typeof value === "string" ? value : null
}

/**
 * The stats a stored v3 Rewind already holds. An absent fact is an
 * ineligible one, so it reads as zero or null.
 */
export function statsFromFacts(year: number, facts: RewindFactsV3): MemberYearStats {
  return {
    year,
    source: "rewind",
    totalMinutes: numberFact(facts, "time.totalMinutes") ?? 0,
    counts: {
      episodes: numberFact(facts, "counts.episodes") ?? 0,
      series: numberFact(facts, "counts.series") ?? 0,
      films: numberFact(facts, "counts.films") ?? 0,
    },
    topShow: textFact(facts, "series[1].title"),
    topFilm: textFact(facts, "films[1].title"),
    peakHour: numberFact(facts, "hours.peak"),
    longestStreakDays: numberFact(facts, "streak.longest.days"),
  }
}

/**
 * The same stats computed from the member's plays in `ctx.window`. Hidden
 * titles count toward the totals and never top a list; the top show and film
 * follow the Rewind lists (series by minutes, films by counted plays).
 */
export function statsFromEvents(year: number, events: readonly PlayEvent[], ctx: StatsContext): MemberYearStats {
  const totals = computeTotals(events, ctx)
  const ranked = rankTitles(events, ctx).filter((t) => t.plays > 0)
  const [topShow] = ranked.filter((t) => t.kind === "series")
  const [topFilm] = ranked.filter((t) => t.kind === "film").sort((a, b) => b.plays - a.plays || compareRanked(a, b))
  return {
    year,
    source: "history",
    totalMinutes: totals.totalMinutes,
    counts: { episodes: totals.counts.episodes, series: totals.counts.series, films: totals.counts.films },
    topShow: topShow?.title ?? null,
    topFilm: topFilm?.title ?? null,
    peakHour: computeTime(events, ctx).peak,
    longestStreakDays: computeCalendar(events, ctx).streak?.days ?? null,
  }
}
