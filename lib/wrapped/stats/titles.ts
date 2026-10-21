/**
 * The per-title facts of the list pages (05 and 06), the quiz (04), and the
 * title shapes the archetype scorers read: completion, rewatching, breadth
 * and loyalty.
 *
 * ## Rules
 *
 * - The lists are listed titles with a counted play (design 7.2: a play
 *   counts toward "watched" lists from 120 s or 90%; hidden or
 *   rating-excluded titles never appear). A title seen only in samples
 *   still counts toward the totals but makes no list, quiz or longest film.
 *   Series rank by minutes (design 4.9); films by counted plays, then that
 *   same order (page 06).
 * - A series' `rewatched` is how many times over its episodes were played:
 *   counted plays divided by distinct episodes, floored, when 2 or more.
 * - `rewatchShare` counts the plays of films and episodes played 3 times or
 *   more ("again and again"): one rewatch, or a resumed play, is not a habit.
 * - Completion counts films and episodes (by rating key) with a counted
 *   play as started, and those with a finished play (`isFinished`) as
 *   finished. It names no title, so every play counts; it needs 5 started.
 * - The quiz asks for the No. 1 series with 3 or more series, else for the
 *   No. 1 title of either kind with 3 or more titles, and is off when No. 1
 *   and No. 2 are within 2% of No. 1's minutes (D7).
 *
 * @module lib/wrapped/stats/titles
 */

import { isCountedPlay, isFinished, type PlayEvent } from "@/lib/wrapped/sources/watch-history-source"
import { monthOf } from "@/lib/wrapped/time/zone"

import { isListed, minutesOf, titleKey, videoEvents, type StatsContext, type TitleKey } from "./keys"
import type { MetadataLookup } from "./metadata"
import { compareRanked, rankTitles, type RankedTitle } from "./rank"

const LIST = 5
const QUIZ_OPTIONS = 4
const MIN_QUIZ = 3
const QUIZ_GAP = 0.02
const MIN_STARTED = 5
const FAVOURITE_PLAYS = 3

interface SeriesEntry extends RankedTitle {
  episodes: number
  seasons: number
  monthsActive: number
  /** Minutes watched in each calendar month, January first (12 entries): page 05's small multiples. */
  monthly: number[]
  /** Times over, 2 or more; null when not rewatched. */
  rewatched: number | null
}

interface Completion {
  started: number
  finished: number
  share: number
}

export interface TitleStats {
  series: SeriesEntry[]
  /** Every listed series past the top five, in the same order: the desktop Notes' full table (P7.4). */
  moreSeries: Array<{ key: TitleKey; title: string; minutes: number; episodes: number }>
  films: RankedTitle[]
  /** Null under 5 started films and episodes. */
  completion: Completion | null
  /** Null without a started film. */
  filmsFinished: Completion | null
  longestFilm: { key: TitleKey; title: string; minutes: number } | null
  /** The share of counted plays on films and episodes played three times or more: favourites, not one rewatch. */
  rewatchShare: number
  /** Films played twice or more, and series watched twice over. */
  rewatchedTitles: number
  /** Distinct films and series with a counted play. */
  distinctTitles: number
  /** The top three listed series' share of all series minutes; null without series. */
  top3SeriesShare: number | null
  /** `options` in rank order (No. 1 first), with their display `titles`. */
  quiz: { kind: "series" | "mixed"; options: TitleKey[]; titles: string[]; gapMinutes: number } | null
}

function completion(plays: readonly PlayEvent[]): Completion | null {
  const started = new Set(plays.map((e) => e.ratingKey))
  if (started.size === 0) return null
  const finished = new Set(plays.filter(isFinished).map((e) => e.ratingKey))
  return { started: started.size, finished: finished.size, share: finished.size / started.size }
}

function seriesEntry(series: RankedTitle, events: ReturnType<typeof videoEvents>, ctx: StatsContext): SeriesEntry {
  const own = events.filter((e) => titleKey(e) === series.key && isListed(e, ctx))
  const counted = own.filter(isCountedPlay)
  const episodes = new Set(counted.map((e) => e.ratingKey)).size
  const times = episodes > 0 ? Math.floor(counted.length / episodes) : 0
  const seconds = Array.from({ length: 12 }, () => 0)
  for (const e of own) seconds[monthOf(e.startedAt, ctx.zone) - 1] += e.playSeconds
  return {
    ...series,
    episodes,
    seasons: new Set(counted.flatMap((e) => (e.parentMediaIndex === null ? [] : [e.parentMediaIndex]))).size,
    monthsActive: new Set(own.map((e) => monthOf(e.startedAt, ctx.zone))).size,
    monthly: seconds.map(minutesOf),
    rewatched: times >= 2 ? times : null,
  }
}

function quiz(ranked: RankedTitle[], series: RankedTitle[]): TitleStats["quiz"] {
  const kind = series.length >= MIN_QUIZ ? "series" : "mixed"
  const options = kind === "series" ? series : ranked
  if (options.length < MIN_QUIZ) return null
  const gapMinutes = options[0].minutes - options[1].minutes
  if (gapMinutes <= options[0].minutes * QUIZ_GAP) return null
  const asked = options.slice(0, QUIZ_OPTIONS)
  return { kind, options: asked.map((t) => t.key), titles: asked.map((t) => t.title), gapMinutes }
}

/**
 * @example
 * ```ts
 * const titles = computeTitles(events, ctx, lookup)
 * titles.series[0].rewatched // 3 for a series watched three times over
 * titles.quiz                // null when No. 1 leads No. 2 by 2% or less
 * ```
 */
export function computeTitles(events: readonly PlayEvent[], ctx: StatsContext, lookup: MetadataLookup): TitleStats {
  const videos = videoEvents(events)
  const counted = videos.filter(isCountedPlay)
  const ranked = rankTitles(events, ctx).filter((t) => t.plays > 0)
  const series = ranked.filter((t) => t.kind === "series")
  const films = ranked.filter((t) => t.kind === "film")

  const playsOf = new Map<string, number>()
  for (const e of counted) playsOf.set(e.ratingKey, (playsOf.get(e.ratingKey) ?? 0) + 1)
  const favourites = counted.filter((e) => playsOf.get(e.ratingKey)! >= FAVOURITE_PLAYS).length
  const entries = series.map((s) => seriesEntry(s, videos, ctx))

  const longest = films
    .map((f) => ({ f, runtime: lookup(videos.find((e) => titleKey(e) === f.key)!)?.runtimeSec ?? null }))
    .filter((x): x is { f: RankedTitle; runtime: number } => x.runtime !== null && x.runtime > 0)
    .sort((a, b) => b.runtime - a.runtime || compareRanked(a.f, b.f))[0]
  const seriesSeconds = videos.filter((e) => e.mediaType === "episode").reduce((sum, e) => sum + e.playSeconds, 0)
  const top3 = series.slice(0, 3).reduce((sum, s) => sum + s.seconds, 0)

  return {
    series: entries.slice(0, LIST),
    moreSeries: entries.slice(LIST).map(({ key, title, minutes, episodes }) => ({ key, title, minutes, episodes })),
    films: [...films].sort((a, b) => b.plays - a.plays || compareRanked(a, b)).slice(0, LIST),
    completion: (() => {
      const c = completion(counted)
      return c && c.started >= MIN_STARTED ? c : null
    })(),
    filmsFinished: completion(counted.filter((e) => e.mediaType === "movie")),
    longestFilm: longest ? { key: longest.f.key, title: longest.f.title, minutes: minutesOf(longest.runtime) } : null,
    rewatchShare: counted.length > 0 ? favourites / counted.length : 0,
    rewatchedTitles: films.filter((f) => f.plays >= 2).length + entries.filter((s) => s.rewatched !== null).length,
    distinctTitles: new Set(counted.map((e) => titleKey(e))).size,
    top3SeriesShare: seriesSeconds > 0 ? top3 / seriesSeconds : null,
    quiz: quiz(ranked, series),
  }
}
