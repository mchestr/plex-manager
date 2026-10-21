/**
 * Shared test fixtures for Wrapped v2 generation tests
 */

import { assembleWrappedData } from "@/lib/wrapped/assemble-wrapped"
import type { WrappedLLMOutput } from "@/lib/wrapped/llm-output-schema"
import type { WrappedStatistics } from "@/types/wrapped"

export function buildValidOutput(): WrappedLLMOutput {
  return {
    archetype: {
      id: "midnight-marathoner",
      tagline: "The night belongs to you",
      dedication:
        "For 200 nights this year, the credits rolled long after midnight. You never blinked.",
    },
    narratives: {
      opening: "Welcome to your <highlight>2026</highlight> premiere.",
      totalWatchTime: "You watched <highlight>42 days</highlight> of content.",
      movies: "You screened <highlight>85 films</highlight> this year.",
      shows: "You followed <highlight>23 series</highlight>.",
      topMovies: "These films earned top billing.",
      topShows: "These series kept you coming back.",
      streaksAndPatterns:
        "Your longest streak ran <highlight>12 days</highlight>.",
      monthlyJourney: "From January to December, quite the arc.",
      percentile: "You ranked in the <highlight>Top 5%</highlight>.",
      serverStats: null,
      overseerr: null,
      finale: "That's a wrap on 2026.",
    },
    insights: {
      funFacts: [
        "Your busiest night was a Tuesday.",
        "You finished three full series in March.",
        "Your peak hour was 11 PM.",
      ],
    },
    summary: "42 days watched, 85 films, Top 5% of the server.",
  }
}

export function buildStatistics(
  overrides: Partial<WrappedStatistics> = {}
): WrappedStatistics {
  return {
    totalWatchTime: { total: 60480, movies: 20160, shows: 40320 },
    moviesWatched: 85,
    showsWatched: 23,
    episodesWatched: 412,
    topMovies: [
      { title: "Dune: Part Three", watchTime: 165, playCount: 1, year: 2026 },
      { title: "The Odyssey", watchTime: 150, playCount: 1, year: 2026 },
    ],
    topShows: [
      {
        title: "Severance",
        watchTime: 900,
        playCount: 18,
        episodesWatched: 18,
        year: 2022,
      },
    ],
    watchTimeByMonth: [
      { month: 1, monthName: "January", watchTime: 5040 },
      { month: 2, monthName: "February", watchTime: 4200 },
    ],
    derived: {
      longestStreak: { days: 12, start: "2026-03-01", end: "2026-03-12" },
      peakHour: { hour: 23, label: "11 PM", plays: 210 },
      hourHistogram: new Array(24).fill(0),
      dayOfWeekHistogram: [
        { day: "Sunday", watchTime: 9000 },
        { day: "Monday", watchTime: 7000 },
        { day: "Tuesday", watchTime: 8000 },
        { day: "Wednesday", watchTime: 7500 },
        { day: "Thursday", watchTime: 8500 },
        { day: "Friday", watchTime: 10000 },
        { day: "Saturday", watchTime: 10480 },
      ],
      mostActiveDay: { date: "2026-03-07", watchTime: 720 },
      weekendVsWeekday: { weekendPct: 32 },
    },
    percentile: { percentile: 5, topPercentLabel: "Top 5%" },
    ...overrides,
  }
}

/**
 * Leaderboards as generation computes them for the prompt: other members'
 * usernames, names and watch time. One username is an email, as Plex allows.
 */
export const LEADERBOARD_MEMBER_EMAIL = "jsnow@example.com"

export function buildLeaderboards(): NonNullable<WrappedStatistics["leaderboards"]> {
  return {
    topContent: {
      movies: [
        {
          title: "Dune: Part Three",
          ratingKey: "101",
          leaderboard: [
            { userId: "42", username: LEADERBOARD_MEMBER_EMAIL, friendlyName: "Jon Snow", watchTime: 412, playCount: 3 },
            { userId: "7", username: "asmith", friendlyName: "Alice Smith", watchTime: 165, playCount: 1 },
          ],
          userPosition: 2,
          totalWatchers: 2,
        },
      ],
      shows: [
        {
          title: "Severance",
          ratingKey: "202",
          leaderboard: [
            { userId: "7", username: "asmith", friendlyName: "Alice Smith", watchTime: 900, playCount: 18, episodesWatched: 18 },
          ],
          userPosition: 1,
          totalWatchers: 1,
        },
      ],
    },
    watchTime: {
      leaderboard: [
        { userId: "42", username: LEADERBOARD_MEMBER_EMAIL, friendlyName: "Jon Snow", totalWatchTime: 90000, moviesWatchTime: 30000, showsWatchTime: 60000 },
        { userId: "7", username: "asmith", friendlyName: "Alice Smith", totalWatchTime: 60480, moviesWatchTime: 20160, showsWatchTime: 40320 },
      ],
      userPosition: 2,
      totalUsers: 2,
    },
  }
}

/**
 * A stored v2 row (P7.13) as generation wrote it, with the leaderboards a
 * row from before P0.8's strip could still hold.
 */
export function buildStoredV2Json(): string {
  const data = assembleWrappedData({
    output: buildValidOutput(),
    statistics: buildStatistics({ leaderboards: buildLeaderboards() }),
    userId: "user-1",
    userName: "Mike",
    year: 2025,
  })
  return JSON.stringify({ ...data, generatedAt: "2025-12-05T12:00:00.000Z" })
}

/** A stored v1 row (P7.13): no version, no derived statistics, no archetype. */
export function buildStoredV1Json(): string {
  return JSON.stringify({
    year: 2024,
    userId: "user-1",
    userName: "Mike",
    generatedAt: "2024-12-03T09:00:00.000Z",
    statistics: {
      totalWatchTime: { total: 30240, movies: 10080, shows: 20160 },
      moviesWatched: 41,
      showsWatched: 12,
      episodesWatched: 233,
      topMovies: [
        { title: "Arrival", watchTime: 116, playCount: 1, year: 2016, ratingKey: 501 },
        { title: "Heat", watchTime: 170, playCount: 1, year: 1995 },
      ],
      topShows: [{ title: "The Bear", watchTime: 600, playCount: 20, episodesWatched: 20, ratingKey: "602" }],
      leaderboards: buildLeaderboards(),
    },
    sections: [
      { id: "hero", type: "hero", title: "Your 2024 Wrapped", content: "Your <highlight>2024</highlight> Wrapped is here." },
      { id: "top-movies", type: "top-movies", title: "Top films", content: "Arrival led the way.", data: { movies: [] } },
      { id: "fun-facts", type: "fun-facts", title: "Fun facts", content: "", data: { facts: ["You watched Heat twice in one week."] } },
      { id: "finale", type: "finale", title: "That's a wrap", content: "See you next year." },
    ],
    insights: { personality: "Night owl", topGenre: "Drama", bingeWatcher: true, discoveryScore: 60, funFacts: [] },
    metadata: { totalSections: 4, generationTime: 12 },
  })
}
