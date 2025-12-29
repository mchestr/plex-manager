/**
 * Factory for creating test wrapped data
 */

// Import types from the types directory
// Note: Using relative path since e2e tests don't use the @/ alias
import type { WrappedData, WrappedStatistics, WrappedSection } from '../../../types/wrapped'

let wrappedCounter = 0

export const resetWrappedFactory = () => {
  wrappedCounter = 0
}

/**
 * Create wrapped statistics with optional overrides
 */
export function createWrappedStatistics(
  overrides: Partial<WrappedStatistics> = {}
): WrappedStatistics {
  return {
    totalWatchTime: {
      total: 1500,
      movies: 800,
      shows: 700,
    },
    moviesWatched: 25,
    showsWatched: 10,
    episodesWatched: 120,
    topMovies: [
      { title: 'Test Movie 1', watchTime: 150, playCount: 2, year: 2024, rating: 8.5 },
      { title: 'Test Movie 2', watchTime: 120, playCount: 1, year: 2023, rating: 7.8 },
      { title: 'Test Movie 3', watchTime: 100, playCount: 1, year: 2024, rating: 8.0 },
    ],
    topShows: [
      { title: 'Test Show 1', watchTime: 300, playCount: 15, episodesWatched: 15, year: 2024, rating: 9.0 },
      { title: 'Test Show 2', watchTime: 200, playCount: 10, episodesWatched: 10, year: 2023, rating: 8.5 },
    ],
    ...overrides,
  }
}

/**
 * Create wrapped sections with optional overrides
 */
export function createWrappedSections(year: number): WrappedSection[] {
  return [
    {
      id: 'hero',
      type: 'hero',
      title: `Your ${year} Wrapped`,
      content: `Welcome to your ${year} Wrapped! Let's see what you watched this year.`,
      data: {
        prominentStat: {
          value: '1,500',
          label: 'Minutes Watched',
          description: 'You spent 25 hours watching content this year!',
        },
      },
    },
    {
      id: 'total-watch-time',
      type: 'total-watch-time',
      title: 'Total Watch Time',
      content: 'You watched an impressive amount of content this year.',
    },
    {
      id: 'top-movies',
      type: 'top-movies',
      title: 'Your Top Movies',
      content: 'These were your most-watched movies of the year.',
      data: {
        movies: [
          { title: 'Test Movie 1', watchTime: 150, playCount: 2 },
          { title: 'Test Movie 2', watchTime: 120, playCount: 1 },
        ],
      },
    },
    {
      id: 'top-shows',
      type: 'top-shows',
      title: 'Your Top Shows',
      content: 'These series kept you binge-watching.',
      data: {
        shows: [
          { title: 'Test Show 1', watchTime: 300, playCount: 15, episodesWatched: 15 },
          { title: 'Test Show 2', watchTime: 200, playCount: 10, episodesWatched: 10 },
        ],
      },
    },
    {
      id: 'fun-facts',
      type: 'fun-facts',
      title: 'Fun Facts',
      content: 'Here are some interesting facts about your watching habits.',
      data: {
        facts: [
          'You watched more content on weekends than weekdays.',
          'Your favorite genre was Action.',
        ],
      },
    },
  ]
}

/**
 * Create complete wrapped data with optional overrides
 */
export function createWrappedData(overrides: Partial<WrappedData> = {}): WrappedData {
  const year = overrides.year ?? new Date().getFullYear()
  return {
    year,
    userId: 'regular-user-id',
    userName: 'Regular User',
    generatedAt: new Date().toISOString(),
    statistics: createWrappedStatistics(),
    sections: createWrappedSections(year),
    insights: {
      personality: 'Movie Enthusiast',
      topGenre: 'Action',
      bingeWatcher: true,
      discoveryScore: 75,
      funFacts: [
        'You watched more on weekends',
        'Your favorite day to watch was Saturday',
      ],
    },
    metadata: {
      totalSections: 5,
      generationTime: 12,
    },
    ...overrides,
  }
}

/**
 * Create a wrapped database record (as stored in PlexWrapped table)
 */
export function createWrappedRecord(
  overrides: Partial<{
    id: string
    userId: string
    year: number
    status: string
    shareToken: string | null
    summary: string | null
    data: WrappedData
    generatedAt: Date
    error: string | null
  }> = {}
) {
  wrappedCounter++
  const id = `wrapped-${Date.now()}-${wrappedCounter}`
  const year = overrides.year ?? new Date().getFullYear()
  const userId = overrides.userId ?? 'regular-user-id'

  return {
    id,
    userId,
    year,
    status: 'completed',
    shareToken: null,
    summary: null,
    data: createWrappedData({ year, userId }),
    generatedAt: new Date(),
    error: null,
    ...overrides,
  }
}

/**
 * Create a shareable wrapped record
 */
export function createSharedWrappedRecord(
  shareToken: string,
  overrides: Partial<Parameters<typeof createWrappedRecord>[0]> = {}
) {
  return createWrappedRecord({
    shareToken,
    ...overrides,
  })
}
