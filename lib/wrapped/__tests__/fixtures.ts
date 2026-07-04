/**
 * Shared test fixtures for Wrapped v2 generation tests
 */

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
      personality: "A dedicated night-owl cinephile",
      topGenre: "Science Fiction",
      bingeWatcher: true,
      discoveryScore: 72,
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
