/**
 * Binges and the records page's session facts (page 12, and each series'
 * biggest night on page 05).
 *
 * A binge is a run of consecutive counted plays (FR-46) that are all
 * episodes of one series, each starting less than 30 minutes after the
 * previous one stopped; any other play in between ends it. It needs 3
 * episodes or more. The longest binge has the most minutes; the deepest has
 * the most episodes (the Series Devourer meter). Hidden series end runs like
 * any other play but never become a record.
 *
 * @module lib/wrapped/stats/sessions
 */

import { formatDayKey, zonedParts } from "@/lib/utils/zoned-time"
import { isCountedPlay, type PlayEvent } from "@/lib/wrapped/sources/watch-history-source"
import { dayKey } from "@/lib/wrapped/time/zone"

import { addDays, nightKey, weekStart } from "./days"
import { isListed, minutesOf, titleKey, videoEvents, type StatsContext, type TitleKey, type VideoEvent } from "./keys"
import { rankTitles } from "./rank"

const MAX_GAP_MS = 30 * 60_000
const MIN_BINGE = 3

interface Binge {
  key: TitleKey
  title: string
  episodes: number
  minutes: number
  /** The day the binge started. */
  date: string
}

export interface SessionStats {
  longestBinge: Binge | null
  deepestBinge: Binge | null
  mostEpisodesDay: { date: string; episodes: number } | null
  /** The Monday-to-Sunday week with the most minutes, clipped to the window. */
  biggestWeek: { from: string; to: string; minutes: number } | null
  /** Each listed series' night (04:00 to 04:00) with the most episodes. */
  biggestNight: Partial<Record<TitleKey, { date: string; episodes: number }>>
  mostPaused: { key: TitleKey; title: string; minutes: number } | null
}

function findRuns(plays: VideoEvent[]): VideoEvent[][] {
  const runs: VideoEvent[][] = []
  let run: VideoEvent[] = []
  for (const e of plays) {
    const prev = run.at(-1)
    const joins = prev && e.mediaType === "episode" && titleKey(prev) === titleKey(e) && e.startedAt - prev.stoppedAt < MAX_GAP_MS
    if (!joins) {
      if (run.length > 0) runs.push(run)
      run = []
    }
    if (e.mediaType === "episode") run.push(e)
  }
  if (run.length > 0) runs.push(run)
  return runs
}

/** The highest entry by `score`; the earliest wins a tie. */
function best<T>(items: T[], score: (item: T) => number): T | null {
  return items.reduce<T | null>((top, item) => (top === null || score(item) > score(top) ? item : top), null)
}

function tally(keys: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1)
  return counts
}

function clipWeek(monday: string, first: string, last: string, minutes: number): SessionStats["biggestWeek"] {
  const sunday = addDays(monday, 6)
  return { from: monday < first ? first : monday, to: sunday > last ? last : sunday, minutes }
}

/**
 * @example
 * ```ts
 * computeSessions(events, ctx).longestBinge
 * // { key: "series:77", title: "Severance", episodes: 6, minutes: 312, date: "2026-02-14" }
 * ```
 */
export function computeSessions(events: readonly PlayEvent[], ctx: StatsContext): SessionStats {
  const plays = videoEvents(events)
    .filter(isCountedPlay)
    .sort((a, b) => a.startedAt - b.startedAt)
  const ranked = rankTitles(events, ctx)
  const titles = new Map(ranked.map((t) => [t.key, t.title]))

  const binges = findRuns(plays)
    .filter((run) => run.length >= MIN_BINGE && isListed(run[0], ctx))
    .map((run): Binge => {
      const key = titleKey(run[0])!
      const seconds = run.reduce((sum, e) => sum + e.playSeconds, 0)
      return { key, title: titles.get(key)!, episodes: run.length, minutes: minutesOf(seconds), date: dayKey(run[0].startedAt, ctx.zone) }
    })

  const episodes = plays.filter((e) => e.mediaType === "episode")
  const perDay = [...tally(episodes.map((e) => dayKey(e.startedAt, ctx.zone)))]
  const topDay = best(perDay, ([, count]) => count)

  const first = dayKey(ctx.window.start, ctx.zone)
  const last = dayKey(ctx.window.end - 1, ctx.zone)
  const weekSeconds = new Map<string, number>()
  for (const e of videoEvents(events).sort((a, b) => a.startedAt - b.startedAt)) {
    const { year, month, day, weekday } = zonedParts(e.startedAt, ctx.zone)
    const monday = weekStart(formatDayKey(year, month, day), weekday)
    weekSeconds.set(monday, (weekSeconds.get(monday) ?? 0) + e.playSeconds)
  }
  const topWeek = best([...weekSeconds], ([, seconds]) => seconds)

  const biggestNight: SessionStats["biggestNight"] = {}
  const nights = tally(episodes.filter((e) => isListed(e, ctx)).map((e) => `${titleKey(e)}|${nightKey(e.startedAt, ctx.zone)}`))
  for (const [id, count] of nights) {
    const [key, date] = id.split("|") as [TitleKey, string]
    const current = biggestNight[key]
    if (!current || count > current.episodes || (count === current.episodes && date < current.date)) {
      biggestNight[key] = { date, episodes: count }
    }
  }

  const paused = new Map<TitleKey, number>()
  for (const e of videoEvents(events).filter((e) => isListed(e, ctx))) {
    paused.set(titleKey(e)!, (paused.get(titleKey(e)!) ?? 0) + e.pausedSeconds)
  }
  const topPaused = best(ranked, (t) => paused.get(t.key) ?? 0)
  const pausedMinutes = topPaused ? minutesOf(paused.get(topPaused.key) ?? 0) : 0

  return {
    longestBinge: best(binges, (b) => b.minutes),
    deepestBinge: best(binges, (b) => b.episodes),
    mostEpisodesDay: topDay ? { date: topDay[0], episodes: topDay[1] } : null,
    biggestWeek: topWeek ? clipWeek(topWeek[0], first, last, minutesOf(topWeek[1])) : null,
    biggestNight,
    mostPaused: topPaused && pausedMinutes > 0 ? { key: topPaused.key, title: topPaused.title, minutes: pausedMinutes } : null,
  }
}
