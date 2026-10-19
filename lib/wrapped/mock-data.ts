/**
 * Mock data generation for when LLM is disabled
 * This allows development/testing without making API calls
 *
 * Builds a mock `WrappedLLMOutput` and runs it through the real
 * `assembleWrappedData`, so mock wrappeds exercise the exact v2 data shape
 * and section order the viewer renders in production.
 */

import { formatDuration } from "@/lib/utils/format"
import { assembleWrappedData } from "@/lib/wrapped/assemble-wrapped"
import { WrappedLLMOutput } from "@/lib/wrapped/llm-output-schema"
import { WrappedData, WrappedStatistics } from "@/types/wrapped"

/**
 * Generate mock wrapped data when LLM is disabled.
 * `promptName` goes into the copy (as the prompt name does for the LLM), and
 * `displayName` is stored as the Rewind's name.
 */
export function generateMockWrappedData(args: {
  promptName: string
  displayName: string
  year: number
  userId: string
  statistics: WrappedStatistics
}): WrappedData {
  const { promptName, displayName, year, userId, statistics } = args
  const totalWatchTime = formatDuration(statistics.totalWatchTime.total, "long", { largestUnit: "day" })
  const topMovie = statistics.topMovies[0]
  const topShow = statistics.topShows[0]
  const streak = statistics.derived?.longestStreak
  const peakHour = statistics.derived?.peakHour

  const output: WrappedLLMOutput = {
    archetype: {
      id:
        statistics.totalWatchTime.shows > statistics.totalWatchTime.movies
          ? "series-devourer"
          : "festival-juror",
      tagline: "A year of dedicated viewing",
      dedication: `Hey ${promptName}: a year of showing up, night after night, earns you a place in the spotlight. The screen never went dark for long.`,
    },
    narratives: {
      opening: `Welcome to your <highlight>${year}</highlight> premiere. Tonight, we look back at your year in film and television.`,
      totalWatchTime: `You spent <highlight>${totalWatchTime}</highlight> watching content this year. A truly committed performance.`,
      movies: `You screened <highlight>${statistics.moviesWatched} films</highlight>, totaling <highlight>${formatDuration(statistics.totalWatchTime.movies, "long", { largestUnit: "day" })}</highlight>.`,
      shows: `You followed <highlight>${statistics.showsWatched} series</highlight> across <highlight>${statistics.episodesWatched} episodes</highlight>.`,
      topMovies: topMovie
        ? `Leading the bill: <highlight>${topMovie.title}</highlight>, with ${formatDuration(topMovie.watchTime, "long", { largestUnit: "day" })} on screen.`
        : "Your top films earned their place on the marquee.",
      topShows: topShow
        ? `Headlining your series: <highlight>${topShow.title}</highlight> — ${topShow.episodesWatched} episodes deep.`
        : "Your top series kept you coming back.",
      streaksAndPatterns: streak
        ? `Your longest streak ran <highlight>${streak.days} days</highlight>${peakHour ? `, and your favorite showtime was <highlight>${peakHour.label}</highlight>` : ""}.`
        : "Your viewing patterns tell their own story.",
      monthlyJourney: "From January to December, every month had its feature presentation.",
      percentile: statistics.percentile
        ? `You placed in the <highlight>${statistics.percentile.topPercentLabel}</highlight> of viewers on this server.`
        : null,
      serverStats: statistics.serverStats
        ? `Behind the scenes, ${statistics.serverStats.serverName} carried <highlight>${statistics.serverStats.totalStorageFormatted}</highlight> of stories.`
        : null,
      overseerr: statistics.overseerrStats
        ? `You made <highlight>${statistics.overseerrStats.totalRequests} requests</highlight> this year — the programming department thanks you.`
        : null,
      finale: `That's a wrap on <highlight>${year}</highlight>. Thank you for a remarkable year at the movies — see you at next year's premiere.`,
    },
    insights: {
      funFacts: [
        `You watched ${statistics.moviesWatched} movies and ${statistics.showsWatched} shows`,
        `Your total watch time was ${totalWatchTime}`,
        topMovie
          ? `Your most watched movie was ${topMovie.title}`
          : "You explored many different movies",
        `You watched ${statistics.episodesWatched} episodes total`,
      ],
    },
    summary: `In ${year}, I watched ${totalWatchTime} of content! ${topMovie ? `My top movie was ${topMovie.title}` : "I explored many amazing films"} and I binged ${statistics.showsWatched} shows with ${statistics.episodesWatched} episodes. What a year!`,
  }

  return assembleWrappedData({ output, statistics, userId, userName: displayName, year })
}
