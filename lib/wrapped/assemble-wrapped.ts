/**
 * Deterministic assembly of Wrapped v2 data.
 *
 * ## Overview
 *
 * Merges the LLM's validated creative output with code-computed statistics
 * into the final `WrappedData`. The section list, ordering, titles, and data
 * payloads are all owned here — the LLM contributes only narrative text and
 * the archetype pick. Pacing (`animationDelay`) is never set; the viewer
 * derives it from section type.
 *
 * ## Section order
 *
 * hero → total-watch-time → movies-breakdown → shows-breakdown → top-movies
 * → top-shows → streaks-patterns → monthly-journey → percentile* →
 * archetype-reveal → server-stats* → overseerr-stats* → fun-facts → finale
 * (* = omitted when the underlying data or narrative is missing)
 *
 * ## Stored statistics
 *
 * The statistics the caller passes may carry `leaderboards`: every member's
 * name and watch time, which only the prompt uses. The returned data keeps an
 * explicit allow-list of statistics keys instead, so no roster is stored or
 * shown (RWP-01). `percentile` stays.
 */

import {
  getArchetype,
  WrappedLLMOutput,
} from "@/lib/wrapped/llm-output-schema"
import {
  WrappedData,
  WrappedSection,
  WrappedStatistics,
} from "@/types/wrapped"

export const WRAPPED_DATA_VERSION = 2

/**
 * Guard the archetype-reveal slide against weak LLM copy: the dedication is
 * the emotional peak, so when the model returns something too short (or just
 * echoes the tagline), fall back to deterministic copy built from the
 * archetype motif and the user's real numbers.
 */
function resolveDedication(args: {
  dedication: string
  tagline: string
  motif: string
  statistics: WrappedStatistics
  year: number
}): string {
  const dedication = args.dedication.trim()
  const tagline = args.tagline.trim()
  const isWeak =
    dedication.length < 40 ||
    dedication.toLowerCase() === tagline.toLowerCase()

  if (!isWeak) return dedication

  const hours = Math.floor(args.statistics.totalWatchTime.total / 60)
  return (
    `${args.motif}. In ${args.year} you gave <highlight>${hours} hours</highlight> to the screen — ` +
    `<highlight>${args.statistics.moviesWatched} films</highlight> and ` +
    `<highlight>${args.statistics.episodesWatched} episodes</highlight>. A performance worthy of the title.`
  )
}

/**
 * Every `WrappedStatistics` key except `leaderboards`, each one required.
 * A key added to `WrappedStatistics` fails to compile in
 * `toStoredStatistics` until someone lists it there or excludes it here.
 */
type StoredStatistics = {
  [K in Exclude<keyof WrappedStatistics, "leaderboards">]-?: WrappedStatistics[K]
}

/**
 * The statistics a stored Rewind keeps: every key except `leaderboards`,
 * listed explicitly so no new key is stored without a decision.
 */
function toStoredStatistics(statistics: WrappedStatistics): StoredStatistics {
  return {
    totalWatchTime: statistics.totalWatchTime,
    moviesWatched: statistics.moviesWatched,
    showsWatched: statistics.showsWatched,
    episodesWatched: statistics.episodesWatched,
    topMovies: statistics.topMovies,
    topShows: statistics.topShows,
    serverStats: statistics.serverStats,
    overseerrStats: statistics.overseerrStats,
    watchTimeByMonth: statistics.watchTimeByMonth,
    derived: statistics.derived,
    percentile: statistics.percentile,
    longestBinge: statistics.longestBinge,
    mostActiveDay: statistics.mostActiveDay,
  }
}

export function assembleWrappedData(args: {
  output: WrappedLLMOutput
  statistics: WrappedStatistics
  userId: string
  userName: string
  year: number
}): WrappedData {
  const { output, statistics, userId, userName, year } = args
  const archetypeInfo = getArchetype(output.archetype.id)
  const dedication = resolveDedication({
    dedication: output.archetype.dedication,
    tagline: output.archetype.tagline,
    motif: archetypeInfo.motif,
    statistics,
    year,
  })

  const sections: WrappedSection[] = [
    {
      id: "hero",
      type: "hero",
      title: `Your ${year} Wrapped`,
      subtitle: "Now Presenting",
      content: output.narratives.opening,
      data: {
        prominentStat: {
          value: Math.floor(statistics.totalWatchTime.total / 60),
          label: "hours watched",
          description: `Your year in film and television, ${year}`,
        },
      },
    },
    {
      id: "total-watch-time",
      type: "total-watch-time",
      title: "Total Watch Time",
      content: output.narratives.totalWatchTime,
      data: { totalWatchTime: statistics.totalWatchTime },
    },
    {
      id: "movies-breakdown",
      type: "movies-breakdown",
      title: "The Features",
      content: output.narratives.movies,
      data: {
        moviesWatched: statistics.moviesWatched,
        watchTime: statistics.totalWatchTime.movies,
      },
    },
    {
      id: "shows-breakdown",
      type: "shows-breakdown",
      title: "The Series",
      content: output.narratives.shows,
      data: {
        showsWatched: statistics.showsWatched,
        episodesWatched: statistics.episodesWatched,
        watchTime: statistics.totalWatchTime.shows,
      },
    },
  ]

  if (statistics.topMovies.length > 0) {
    sections.push({
      id: "top-movies",
      type: "top-movies",
      title: "Top Billing — Films",
      content: output.narratives.topMovies,
      data: { movies: statistics.topMovies },
    })
  }

  if (statistics.topShows.length > 0) {
    sections.push({
      id: "top-shows",
      type: "top-shows",
      title: "Top Billing — Series",
      content: output.narratives.topShows,
      data: { shows: statistics.topShows },
    })
  }

  if (statistics.derived) {
    sections.push({
      id: "streaks-patterns",
      type: "streaks-patterns",
      title: "Your Viewing Patterns",
      content: output.narratives.streaksAndPatterns,
      data: { derived: statistics.derived },
    })
  }

  if (statistics.watchTimeByMonth && statistics.watchTimeByMonth.length > 0) {
    sections.push({
      id: "monthly-journey",
      type: "monthly-journey",
      title: "A Year in Reels",
      content: output.narratives.monthlyJourney,
      data: { watchTimeByMonth: statistics.watchTimeByMonth },
    })
  }

  if (statistics.percentile && output.narratives.percentile) {
    sections.push({
      id: "percentile",
      type: "percentile",
      title: "Among the Audience",
      content: output.narratives.percentile,
      data: {
        percentile: statistics.percentile,
        serverName: statistics.serverStats?.serverName,
      },
    })
  }

  sections.push({
    id: "archetype-reveal",
    type: "archetype-reveal",
    title: "And the Award Goes To…",
    subtitle: output.archetype.tagline,
    content: dedication,
    data: { archetype: { ...archetypeInfo } },
  })

  if (statistics.serverStats && output.narratives.serverStats) {
    sections.push({
      id: "server-stats",
      type: "server-stats",
      title: "Behind the Scenes",
      content: output.narratives.serverStats,
      data: { serverStats: statistics.serverStats },
    })
  }

  if (statistics.overseerrStats && output.narratives.overseerr) {
    sections.push({
      id: "overseerr-stats",
      type: "overseerr-stats",
      title: "Your Requests",
      content: output.narratives.overseerr,
      data: { overseerrStats: statistics.overseerrStats },
    })
  }

  sections.push(
    {
      id: "fun-facts",
      type: "fun-facts",
      title: "Deleted Scenes",
      content: "",
      data: { facts: output.insights.funFacts },
    },
    {
      id: "finale",
      type: "finale",
      title: "Closing Credits",
      content: output.narratives.finale,
      data: {
        topMovies: statistics.topMovies.slice(0, 5),
        topShows: statistics.topShows.slice(0, 5),
      },
    }
  )

  return {
    version: WRAPPED_DATA_VERSION,
    year,
    userId,
    userName,
    generatedAt: new Date().toISOString(),
    archetype: {
      id: archetypeInfo.id,
      name: archetypeInfo.name,
      tagline: output.archetype.tagline,
      dedication,
    },
    statistics: toStoredStatistics(statistics),
    sections,
    insights: output.insights,
    summary: output.summary,
    metadata: {
      totalSections: sections.length,
      generationTime: 0, // set by the caller once generation completes
    },
  }
}
