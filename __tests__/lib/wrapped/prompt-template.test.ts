/**
 * Tests for lib/wrapped/prompt-template.ts - prompt template generation
 */

import {
  generateWrappedPrompt,
  getAvailablePlaceholders,
} from '@/lib/wrapped/prompt-template'
import { getActivePromptTemplate } from '@/actions/prompts'

// Mock dependencies
jest.mock('@/actions/prompts', () => ({
  getActivePromptTemplate: jest.fn(),
}))

const mockGetActivePromptTemplate = getActivePromptTemplate as jest.MockedFunction<typeof getActivePromptTemplate>

describe('Prompt Template', () => {
  const mockStatistics = {
    totalWatchTime: {
      total: 1000, // minutes
      movies: 600,
      shows: 400,
    },
    moviesWatched: 10,
    showsWatched: 5,
    episodesWatched: 50,
    topMovies: [
      {
        title: 'The Matrix',
        watchTime: 200,
        year: 1999,
      },
      {
        title: 'Inception',
        watchTime: 150,
        year: 2010,
      },
    ],
    topShows: [
      {
        title: 'Breaking Bad',
        watchTime: 300,
        episodesWatched: 20,
        year: 2008,
      },
    ],
    leaderboards: {
      watchTime: {
        userPosition: 5,
        totalUsers: 10,
      },
      topContent: {
        movies: [],
        shows: [],
      },
    },
    serverStats: {
      serverName: 'My Plex Server',
      totalStorage: 1024 * 1024 * 1024 * 100, // 100 GB
      totalStorageFormatted: '100 GB',
      librarySize: {
        movies: 500,
        shows: 100,
        episodes: 2000,
      },
    },
    overseerrStats: {
      totalRequests: 25,
      totalServerRequests: 100,
      approvedRequests: 20,
      pendingRequests: 5,
      topRequestedGenres: [
        { genre: 'Action', count: 10 },
        { genre: 'Drama', count: 8 },
      ],
    },
    watchTimeByMonth: [
      {
        month: 1,
        monthName: 'January',
        watchTime: 100,
        topMovie: {
          title: 'Movie 1',
          watchTime: 50,
        },
        topShow: {
          title: 'Show 1',
          watchTime: 50,
          episodesWatched: 5,
        },
      },
    ],
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('generateWrappedPrompt', () => {
    it('should generate prompt with custom template string', async () => {
      const customTemplate = 'Hello {{userName}}, you watched {{totalWatchTime}} in {{year}}'
      const result = await generateWrappedPrompt(
        'John Doe',
        2024,
        mockStatistics,
        customTemplate
      )

      expect(result).toContain('John Doe')
      expect(result).toContain('2024')
      expect(result).toContain('16 hours, 40 minutes') // 1000 minutes formatted
      expect(mockGetActivePromptTemplate).not.toHaveBeenCalled()
    })

    it('should use active template from database when no template string provided', async () => {
      const dbTemplate = 'Database template for {{userName}}'
      mockGetActivePromptTemplate.mockResolvedValue({
        id: '1',
        template: dbTemplate,
        isActive: true,
      } as any)

      const result = await generateWrappedPrompt(
        'John Doe',
        2024,
        mockStatistics
      )

      expect(result).toContain('Database template for John Doe')
      expect(mockGetActivePromptTemplate).toHaveBeenCalled()
    })

    it('should use default template when no active template in database', async () => {
      mockGetActivePromptTemplate.mockResolvedValue(null)

      const result = await generateWrappedPrompt(
        'John Doe',
        2024,
        mockStatistics
      )

      expect(result).toContain('John Doe')
      expect(result).toContain('2024')
      expect(result).toContain('Plex Wrapped')
    })

    it('should replace all basic placeholders', async () => {
      const template = `
        User: {{userName}}
        Year: {{year}}
        Total watch time: {{totalWatchTime}} ({{totalWatchTimeMinutes}} minutes)
        Movies watch time: {{moviesWatchTime}} ({{moviesWatchTimeMinutes}} minutes)
        Shows watch time: {{showsWatchTime}} ({{showsWatchTimeMinutes}} minutes)
        Movies watched: {{moviesWatched}}
        Shows watched: {{showsWatched}}
        Episodes watched: {{episodesWatched}}
      `

      const result = await generateWrappedPrompt(
        'Test User',
        2024,
        mockStatistics,
        template
      )

      expect(result).toContain('Test User')
      expect(result).toContain('2024')
      expect(result).toContain('16 hours, 40 minutes')
      expect(result).toContain('1000')
      expect(result).toContain('10 hours')
      expect(result).toContain('600')
      expect(result).toContain('6 hours, 40 minutes')
      expect(result).toContain('400')
      expect(result).toContain('10')
      expect(result).toContain('5')
      expect(result).toContain('50')
    })

    it('should replace top movies list placeholder', async () => {
      const template = 'Top Movies:\n{{topMoviesList}}'
      const result = await generateWrappedPrompt(
        'Test User',
        2024,
        mockStatistics,
        template
      )

      expect(result).toContain('The Matrix (1999)')
      expect(result).toContain('Inception (2010)')
      expect(result).toContain('200 minutes')
      expect(result).toContain('150 minutes')
    })

    it('should replace top shows list placeholder', async () => {
      const template = 'Top Shows:\n{{topShowsList}}'
      const result = await generateWrappedPrompt(
        'Test User',
        2024,
        mockStatistics,
        template
      )

      expect(result).toContain('Breaking Bad (2008)')
      expect(result).toContain('300 minutes')
      expect(result).toContain('20 episodes')
    })

    it('should replace top movies JSON placeholder', async () => {
      const template = 'Movies JSON: {{topMoviesJson}}'
      const result = await generateWrappedPrompt(
        'Test User',
        2024,
        mockStatistics,
        template
      )

      const jsonMatch = result.match(/Movies JSON: (\[.*\])/)
      expect(jsonMatch).toBeTruthy()
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1])
        expect(parsed).toHaveLength(2)
        expect(parsed[0].title).toBe('The Matrix')
      }
    })

    it('should replace leaderboard section placeholder', async () => {
      const template = '{{leaderboardSection}}'
      const result = await generateWrappedPrompt(
        'Test User',
        2024,
        mockStatistics,
        template
      )

      expect(result).toContain('Leaderboard Stats')
      expect(result).toContain('#5 out of 10 users')
    })

    it('should replace server stats section placeholder', async () => {
      const template = '{{serverStatsSection}}'
      const result = await generateWrappedPrompt(
        'Test User',
        2024,
        mockStatistics,
        template
      )

      expect(result).toContain('Plex Server Statistics')
      expect(result).toContain('My Plex Server')
      expect(result).toContain('100 GB')
      expect(result).toContain('500')
      expect(result).toContain('100')
      expect(result).toContain('2,000')
    })

    it('should replace overseerr stats section placeholder', async () => {
      const template = '{{overseerrStatsSection}}'
      const result = await generateWrappedPrompt(
        'Test User',
        2024,
        mockStatistics,
        template
      )

      expect(result).toContain('Overseerr Requests')
      expect(result).toContain('25')
      expect(result).toContain('100')
      // Approved stat intentionally removed (untrusted Overseerr data)
      expect(result).not.toContain('Approved')
      expect(result).toContain('5')
      expect(result).toContain('Action')
      expect(result).toContain('Drama')
    })

    it('should replace watch time by month section placeholder', async () => {
      const template = '{{watchTimeByMonthSection}}'
      const result = await generateWrappedPrompt(
        'Test User',
        2024,
        mockStatistics,
        template
      )

      expect(result).toContain('January')
      expect(result).toContain('100 minutes')
      expect(result).toContain('Movie 1')
      expect(result).toContain('Show 1')
    })

    it('should replace server name placeholder', async () => {
      const template = 'Server: {{serverName}}'
      const result = await generateWrappedPrompt(
        'Test User',
        2024,
        mockStatistics,
        template
      )

      expect(result).toContain('My Plex Server')
    })

    it('should replace calculated values', async () => {
      const template = 'Binge watcher: {{bingeWatcher}}, Discovery score: {{discoveryScore}}'
      const statsWithBinge = {
        ...mockStatistics,
        topShows: [
          {
            title: 'Breaking Bad',
            watchTime: 300,
            episodesWatched: 21, // > 20 to trigger bingeWatcher
            year: 2008,
          },
        ],
      }
      const result = await generateWrappedPrompt(
        'Test User',
        2024,
        statsWithBinge,
        template
      )

      // bingeWatcher should be true (show has > 20 episodes)
      expect(result).toContain('true')
      // discoveryScore = min(100, max(0, floor((10 + 5) / 10))) = 1
      expect(result).toContain('1')
    })

    it('should handle empty leaderboards gracefully', async () => {
      const statsWithoutLeaderboards = {
        ...mockStatistics,
        leaderboards: undefined,
      }

      const template = '{{leaderboardSection}}'
      const result = await generateWrappedPrompt(
        'Test User',
        2024,
        statsWithoutLeaderboards,
        template
      )

      expect(result).toBe('')
    })

    it('should handle empty server stats gracefully', async () => {
      const statsWithoutServer = {
        ...mockStatistics,
        serverStats: undefined,
      }

      const template = '{{serverStatsSection}}'
      const result = await generateWrappedPrompt(
        'Test User',
        2024,
        statsWithoutServer,
        template
      )

      expect(result).toBe('')
    })

    it('should handle zero watch time', async () => {
      const zeroStats = {
        ...mockStatistics,
        totalWatchTime: {
          total: 0,
          movies: 0,
          shows: 0,
        },
      }

      const template = 'Watch time: {{totalWatchTime}}'
      const result = await generateWrappedPrompt(
        'Test User',
        2024,
        zeroStats,
        template
      )

      expect(result).toContain('0 minutes')
    })

    it('should format watch time correctly for various durations', async () => {
      const testCases = [
        { minutes: 60, expected: '1 hour' },
        { minutes: 1440, expected: '1 day' },
        { minutes: 1500, expected: '1 day, 1 hour' },
        { minutes: 90, expected: '1 hour, 30 minutes' },
      ]

      for (const testCase of testCases) {
        const stats = {
          ...mockStatistics,
          totalWatchTime: {
            total: testCase.minutes,
            movies: 0,
            shows: 0,
          },
        }

        const template = '{{totalWatchTime}}'
        const result = await generateWrappedPrompt(
          'Test User',
          2024,
          stats,
          template
        )

        expect(result).toContain(testCase.expected)
      }
    })
  })

  describe('getAvailablePlaceholders', () => {
    it('should return list of available placeholders', () => {
      const placeholders = getAvailablePlaceholders()

      expect(placeholders).toBeInstanceOf(Array)
      expect(placeholders.length).toBeGreaterThan(0)
      expect(placeholders[0]).toHaveProperty('placeholder')
      expect(placeholders[0]).toHaveProperty('description')
    })

    it('should include all basic placeholders', () => {
      const placeholders = getAvailablePlaceholders()
      const placeholderStrings = placeholders.map(p => p.placeholder)

      expect(placeholderStrings).toContain('{{userName}}')
      expect(placeholderStrings).toContain('{{year}}')
      expect(placeholderStrings).toContain('{{totalWatchTime}}')
      expect(placeholderStrings).toContain('{{moviesWatched}}')
      expect(placeholderStrings).toContain('{{showsWatched}}')
    })
  })
})

