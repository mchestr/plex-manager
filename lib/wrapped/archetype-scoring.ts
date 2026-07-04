/**
 * Deterministic archetype scoring (Wrapped v2).
 *
 * ## Overview
 *
 * The archetype pick used to be left entirely to the LLM, which converged on
 * the same archetype ("series-devourer") for almost every user. This module
 * scores every curated archetype against the user's real statistics and
 * produces a ranked shortlist. The prompt then presents only the shortlist
 * (best fit first, with the evidence that earned it), so the LLM's creative
 * latitude is bounded by the data.
 *
 * ## Scoring
 *
 * Each scorer maps one archetype motif onto measurable signals and returns
 * 0–100 plus a human-readable evidence line:
 *
 * - midnight-marathoner — share of watch time between 10 PM and 3 AM
 * - series-devourer     — show-heavy watch time AND a deeply binged show
 * - weekend-double-feature — weekend share of watch time
 * - golden-hour-viewer  — concentration of plays in a 6–9 PM peak hour
 * - festival-juror      — movie-heavy watch time with real breadth
 * - comfort-rewatcher   — repeat plays of the same films
 * - loyalist            — top 3 shows dominating show watch time
 * - explorer            — many distinct titles for the hours watched
 * - curator / casual-critic — modest, deliberate viewing volume
 *
 * Archetypes with no measurable signal (credits-roller, premiere-chaser —
 * completion and release-date data are not collected) score 0 and only
 * surface if nothing else does.
 */

import { ARCHETYPES, type ArchetypeId } from "@/lib/wrapped/llm-output-schema"
import type { WrappedStatistics } from "@/types/wrapped"

export interface ArchetypeScore {
  id: ArchetypeId
  name: string
  motif: string
  /** 0-100, higher = better supported by the data */
  score: number
  /** Human-readable justification, shown to the LLM as selection evidence */
  evidence: string
}

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

export function rankArchetypes(statistics: WrappedStatistics): ArchetypeScore[] {
  const totalMinutes = statistics.totalWatchTime.total
  const totalHours = totalMinutes / 60
  const showShare = totalMinutes > 0 ? statistics.totalWatchTime.shows / totalMinutes : 0
  const movieShare = totalMinutes > 0 ? statistics.totalWatchTime.movies / totalMinutes : 0
  const derived = statistics.derived

  const hourHistogram = derived?.hourHistogram ?? []
  const histogramTotal = hourHistogram.reduce((sum, m) => sum + m, 0)
  const lateNightMinutes = [22, 23, 0, 1, 2, 3].reduce(
    (sum, h) => sum + (hourHistogram[h] ?? 0),
    0
  )
  const lateNightShare = histogramTotal > 0 ? lateNightMinutes / histogramTotal : 0

  const weekendPct = derived?.weekendVsWeekday.weekendPct ?? 0
  const peakHour = derived?.peakHour ?? null
  const peakHourShare =
    peakHour && histogramTotal > 0 ? (hourHistogram[peakHour.hour] ?? 0) / histogramTotal : 0

  const maxShowEpisodes = statistics.topShows.reduce(
    (max, show) => Math.max(max, show.episodesWatched),
    0
  )
  const showMinutes = statistics.totalWatchTime.shows
  const top3ShowMinutes = statistics.topShows
    .slice(0, 3)
    .reduce((sum, show) => sum + show.watchTime, 0)
  const loyaltyShare = showMinutes > 0 ? Math.min(1, top3ShowMinutes / showMinutes) : 0

  const rewatchedMovies = statistics.topMovies.filter((m) => m.playCount > 1).length

  const distinctTitles = statistics.moviesWatched + statistics.showsWatched
  const titlesPerTenHours = totalHours > 0 ? (distinctTitles / totalHours) * 10 : 0

  const scores: Record<ArchetypeId, { score: number; evidence: string }> = {
    "midnight-marathoner": {
      score: clamp(lateNightShare * 250),
      evidence: `${Math.round(lateNightShare * 100)}% of watch time between 10 PM and 3 AM`,
    },
    "credits-roller": {
      score: 0,
      evidence: "no completion data collected",
    },
    "comfort-rewatcher": {
      score: clamp(rewatchedMovies * 25),
      evidence: `${rewatchedMovies} of the top films watched more than once`,
    },
    "premiere-chaser": {
      score: 0,
      evidence: "no release-date data collected",
    },
    "series-devourer": {
      score: clamp(showShare * 60 + Math.min(maxShowEpisodes, 60)),
      evidence: `${Math.round(showShare * 100)}% of watch time on series, deepest show at ${maxShowEpisodes} episodes`,
    },
    "weekend-double-feature": {
      score: clamp((weekendPct - 28) * 4),
      evidence: `${weekendPct}% of watch time on weekends`,
    },
    "curator": {
      score: clamp(totalHours > 0 && totalHours < 120 ? 70 - titlesPerTenHours * 4 : 0),
      evidence: `${Math.round(totalHours)} deliberate hours across ${distinctTitles} titles`,
    },
    "explorer": {
      score: clamp((titlesPerTenHours - 3) * 12),
      evidence: `${distinctTitles} distinct titles in ${Math.round(totalHours)} hours`,
    },
    "loyalist": {
      score: clamp(showShare > 0.4 ? loyaltyShare * 110 - 30 : 0),
      evidence: `top 3 shows account for ${Math.round(loyaltyShare * 100)}% of series watch time`,
    },
    "golden-hour-viewer": {
      score: clamp(
        peakHour && peakHour.hour >= 18 && peakHour.hour <= 21 ? peakHourShare * 400 : 0
      ),
      evidence: peakHour
        ? `peak hour ${peakHour.label} holds ${Math.round(peakHourShare * 100)}% of watch time`
        : "no peak hour data",
    },
    "festival-juror": {
      score: clamp(movieShare * 80 + Math.min(statistics.moviesWatched, 40)),
      evidence: `${Math.round(movieShare * 100)}% of watch time on films across ${statistics.moviesWatched} movies`,
    },
    "casual-critic": {
      score: clamp(totalHours < 60 ? 90 - totalHours : 0),
      evidence: `${Math.round(totalHours)} selective hours this year`,
    },
  }

  return ARCHETYPES.map((archetype) => ({
    id: archetype.id,
    name: archetype.name,
    motif: archetype.motif,
    ...scores[archetype.id],
  })).sort((a, b) => b.score - a.score)
}

/**
 * The shortlist offered to the LLM: the top-scoring archetypes, best fit
 * first. Always at least three entries so the LLM retains some latitude.
 */
export function suggestArchetypes(
  statistics: WrappedStatistics,
  count = 3
): ArchetypeScore[] {
  return rankArchetypes(statistics).slice(0, count)
}
