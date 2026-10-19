/**
 * One scorer per archetype (design 7.6, RWP-18): each maps the archetype's
 * motif onto measured stats and returns a 0-100 score with the fact ids that
 * earned it, which feed the evidence graphic and "Why this?".
 *
 * ## Scorers
 *
 * | Archetype | Score | Evidence |
 * |---|---|---|
 * | midnight-marathoner | after-dark share x 250 | after dark, peak and quietest hours |
 * | credits-roller | (completion share - 50%) x 160, so 100% is 80 | completion, films finished |
 * | comfort-rewatcher | share of plays on titles played 3+ times x 200 | that share, rewatched titles |
 * | premiere-chaser | fresh share (within 14 days of release) x 200 | fresh share |
 * | series-devourer | series share x 60 + 4 per episode of the deepest binge, to 10 | series share, deepest binge |
 * | weekend-double-feature | (weekend share - 28%) x 400 | weekend share |
 * | curator | under 120 h: 70 - 4 per title per 10 hours | hours, titles |
 * | explorer | (titles per 10 hours - 3) x 12 | titles per 10 hours, titles |
 * | loyalist | series over 40%: the top 3 series' share of all minutes x 130 - 30, so one series is 100 | top-3 share of series, No. 1 series |
 * | golden-hour-viewer | peak hour 6-9 PM: the peak hour's share of plays x 400 | golden share, peak |
 * | festival-juror | film share x 80 + 1 per film, to 40 | film share, films |
 * | casual-critic | under 60 h: 90 - hours | hours, active days |
 *
 * Every input is a function of the member's plays in their own zone (the
 * Premiere Chaser's release dates fall back to the cache for a film whose
 * row has none), so the server aggregate scores every member exactly as
 * their own Rewind does. Clock shares count counted plays by start time
 * (P2.7), the one after-dark window being "started 10 PM to 4 AM" (D8).
 *
 * @module lib/wrapped/archetypes/scorers
 */

import type { FactId } from "@/lib/wrapped/facts/catalogue"
import type { MemberStats } from "@/lib/wrapped/stats/compute"

import type { ArchetypeId } from "./catalogue"

export interface ArchetypeScore {
  /** 0-100. */
  score: number
  evidence: FactId[]
}

type Scorer = (stats: MemberStats) => ArchetypeScore

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)))
const when = (ok: boolean, id: FactId): FactId[] => (ok ? [id] : [])

const hoursOf = (stats: MemberStats) => stats.totals.totalMinutes / 60
const hoursFact = (stats: MemberStats): FactId => (stats.totals.totalMinutes >= 60 ? "time.totalHours" : "time.totalMinutes")
const perTenHours = (stats: MemberStats) => (hoursOf(stats) > 0 ? (stats.titles.distinctTitles / hoursOf(stats)) * 10 : 0)

const SCORERS: Record<ArchetypeId, Scorer> = {
  "midnight-marathoner": ({ time }) => ({
    score: clamp(time.afterDarkShare * 250),
    evidence: ["hours.afterDarkShare", ...when(time.peak !== null, "hours.peak"), ...when(time.quietest !== null, "hours.quietest")],
  }),
  "credits-roller": ({ titles }) => ({
    score: titles.completion ? clamp((titles.completion.share - 0.5) * 160) : 0,
    evidence: [...when(titles.completion !== null, "records.completionShare"), ...when(titles.filmsFinished !== null, "films.finishedShare")],
  }),
  "comfort-rewatcher": ({ titles }) => ({
    score: clamp(titles.rewatchShare * 200),
    evidence: ["records.rewatchShare", ...when(titles.rewatchedTitles > 0, "records.rewatchedTitles")],
  }),
  "premiere-chaser": ({ freshShare }) => ({
    score: freshShare === null ? 0 : clamp(freshShare * 200),
    evidence: when(freshShare !== null, "taste.freshShare"),
  }),
  "series-devourer": ({ totals, sessions }) => ({
    score: clamp(totals.seriesShare * 60 + Math.min(sessions.deepestBinge?.episodes ?? 0, 10) * 4),
    evidence: ["time.seriesShare", ...when(sessions.deepestBinge !== null, "records.deepestBinge.episodes")],
  }),
  "weekend-double-feature": ({ time }) => ({
    score: clamp((time.weekendShare * 100 - 28) * 4),
    evidence: ["days.weekendShare"],
  }),
  curator: (stats) => ({
    score: hoursOf(stats) > 0 && hoursOf(stats) < 120 ? clamp(70 - perTenHours(stats) * 4) : 0,
    evidence: [hoursFact(stats), "counts.titles"],
  }),
  explorer: (stats) => ({
    score: clamp((perTenHours(stats) - 3) * 12),
    evidence: [...when(stats.totals.totalMinutes >= 60, "counts.titlesPer10Hours"), "counts.titles"],
  }),
  loyalist: ({ totals, titles }) => ({
    score: totals.seriesShare > 0.4 && titles.top3SeriesShare !== null ? clamp(titles.top3SeriesShare * totals.seriesShare * 130 - 30) : 0,
    evidence: [...when(titles.top3SeriesShare !== null, "series.top3Share"), ...when(titles.series.length > 0, "series[1].title")],
  }),
  "golden-hour-viewer": ({ time, plays }) => {
    const peakShare = time.peak !== null && plays > 0 ? time.histogram[time.peak] / plays : 0
    const golden = time.peak !== null && time.peak >= 18 && time.peak <= 21
    return { score: golden ? clamp(peakShare * 400) : 0, evidence: ["hours.goldenShare", ...when(time.peak !== null, "hours.peak")] }
  },
  "festival-juror": ({ totals }) => ({
    score: clamp(totals.filmShare * 80 + Math.min(totals.counts.films, 40)),
    evidence: ["time.filmsShare", "counts.films"],
  }),
  "casual-critic": (stats) => ({
    score: hoursOf(stats) < 60 ? clamp(90 - hoursOf(stats)) : 0,
    evidence: [hoursFact(stats), "days.active"],
  }),
}

/**
 * Every archetype's score and evidence.
 *
 * @example
 * ```ts
 * scoreArchetypes(stats)["midnight-marathoner"] // { score: 84, evidence: ["hours.afterDarkShare", "hours.peak", "hours.quietest"] }
 * ```
 */
export function scoreArchetypes(stats: MemberStats): Record<ArchetypeId, ArchetypeScore> {
  return Object.fromEntries(Object.entries(SCORERS).map(([id, scorer]) => [id, scorer(stats)])) as Record<ArchetypeId, ArchetypeScore>
}
