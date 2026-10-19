/**
 * The race page's facts (page 11): month by month, the cumulative minutes
 * of the member's top 5 series, and who led.
 *
 * The race runs only with 3 or more listed series of 60 minutes or more,
 * watched across 3 or more active months. The leader of a month is the
 * series with the most cumulative minutes; on a tie the leader keeps the
 * lead, else the higher-ranked series takes it.
 *
 * @module lib/wrapped/stats/race
 */

import type { PlayEvent } from "@/lib/wrapped/sources/watch-history-source"
import { monthOf } from "@/lib/wrapped/time/zone"

import { isListed, minutesOf, titleKey, videoEvents, type StatsContext, type TitleKey } from "./keys"
import { rankTitles } from "./rank"

const RUNNERS = 5
const MIN_SERIES = 3
const MIN_SERIES_MINUTES = 60
const MIN_ACTIVE_MONTHS = 3

export type RaceStats =
  | { eligible: false }
  | {
      eligible: true
      /** The runners, in final standing order. */
      series: Array<{ key: TitleKey; title: string }>
      /** The window's months, 1-12. */
      months: number[]
      /** `frames[m][i]`: runner i's cumulative minutes at the end of `months[m]`. */
      frames: number[][]
      leader: Array<TitleKey | null>
      leadChanges: number
      /** The month the final leader last took the lead; null when the lead never changed. */
      overtakeMonth: number | null
      /** The smallest lead of first over second, in a month both had minutes. */
      closestGapMinutes: number | null
    }

/**
 * @example
 * ```ts
 * const race = computeRace(events, ctx)
 * if (race.eligible) race.leadChanges // 2
 * ```
 */
export function computeRace(events: readonly PlayEvent[], ctx: StatsContext): RaceStats {
  const ranked = rankTitles(events, ctx, "series")
  const contenders = ranked.filter((s) => s.minutes >= MIN_SERIES_MINUTES)
  const series = videoEvents(events).filter((e) => e.mediaType === "episode" && isListed(e, ctx))
  const activeMonths = new Set(series.map((e) => monthOf(e.startedAt, ctx.zone)))
  if (contenders.length < MIN_SERIES || activeMonths.size < MIN_ACTIVE_MONTHS) return { eligible: false }

  const runners = ranked.slice(0, RUNNERS)
  const first = monthOf(ctx.window.start, ctx.zone)
  const months = Array.from({ length: monthOf(ctx.window.end - 1, ctx.zone) - first + 1 }, (_, i) => first + i)
  const seconds = runners.map(() => months.map(() => 0))
  for (const e of series) {
    const runner = runners.findIndex((r) => r.key === titleKey(e))
    if (runner >= 0) seconds[runner][monthOf(e.startedAt, ctx.zone) - first] += e.playSeconds
  }
  const cumulative = seconds.map((row) => row.map((_, m) => row.slice(0, m + 1).reduce((a, b) => a + b, 0)))

  const leader: Array<TitleKey | null> = []
  let leadChanges = 0
  let overtakeMonth: number | null = null
  let closestGapMinutes: number | null = null
  months.forEach((month, m) => {
    const standing = cumulative.map((row) => row[m])
    const top = Math.max(...standing)
    const previous = leader.at(-1) ?? null
    const keep = previous !== null && standing[runners.findIndex((r) => r.key === previous)] === top
    const current = top === 0 ? null : keep ? previous : runners[standing.indexOf(top)].key
    if (previous !== null && current !== previous) {
      leadChanges += 1
      overtakeMonth = month
    }
    leader.push(current)
    const [a, b] = [...standing].sort((x, y) => y - x)
    if (b > 0) {
      const gap = minutesOf(a) - minutesOf(b)
      closestGapMinutes = closestGapMinutes === null ? gap : Math.min(closestGapMinutes, gap)
    }
  })

  return {
    eligible: true,
    series: runners.map(({ key, title }) => ({ key, title })),
    months,
    frames: months.map((_, m) => cumulative.map((row) => minutesOf(row[m]))),
    leader,
    leadChanges,
    overtakeMonth,
    closestGapMinutes,
  }
}
