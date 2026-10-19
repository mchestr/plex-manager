/**
 * Tests for the Wrapped statistics fetchers (Tautulli and server statistics)
 * Focuses on key functions and edge cases
 */

import { fetchPlexServerStatistics } from '@/lib/wrapped/server-statistics'
import {
  fetchTautulliStatistics,
  fetchTopContentLeaderboards,
  fetchWatchTimeLeaderboard,
} from '@/lib/wrapped/tautulli-statistics'
import { formatBytes } from '@/lib/utils/time-formatting'

// Mock fetch globally
global.fetch = jest.fn()

const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>

describe('Statistics Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset fetch mock to default implementation
    mockFetch.mockReset()
  })

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes')
      expect(formatBytes(1024)).toBe('1 KB')
      expect(formatBytes(1024 * 1024)).toBe('1 MB')
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB')
      expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1 TB')
    })

    it('should handle large values', () => {
      expect(formatBytes(1024 * 1024 * 1024 * 100)).toContain('GB')
    })

    it('should round to 2 decimal places', () => {
      const result = formatBytes(1536) // 1.5 KB
      expect(result).toContain('1.5')
    })
  })

  describe('fetchTautulliStatistics', () => {
    const config = {
      url: 'https://tautulli.example.com:8181',
      apiKey: 'test-key',
    }

    const mockUsersResponse = {
      response: {
        result: 'success',
        data: [
          {
            user_id: 123,
            username: 'testuser',
            email: 'test@example.com',
            friendly_name: 'Test User',
          },
        ],
      },
    }

    it('should fetch statistics successfully', async () => {
      const mockHistoryResponse = {
        response: {
          result: 'success',
          data: {
            recordsTotal: 1,
            data: [
              {
                date: Math.floor(new Date('2024-06-15').getTime() / 1000),
                media_type: 'movie',
                title: 'Test Movie',
                duration: 3600, // 60 minutes in seconds
                viewed_duration: 3600,
                year: 2020,
              },
            ],
          },
        },
      }

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUsersResponse,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockHistoryResponse,
        } as Response)

      const result = await fetchTautulliStatistics(
        config,
        { plexUserId: '123' },
        2024
      )

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.totalWatchTime).toBe(60) // minutes
      expect(result.data?.moviesWatched).toBe(1)
    })

    it('should return error when user not found', async () => {
      const mockUsersResponseNoMatch = {
        response: {
          result: 'success',
          data: [
            {
              user_id: 999,
              username: 'otheruser',
              email: 'other@example.com',
            },
          ],
        },
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockUsersResponseNoMatch,
      } as Response)

      const result = await fetchTautulliStatistics(
        config,
        { plexUserId: '123' },
        2024
      )

      expect(result.success).toBe(false)
      expect(result.code).toBe('TAUTULLI_USER_NOT_FOUND')
      expect(JSON.stringify(result)).not.toContain('otheruser')
      expect(JSON.stringify(result)).not.toContain('other@example.com')
    })

    it('should handle API errors', async () => {
      const errorResponse = {
        response: {
          result: 'error',
          message: 'Invalid API key',
        },
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => errorResponse,
      } as Response)

      const result = await fetchTautulliStatistics(
        config,
        { plexUserId: '123' },
        2024
      )

      expect(result.success).toBe(false)
      expect(result.code).toBeUndefined()
      expect(result.error).toBe('Failed to fetch users from Tautulli')
    })

    it('should filter history by date range', async () => {
      const currentYear = new Date().getFullYear()
      const year = currentYear - 1 // Past year

      const mockHistoryResponse = {
        response: {
          result: 'success',
          data: {
            recordsTotal: 2,
            data: [
              {
                date: Math.floor(new Date(`${year}-06-15`).getTime() / 1000),
                media_type: 'movie',
                title: 'Movie 1',
                duration: 3600,
                viewed_duration: 3600,
              },
              {
                date: Math.floor(new Date(`${year - 1}-06-15`).getTime() / 1000), // Previous year
                media_type: 'movie',
                title: 'Movie 2',
                duration: 3600,
                viewed_duration: 3600,
              },
            ],
          },
        },
      }

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUsersResponse,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockHistoryResponse,
        } as Response)

      const result = await fetchTautulliStatistics(
        config,
        { plexUserId: '123' },
        year
      )

      expect(result.success).toBe(true)
      expect(result.data?.moviesWatched).toBe(1) // Only one movie from the correct year
    })

    it('should handle episodes correctly', async () => {
      const mockHistoryResponse = {
        response: {
          result: 'success',
          data: {
            recordsTotal: 1,
            data: [
              {
                date: Math.floor(new Date('2024-06-15').getTime() / 1000),
                media_type: 'episode',
                grandparent_title: 'Test Show',
                title: 'Episode 1',
                duration: 1800, // 30 minutes
                viewed_duration: 1800,
                year: 2020,
              },
            ],
          },
        },
      }

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUsersResponse,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockHistoryResponse,
        } as Response)

      const result = await fetchTautulliStatistics(
        config,
        { plexUserId: '123' },
        2024
      )

      expect(result.success).toBe(true)
      expect(result.data?.showsWatched).toBe(1)
      expect(result.data?.episodesWatched).toBe(1)
      expect(result.data?.showsWatchTime).toBe(30)
    })

    describe('Watch Time Aggregation', () => {
      const config = {
        url: 'https://tautulli.example.com:8181',
        apiKey: 'test-key',
      }

      const mockUsersResponse = {
        response: {
          result: 'success',
          data: [
            {
              user_id: 123,
              username: 'testuser',
              email: 'test@example.com',
              friendly_name: 'Test User',
            },
          ],
        },
      }

      it('should aggregate watch time for empty history', async () => {
        const mockHistoryResponse = {
          response: {
            result: 'success',
            data: {
              recordsTotal: 0,
              data: [],
            },
          },
        }

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockUsersResponse,
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockHistoryResponse,
          } as Response)

        const result = await fetchTautulliStatistics(
          config,
          { plexUserId: '123' },
          2024
        )

        expect(result.success).toBe(true)
        expect(result.data?.totalWatchTime).toBe(0)
        expect(result.data?.moviesWatchTime).toBe(0)
        expect(result.data?.showsWatchTime).toBe(0)
        expect(result.data?.moviesWatched).toBe(0)
        expect(result.data?.showsWatched).toBe(0)
        expect(result.data?.episodesWatched).toBe(0)
        expect(result.data?.topMovies).toEqual([])
        expect(result.data?.topShows).toEqual([])
        expect(result.data?.watchTimeByMonth).toEqual([])
      })

      it('should aggregate watch time for single movie', async () => {
        const mockHistoryResponse = {
          response: {
            result: 'success',
            data: {
              recordsTotal: 1,
              data: [
                {
                  date: Math.floor(new Date('2024-06-15T14:30:00Z').getTime() / 1000),
                  media_type: 'movie',
                  title: 'Test Movie',
                  duration: 7200, // 120 minutes in seconds
                  viewed_duration: 7200,
                  year: 2020,
                  rating: 8.5,
                  rating_key: '12345',
                },
              ],
            },
          },
        }

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockUsersResponse,
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockHistoryResponse,
          } as Response)

        const result = await fetchTautulliStatistics(
          config,
          { plexUserId: '123' },
          2024
        )

        expect(result.success).toBe(true)
        expect(result.data?.totalWatchTime).toBe(120)
        expect(result.data?.moviesWatchTime).toBe(120)
        expect(result.data?.showsWatchTime).toBe(0)
        expect(result.data?.moviesWatched).toBe(1)
        expect(result.data?.topMovies).toHaveLength(1)
        expect(result.data?.topMovies[0]).toMatchObject({
          title: 'Test Movie',
          watchTime: 120,
          playCount: 1,
          year: 2020,
          rating: 8.5,
          ratingKey: '12345',
        })
      })

      it('should aggregate watch time for single episode', async () => {
        const mockHistoryResponse = {
          response: {
            result: 'success',
            data: {
              recordsTotal: 1,
              data: [
                {
                  date: Math.floor(new Date('2024-06-15T14:30:00Z').getTime() / 1000),
                  media_type: 'episode',
                  grandparent_title: 'Test Show',
                  title: 'Episode 1',
                  duration: 2400, // 40 minutes in seconds
                  viewed_duration: 2400,
                  year: 2020,
                  rating: 9.0,
                  grandparent_rating_key: '67890',
                },
              ],
            },
          },
        }

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockUsersResponse,
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockHistoryResponse,
          } as Response)

        const result = await fetchTautulliStatistics(
          config,
          { plexUserId: '123' },
          2024
        )

        expect(result.success).toBe(true)
        expect(result.data?.totalWatchTime).toBe(40)
        expect(result.data?.moviesWatchTime).toBe(0)
        expect(result.data?.showsWatchTime).toBe(40)
        expect(result.data?.showsWatched).toBe(1)
        expect(result.data?.episodesWatched).toBe(1)
        expect(result.data?.topShows).toHaveLength(1)
        expect(result.data?.topShows[0]).toMatchObject({
          title: 'Test Show',
          watchTime: 40,
          playCount: 1,
          episodesWatched: 1,
          year: 2020,
          rating: 9.0,
          ratingKey: '67890',
        })
      })

      it('should aggregate watch time for mixed movies and shows', async () => {
        const mockHistoryResponse = {
          response: {
            result: 'success',
            data: {
              recordsTotal: 4,
              data: [
                {
                  date: Math.floor(new Date('2024-06-15T14:30:00Z').getTime() / 1000),
                  media_type: 'movie',
                  title: 'Movie A',
                  duration: 7200, // 120 minutes
                  viewed_duration: 7200,
                  year: 2020,
                },
                {
                  date: Math.floor(new Date('2024-06-16T14:30:00Z').getTime() / 1000),
                  media_type: 'episode',
                  grandparent_title: 'Show A',
                  title: 'Episode 1',
                  duration: 1800, // 30 minutes
                  viewed_duration: 1800,
                  year: 2021,
                },
                {
                  date: Math.floor(new Date('2024-06-17T14:30:00Z').getTime() / 1000),
                  media_type: 'movie',
                  title: 'Movie B',
                  duration: 5400, // 90 minutes
                  viewed_duration: 5400,
                  year: 2022,
                },
                {
                  date: Math.floor(new Date('2024-06-18T14:30:00Z').getTime() / 1000),
                  media_type: 'episode',
                  grandparent_title: 'Show A',
                  title: 'Episode 2',
                  duration: 1800, // 30 minutes
                  viewed_duration: 1800,
                  year: 2021,
                },
              ],
            },
          },
        }

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockUsersResponse,
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockHistoryResponse,
          } as Response)

        const result = await fetchTautulliStatistics(
          config,
          { plexUserId: '123' },
          2024
        )

        expect(result.success).toBe(true)
        expect(result.data?.totalWatchTime).toBe(270) // 120 + 90 + 30 + 30
        expect(result.data?.moviesWatchTime).toBe(210) // 120 + 90
        expect(result.data?.showsWatchTime).toBe(60) // 30 + 30
        expect(result.data?.moviesWatched).toBe(2)
        expect(result.data?.showsWatched).toBe(1)
        expect(result.data?.episodesWatched).toBe(2)
        expect(result.data?.topMovies).toHaveLength(2)
        expect(result.data?.topShows).toHaveLength(1)
        expect(result.data?.topShows[0].episodesWatched).toBe(2)
      })

      it('should handle multiple watches of the same movie', async () => {
        const mockHistoryResponse = {
          response: {
            result: 'success',
            data: {
              recordsTotal: 3,
              data: [
                {
                  date: Math.floor(new Date('2024-06-15T14:30:00Z').getTime() / 1000),
                  media_type: 'movie',
                  title: 'Favorite Movie',
                  duration: 7200, // 120 minutes
                  viewed_duration: 7200,
                  year: 2020,
                  rating: 9.5,
                  rating_key: '12345',
                },
                {
                  date: Math.floor(new Date('2024-07-20T14:30:00Z').getTime() / 1000),
                  media_type: 'movie',
                  title: 'Favorite Movie',
                  duration: 7200,
                  viewed_duration: 7200,
                  year: 2020,
                  rating: 9.5,
                  rating_key: '12345',
                },
                {
                  date: Math.floor(new Date('2024-08-25T14:30:00Z').getTime() / 1000),
                  media_type: 'movie',
                  title: 'Favorite Movie',
                  duration: 7200,
                  viewed_duration: 7200,
                  year: 2020,
                  rating: 9.5,
                  rating_key: '12345',
                },
              ],
            },
          },
        }

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockUsersResponse,
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockHistoryResponse,
          } as Response)

        const result = await fetchTautulliStatistics(
          config,
          { plexUserId: '123' },
          2024
        )

        expect(result.success).toBe(true)
        expect(result.data?.totalWatchTime).toBe(360) // 120 * 3
        expect(result.data?.moviesWatched).toBe(1) // Only 1 unique movie
        expect(result.data?.topMovies).toHaveLength(1)
        expect(result.data?.topMovies[0]).toMatchObject({
          title: 'Favorite Movie',
          watchTime: 360,
          playCount: 3,
          year: 2020,
          rating: 9.5,
        })
      })

      it('should skip items with zero or negative watch time', async () => {
        const mockHistoryResponse = {
          response: {
            result: 'success',
            data: {
              recordsTotal: 3,
              data: [
                {
                  date: Math.floor(new Date('2024-06-15T14:30:00Z').getTime() / 1000),
                  media_type: 'movie',
                  title: 'Valid Movie',
                  duration: 7200,
                  viewed_duration: 7200,
                },
                {
                  date: Math.floor(new Date('2024-06-16T14:30:00Z').getTime() / 1000),
                  media_type: 'movie',
                  title: 'Zero Duration Movie',
                  duration: 0,
                  viewed_duration: 0,
                },
                {
                  date: Math.floor(new Date('2024-06-17T14:30:00Z').getTime() / 1000),
                  media_type: 'movie',
                  title: 'No Duration Movie',
                  // No duration field
                },
              ],
            },
          },
        }

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockUsersResponse,
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockHistoryResponse,
          } as Response)

        const result = await fetchTautulliStatistics(
          config,
          { plexUserId: '123' },
          2024
        )

        expect(result.success).toBe(true)
        expect(result.data?.totalWatchTime).toBe(120) // Only valid movie
        expect(result.data?.moviesWatched).toBe(1)
        expect(result.data?.topMovies).toHaveLength(1)
        expect(result.data?.topMovies[0].title).toBe('Valid Movie')
      })

      it('should sort top movies by watch time descending', async () => {
        const mockHistoryResponse = {
          response: {
            result: 'success',
            data: {
              recordsTotal: 3,
              data: [
                {
                  date: Math.floor(new Date('2024-06-15T14:30:00Z').getTime() / 1000),
                  media_type: 'movie',
                  title: 'Short Movie',
                  duration: 3600, // 60 minutes
                  viewed_duration: 3600,
                },
                {
                  date: Math.floor(new Date('2024-06-16T14:30:00Z').getTime() / 1000),
                  media_type: 'movie',
                  title: 'Long Movie',
                  duration: 10800, // 180 minutes
                  viewed_duration: 10800,
                },
                {
                  date: Math.floor(new Date('2024-06-17T14:30:00Z').getTime() / 1000),
                  media_type: 'movie',
                  title: 'Medium Movie',
                  duration: 7200, // 120 minutes
                  viewed_duration: 7200,
                },
              ],
            },
          },
        }

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockUsersResponse,
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockHistoryResponse,
          } as Response)

        const result = await fetchTautulliStatistics(
          config,
          { plexUserId: '123' },
          2024
        )

        expect(result.success).toBe(true)
        expect(result.data?.topMovies).toHaveLength(3)
        expect(result.data?.topMovies[0].title).toBe('Long Movie')
        expect(result.data?.topMovies[0].watchTime).toBe(180)
        expect(result.data?.topMovies[1].title).toBe('Medium Movie')
        expect(result.data?.topMovies[1].watchTime).toBe(120)
        expect(result.data?.topMovies[2].title).toBe('Short Movie')
        expect(result.data?.topMovies[2].watchTime).toBe(60)
      })
    })

    describe('Monthly Watch Time and Counts', () => {
      const config = {
        url: 'https://tautulli.example.com:8181',
        apiKey: 'test-key',
      }

      const mockUsersResponse = {
        response: {
          result: 'success',
          data: [
            {
              user_id: 123,
              username: 'testuser',
              email: 'test@example.com',
              friendly_name: 'Test User',
            },
          ],
        },
      }

      it('should aggregate watch time by month', async () => {
        const mockHistoryResponse = {
          response: {
            result: 'success',
            data: {
              recordsTotal: 3,
              data: [
                {
                  date: Math.floor(new Date('2024-01-15T14:30:00Z').getTime() / 1000),
                  media_type: 'movie',
                  title: 'January Movie',
                  duration: 7200, // 120 minutes
                  viewed_duration: 7200,
                },
                {
                  date: Math.floor(new Date('2024-02-20T14:30:00Z').getTime() / 1000),
                  media_type: 'movie',
                  title: 'February Movie',
                  duration: 5400, // 90 minutes
                  viewed_duration: 5400,
                },
                {
                  date: Math.floor(new Date('2024-01-25T14:30:00Z').getTime() / 1000),
                  media_type: 'episode',
                  grandparent_title: 'January Show',
                  title: 'Episode 1',
                  duration: 1800, // 30 minutes
                  viewed_duration: 1800,
                },
              ],
            },
          },
        }

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockUsersResponse,
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockHistoryResponse,
          } as Response)

        const result = await fetchTautulliStatistics(
          config,
          { plexUserId: '123' },
          2024
        )

        expect(result.success).toBe(true)
        expect(result.data?.watchTimeByMonth).toHaveLength(2)

        // January should have 150 minutes (120 + 30)
        const january = result.data?.watchTimeByMonth.find(m => m.month === 1)
        expect(january).toBeDefined()
        expect(january?.monthName).toBe('January')
        expect(january?.watchTime).toBe(150)

        // February should have 90 minutes
        const february = result.data?.watchTimeByMonth.find(m => m.month === 2)
        expect(february).toBeDefined()
        expect(february?.monthName).toBe('February')
        expect(february?.watchTime).toBe(90)
      })

      it('should track top movie and show per month', async () => {
        const mockHistoryResponse = {
          response: {
            result: 'success',
            data: {
              recordsTotal: 4,
              data: [
                {
                  date: Math.floor(new Date('2024-03-10T14:30:00Z').getTime() / 1000),
                  media_type: 'movie',
                  title: 'March Movie A',
                  duration: 7200, // 120 minutes
                  viewed_duration: 7200,
                  year: 2020,
                  rating: 8.5,
                },
                {
                  date: Math.floor(new Date('2024-03-15T14:30:00Z').getTime() / 1000),
                  media_type: 'movie',
                  title: 'March Movie B',
                  duration: 5400, // 90 minutes
                  viewed_duration: 5400,
                  year: 2021,
                  rating: 7.5,
                },
                {
                  date: Math.floor(new Date('2024-03-20T14:30:00Z').getTime() / 1000),
                  media_type: 'episode',
                  grandparent_title: 'March Show A',
                  title: 'Episode 1',
                  duration: 3000, // 50 minutes
                  viewed_duration: 3000,
                  year: 2022,
                  rating: 9.0,
                },
                {
                  date: Math.floor(new Date('2024-03-25T14:30:00Z').getTime() / 1000),
                  media_type: 'episode',
                  grandparent_title: 'March Show B',
                  title: 'Episode 1',
                  duration: 1800, // 30 minutes
                  viewed_duration: 1800,
                  year: 2023,
                  rating: 8.0,
                },
              ],
            },
          },
        }

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockUsersResponse,
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockHistoryResponse,
          } as Response)

        const result = await fetchTautulliStatistics(
          config,
          { plexUserId: '123' },
          2024
        )

        expect(result.success).toBe(true)
        expect(result.data?.watchTimeByMonth).toHaveLength(1)

        const march = result.data!.watchTimeByMonth[0]
        expect(march.month).toBe(3)
        expect(march.monthName).toBe('March')
        expect(march.watchTime).toBe(290) // 120 + 90 + 50 + 30

        // Top movie should be March Movie A (120 minutes)
        expect(march.topMovie).toBeDefined()
        expect(march.topMovie?.title).toBe('March Movie A')
        expect(march.topMovie?.watchTime).toBe(120)
        expect(march.topMovie?.playCount).toBe(1)
        expect(march.topMovie?.year).toBe(2020)
        expect(march.topMovie?.rating).toBe(8.5)

        // Top show should be March Show A (50 minutes)
        expect(march.topShow).toBeDefined()
        expect(march.topShow?.title).toBe('March Show A')
        expect(march.topShow?.watchTime).toBe(50)
        expect(march.topShow?.playCount).toBe(1)
        expect(march.topShow?.episodesWatched).toBe(1)
        expect(march.topShow?.year).toBe(2022)
        expect(march.topShow?.rating).toBe(9.0)
      })

      it('should sort months chronologically', async () => {
        const mockHistoryResponse = {
          response: {
            result: 'success',
            data: {
              recordsTotal: 3,
              data: [
                {
                  date: Math.floor(new Date('2024-06-15T14:30:00Z').getTime() / 1000),
                  media_type: 'movie',
                  title: 'June Movie',
                  duration: 3600,
                  viewed_duration: 3600,
                },
                {
                  date: Math.floor(new Date('2024-02-15T14:30:00Z').getTime() / 1000),
                  media_type: 'movie',
                  title: 'February Movie',
                  duration: 3600,
                  viewed_duration: 3600,
                },
                {
                  date: Math.floor(new Date('2024-09-15T14:30:00Z').getTime() / 1000),
                  media_type: 'movie',
                  title: 'September Movie',
                  duration: 3600,
                  viewed_duration: 3600,
                },
              ],
            },
          },
        }

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockUsersResponse,
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockHistoryResponse,
          } as Response)

        const result = await fetchTautulliStatistics(
          config,
          { plexUserId: '123' },
          2024
        )

        expect(result.success).toBe(true)
        expect(result.data?.watchTimeByMonth).toHaveLength(3)
        expect(result.data?.watchTimeByMonth[0].month).toBe(2) // February
        expect(result.data?.watchTimeByMonth[1].month).toBe(6) // June
        expect(result.data?.watchTimeByMonth[2].month).toBe(9) // September
      })

      it('should handle boundary timestamps at start of month', async () => {
        const mockHistoryResponse = {
          response: {
            result: 'success',
            data: {
              recordsTotal: 2,
              data: [
                {
                  date: Math.floor(new Date('2024-04-01T12:00:00Z').getTime() / 1000), // Midday April 1st
                  media_type: 'movie',
                  title: 'April Start Movie',
                  duration: 3600,
                  viewed_duration: 3600,
                },
                {
                  date: Math.floor(new Date('2024-03-31T12:00:00Z').getTime() / 1000), // Midday March 31st
                  media_type: 'movie',
                  title: 'March End Movie',
                  duration: 3600,
                  viewed_duration: 3600,
                },
              ],
            },
          },
        }

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockUsersResponse,
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockHistoryResponse,
          } as Response)

        const result = await fetchTautulliStatistics(
          config,
          { plexUserId: '123' },
          2024
        )

        expect(result.success).toBe(true)
        expect(result.data?.watchTimeByMonth).toHaveLength(2)

        const march = result.data?.watchTimeByMonth.find(m => m.month === 3)
        const april = result.data?.watchTimeByMonth.find(m => m.month === 4)

        expect(march).toBeDefined()
        expect(march?.watchTime).toBe(60)
        expect(april).toBeDefined()
        expect(april?.watchTime).toBe(60)
      })

      it('should handle boundary timestamps at end of month', async () => {
        const mockHistoryResponse = {
          response: {
            result: 'success',
            data: {
              recordsTotal: 2,
              data: [
                {
                  date: Math.floor(new Date('2024-05-31T12:00:00Z').getTime() / 1000), // Midday May 31st
                  media_type: 'movie',
                  title: 'May End Movie',
                  duration: 3600,
                  viewed_duration: 3600,
                },
                {
                  date: Math.floor(new Date('2024-06-01T12:00:00Z').getTime() / 1000), // Midday June 1st
                  media_type: 'movie',
                  title: 'June Start Movie',
                  duration: 3600,
                  viewed_duration: 3600,
                },
              ],
            },
          },
        }

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockUsersResponse,
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockHistoryResponse,
          } as Response)

        const result = await fetchTautulliStatistics(
          config,
          { plexUserId: '123' },
          2024
        )

        expect(result.success).toBe(true)
        expect(result.data?.watchTimeByMonth).toHaveLength(2)

        const may = result.data?.watchTimeByMonth.find(m => m.month === 5)
        const june = result.data?.watchTimeByMonth.find(m => m.month === 6)

        expect(may).toBeDefined()
        expect(may?.watchTime).toBe(60)
        expect(june).toBeDefined()
        expect(june?.watchTime).toBe(60)
      })

      it('should handle boundary timestamps at year boundaries', async () => {
        const mockHistoryResponse = {
          response: {
            result: 'success',
            data: {
              recordsTotal: 3,
              data: [
                {
                  date: Math.floor(new Date('2024-01-01T12:00:00Z').getTime() / 1000), // Midday January 1st
                  media_type: 'movie',
                  title: 'Year Start Movie',
                  duration: 3600,
                  viewed_duration: 3600,
                },
                {
                  date: Math.floor(new Date('2023-12-31T12:00:00Z').getTime() / 1000), // Midday December 31st previous year
                  media_type: 'movie',
                  title: 'Previous Year Movie',
                  duration: 3600,
                  viewed_duration: 3600,
                },
                {
                  date: Math.floor(new Date('2024-12-31T12:00:00Z').getTime() / 1000), // Midday December 31st
                  media_type: 'movie',
                  title: 'Year End Movie',
                  duration: 3600,
                  viewed_duration: 3600,
                },
              ],
            },
          },
        }

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockUsersResponse,
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockHistoryResponse,
          } as Response)

        const result = await fetchTautulliStatistics(
          config,
          { plexUserId: '123' },
          2024
        )

        expect(result.success).toBe(true)
        // Should only include 2024 data (2 movies)
        expect(result.data?.totalWatchTime).toBe(120)
        expect(result.data?.moviesWatched).toBe(2)

        // Should have January and December
        expect(result.data?.watchTimeByMonth).toHaveLength(2)
        const january = result.data?.watchTimeByMonth.find(m => m.month === 1)
        const december = result.data?.watchTimeByMonth.find(m => m.month === 12)

        expect(january).toBeDefined()
        expect(january?.watchTime).toBe(60)
        expect(december).toBeDefined()
        expect(december?.watchTime).toBe(60)
      })

      it('should handle multiple items in same month with same show', async () => {
        const mockHistoryResponse = {
          response: {
            result: 'success',
            data: {
              recordsTotal: 3,
              data: [
                {
                  date: Math.floor(new Date('2024-07-05T14:30:00Z').getTime() / 1000),
                  media_type: 'episode',
                  grandparent_title: 'Binge Show',
                  title: 'Episode 1',
                  duration: 1800, // 30 minutes
                  viewed_duration: 1800,
                },
                {
                  date: Math.floor(new Date('2024-07-10T14:30:00Z').getTime() / 1000),
                  media_type: 'episode',
                  grandparent_title: 'Binge Show',
                  title: 'Episode 2',
                  duration: 1800, // 30 minutes
                  viewed_duration: 1800,
                },
                {
                  date: Math.floor(new Date('2024-07-15T14:30:00Z').getTime() / 1000),
                  media_type: 'episode',
                  grandparent_title: 'Binge Show',
                  title: 'Episode 3',
                  duration: 1800, // 30 minutes
                  viewed_duration: 1800,
                },
              ],
            },
          },
        }

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockUsersResponse,
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockHistoryResponse,
          } as Response)

        const result = await fetchTautulliStatistics(
          config,
          { plexUserId: '123' },
          2024
        )

        expect(result.success).toBe(true)
        expect(result.data?.watchTimeByMonth).toHaveLength(1)

        const july = result.data!.watchTimeByMonth[0]
        expect(july.month).toBe(7)
        expect(july.watchTime).toBe(90) // 30 * 3
        expect(july.topShow).toBeDefined()
        expect(july.topShow?.title).toBe('Binge Show')
        expect(july.topShow?.watchTime).toBe(90)
        expect(july.topShow?.episodesWatched).toBe(3)
        expect(july.topShow?.playCount).toBe(3)
      })
    })
  })

  describe('fetchPlexServerStatistics', () => {
    const plexConfig = {
      url: 'https://plex.example.com:32400',
      token: 'plex-token',
    }

    const tautulliConfig = {
      url: 'https://tautulli.example.com:8181',
      apiKey: 'test-key',
    }

    it('should fetch server statistics successfully', async () => {
      const mockSectionsResponse = {
        MediaContainer: {
          Directory: [
            {
              key: '1',
              title: 'Movies',
              type: 'movie',
            },
            {
              key: '2',
              title: 'TV Shows',
              type: 'show',
            },
          ],
        },
      }

      const mockMoviesResponse = {
        MediaContainer: {
          Metadata: [
            {
              Media: [
                {
                  Part: [{ size: '1073741824' }], // 1 GB
                },
              ],
            },
          ],
          totalSize: 1,
        },
      }

      const mockShowsResponse = {
        MediaContainer: {
          Metadata: [
            {
              Media: [
                {
                  Part: [{ size: '536870912' }], // 0.5 GB
                },
              ],
            },
          ],
          totalSize: 1,
        },
      }

      const mockEpisodesResponse = {
        MediaContainer: {
          Metadata: [
            {
              Media: [
                {
                  Part: [{ size: '536870912' }], // 0.5 GB
                },
              ],
            },
          ],
        },
      }

      const mockTautulliLibrariesResponse = {
        response: {
          result: 'success',
          data: [
            {
              section_type: 'movie',
              count: '1',
              child_count: '0',
            },
            {
              section_type: 'show',
              count: '1',
              child_count: '2',
            },
          ],
        },
      }

      // Mock calls: sections, movies section, shows section, episodes, tautulli libraries
      // Note: fetchPlexServerStatisticsFromPlex and fetchTautulliLibraryCounts run in parallel,
      // so we need to mock all calls. The order might vary, so we use mockImplementation
      // to match URLs or provide enough mocks for all calls
      let callCount = 0
      mockFetch.mockImplementation((url: string | Request | URL) => {
        callCount++
        const urlStr = typeof url === 'string' ? url : url.toString()

        // Tautulli library call
        if (urlStr.includes('get_libraries')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockTautulliLibrariesResponse,
          } as Response)
        }

        // Plex sections call
        if (urlStr.includes('/library/sections?') && !urlStr.includes('/all')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockSectionsResponse,
          } as Response)
        }

        // Plex movies section call
        if (urlStr.includes('/library/sections/1/all') && !urlStr.includes('type=4')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockMoviesResponse,
          } as Response)
        }

        // Plex shows section call
        if (urlStr.includes('/library/sections/2/all') && !urlStr.includes('type=4')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockShowsResponse,
          } as Response)
        }

        // Plex episodes call
        if (urlStr.includes('type=4')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockEpisodesResponse,
          } as Response)
        }

        // Default fallback
        return Promise.resolve({
          ok: false,
          statusText: 'Not mocked',
        } as Response)
      })

      const result = await fetchPlexServerStatistics(plexConfig, tautulliConfig)

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.librarySize.movies).toBe(1)
      expect(result.data?.librarySize.shows).toBe(1)
      expect(result.data?.librarySize.episodes).toBe(2)
    })

    it('should handle Plex API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
      } as Response)

      const result = await fetchPlexServerStatistics(plexConfig, tautulliConfig)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Unauthorized')
    })
  })

  describe('fetchWatchTimeLeaderboard', () => {
    const config = {
      url: 'https://tautulli.example.com:8181',
      apiKey: 'test-key',
    }

    it('should fetch watch time leaderboard successfully', async () => {
      const mockResponse = {
        response: {
          result: 'success',
          data: [
            {
              stat_id: 'top_users',
              rows: [
                {
                  user_id: '123',
                  user: 'user1',
                  friendly_name: 'User 1',
                  total_duration: 3600, // 60 minutes in seconds
                  movies_duration: 1800,
                  shows_duration: 1800,
                },
                {
                  user_id: '456',
                  user: 'user2',
                  friendly_name: 'User 2',
                  total_duration: 1800, // 30 minutes
                  movies_duration: 900,
                  shows_duration: 900,
                },
              ],
            },
          ],
        },
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await fetchWatchTimeLeaderboard(config, 2024)

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data).toHaveLength(2)
      expect(result.data?.[0].totalWatchTime).toBe(60)
      expect(result.data?.[0].userId).toBe('123')
      expect(result.data?.[1].totalWatchTime).toBe(30)
    })

    it('should handle API errors', async () => {
      const errorResponse = {
        response: {
          result: 'error',
          message: 'API error',
        },
      }

      // Reset any previous mockImplementation
      mockFetch.mockReset()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => errorResponse,
      } as Response)

      const result = await fetchWatchTimeLeaderboard(config, 2024)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      // The function returns the error message from response.message or a default message
      expect(result.error).toMatch(/API error|Tautulli API error/)
    })
  })

  describe('Edge Cases & Empty States', () => {
    describe('fetchTautulliStatistics - empty and minimal data', () => {
      const config = {
        url: 'https://tautulli.example.com:8181',
        apiKey: 'test-key',
      }

      const mockUsersResponse = {
        response: {
          result: 'success',
          data: [
            {
              user_id: 123,
              username: 'testuser',
              email: 'test@example.com',
              friendly_name: 'Test User',
            },
          ],
        },
      }

      it('should handle completely empty viewing history', async () => {
        const mockEmptyHistoryResponse = {
          response: {
            result: 'success',
            data: {
              recordsTotal: 0,
              data: [],
            },
          },
        }

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockUsersResponse,
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockEmptyHistoryResponse,
          } as Response)

        const result = await fetchTautulliStatistics(
          config,
          { plexUserId: '123' },
          2024
        )

        // Should succeed with sensible defaults
        expect(result.success).toBe(true)
        expect(result.data).toBeDefined()
        expect(result.data?.totalWatchTime).toBe(0)
        expect(result.data?.moviesWatchTime).toBe(0)
        expect(result.data?.showsWatchTime).toBe(0)
        expect(result.data?.moviesWatched).toBe(0)
        expect(result.data?.showsWatched).toBe(0)
        expect(result.data?.episodesWatched).toBe(0)
        expect(result.data?.topMovies).toEqual([])
        expect(result.data?.topShows).toEqual([])
        expect(result.data?.watchTimeByMonth).toEqual([])
      })

      it('should handle single item watched', async () => {
        const mockSingleItemHistory = {
          response: {
            result: 'success',
            data: {
              recordsTotal: 1,
              data: [
                {
                  date: Math.floor(new Date('2024-06-15').getTime() / 1000),
                  media_type: 'movie',
                  title: 'Single Movie',
                  duration: 7200, // 120 minutes in seconds
                  viewed_duration: 7200,
                  year: 2023,
                  rating: 8.5,
                  rating_key: '12345',
                },
              ],
            },
          },
        }

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockUsersResponse,
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockSingleItemHistory,
          } as Response)

        const result = await fetchTautulliStatistics(
          config,
          { plexUserId: '123' },
          2024
        )

        expect(result.success).toBe(true)
        expect(result.data).toBeDefined()
        expect(result.data?.totalWatchTime).toBe(120)
        expect(result.data?.moviesWatched).toBe(1)
        expect(result.data?.showsWatched).toBe(0)
        expect(result.data?.topMovies).toHaveLength(1)
        expect(result.data?.topMovies[0].title).toBe('Single Movie')
        expect(result.data?.topMovies[0].watchTime).toBe(120)
        expect(result.data?.topMovies[0].playCount).toBe(1)
        expect(result.data?.topShows).toEqual([])
        expect(result.data?.watchTimeByMonth).toHaveLength(1)
        expect(result.data?.watchTimeByMonth[0].month).toBe(6)
      })

      it('should handle all content watched in one day', async () => {
        const singleDate = Math.floor(new Date('2024-03-15T10:00:00Z').getTime() / 1000)

        const mockSkewedHistory = {
          response: {
            result: 'success',
            data: {
              recordsTotal: 5,
              data: [
                {
                  date: singleDate,
                  media_type: 'movie',
                  title: 'Movie 1',
                  duration: 3600,
                  viewed_duration: 3600,
                },
                {
                  date: singleDate,
                  media_type: 'movie',
                  title: 'Movie 2',
                  duration: 3600,
                  viewed_duration: 3600,
                },
                {
                  date: singleDate,
                  media_type: 'episode',
                  grandparent_title: 'Show 1',
                  title: 'Episode 1',
                  duration: 1800,
                  viewed_duration: 1800,
                },
                {
                  date: singleDate,
                  media_type: 'episode',
                  grandparent_title: 'Show 1',
                  title: 'Episode 2',
                  duration: 1800,
                  viewed_duration: 1800,
                },
                {
                  date: singleDate,
                  media_type: 'episode',
                  grandparent_title: 'Show 1',
                  title: 'Episode 3',
                  duration: 1800,
                  viewed_duration: 1800,
                },
              ],
            },
          },
        }

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockUsersResponse,
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockSkewedHistory,
          } as Response)

        const result = await fetchTautulliStatistics(
          config,
          { plexUserId: '123' },
          2024
        )

        expect(result.success).toBe(true)
        expect(result.data).toBeDefined()
        // All content in one day should still calculate correctly
        expect(result.data?.totalWatchTime).toBe(210) // 120 + 90 minutes
        expect(result.data?.moviesWatched).toBe(2)
        expect(result.data?.showsWatched).toBe(1)
        expect(result.data?.episodesWatched).toBe(3)
        // All watch time should be in March (month 3)
        expect(result.data?.watchTimeByMonth).toHaveLength(1)
        expect(result.data?.watchTimeByMonth[0].month).toBe(3)
        expect(result.data?.watchTimeByMonth[0].watchTime).toBe(210)
      })

      it('should handle one title dominating watch history', async () => {
        const mockDominantTitleHistory = {
          response: {
            result: 'success',
            data: {
              recordsTotal: 11,
              data: [
                // Same movie watched 10 times
                ...Array.from({ length: 10 }, (_, i) => ({
                  date: Math.floor(new Date(`2024-0${(i % 9) + 1}-15`).getTime() / 1000),
                  media_type: 'movie',
                  title: 'Favorite Movie',
                  duration: 7200,
                  viewed_duration: 7200,
                  year: 2023,
                  rating: 9.5,
                  rating_key: '99999',
                })),
                // One different movie
                {
                  date: Math.floor(new Date('2024-10-15').getTime() / 1000),
                  media_type: 'movie',
                  title: 'Other Movie',
                  duration: 3600,
                  viewed_duration: 3600,
                  year: 2024,
                },
              ],
            },
          },
        }

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockUsersResponse,
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockDominantTitleHistory,
          } as Response)

        const result = await fetchTautulliStatistics(
          config,
          { plexUserId: '123' },
          2024
        )

        expect(result.success).toBe(true)
        expect(result.data).toBeDefined()
        expect(result.data?.moviesWatched).toBe(2)
        expect(result.data?.totalWatchTime).toBe(1260) // 10*120 + 60
        // Favorite movie should be at the top
        expect(result.data?.topMovies[0].title).toBe('Favorite Movie')
        expect(result.data?.topMovies[0].watchTime).toBe(1200) // 10 * 120 minutes
        expect(result.data?.topMovies[0].playCount).toBe(10)
        // Other movie should be second
        expect(result.data?.topMovies[1].title).toBe('Other Movie')
        expect(result.data?.topMovies[1].watchTime).toBe(60)
        expect(result.data?.topMovies[1].playCount).toBe(1)
      })

      it('should handle items with zero or invalid watch time', async () => {
        const mockInvalidDurationHistory = {
          response: {
            result: 'success',
            data: {
              recordsTotal: 3,
              data: [
                {
                  date: Math.floor(new Date('2024-06-15').getTime() / 1000),
                  media_type: 'movie',
                  title: 'Valid Movie',
                  duration: 3600,
                  viewed_duration: 3600,
                },
                {
                  date: Math.floor(new Date('2024-06-16').getTime() / 1000),
                  media_type: 'movie',
                  title: 'Zero Duration Movie',
                  duration: 0,
                  viewed_duration: 0,
                },
                {
                  date: Math.floor(new Date('2024-06-17').getTime() / 1000),
                  media_type: 'movie',
                  title: 'Missing Duration Movie',
                  // No duration or viewed_duration fields
                },
              ],
            },
          },
        }

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockUsersResponse,
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockInvalidDurationHistory,
          } as Response)

        const result = await fetchTautulliStatistics(
          config,
          { plexUserId: '123' },
          2024
        )

        expect(result.success).toBe(true)
        expect(result.data).toBeDefined()
        // Should only count the valid movie
        expect(result.data?.moviesWatched).toBe(1)
        expect(result.data?.totalWatchTime).toBe(60)
        expect(result.data?.topMovies).toHaveLength(1)
        expect(result.data?.topMovies[0].title).toBe('Valid Movie')
      })

      it('should handle missing or malformed date fields', async () => {
        const mockMissingDateHistory = {
          response: {
            result: 'success',
            data: {
              recordsTotal: 2,
              data: [
                {
                  date: Math.floor(new Date('2024-06-15').getTime() / 1000),
                  media_type: 'movie',
                  title: 'Movie with Date',
                  duration: 3600,
                  viewed_duration: 3600,
                },
                {
                  // Missing date field - will be filtered out by date range check
                  media_type: 'movie',
                  title: 'Movie without Date',
                  duration: 3600,
                  viewed_duration: 3600,
                },
              ],
            },
          },
        }

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockUsersResponse,
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockMissingDateHistory,
          } as Response)

        const result = await fetchTautulliStatistics(
          config,
          { plexUserId: '123' },
          2024
        )

        // Should not crash and should process items with valid dates
        expect(result.success).toBe(true)
        expect(result.data).toBeDefined()
        // Only the movie with a valid date should be counted (missing date defaults to 0 and is filtered out)
        expect(result.data?.moviesWatched).toBe(1)
        expect(result.data?.totalWatchTime).toBe(60)
        expect(result.data?.topMovies[0].title).toBe('Movie with Date')
      })
    })

    describe('fetchWatchTimeLeaderboard - empty and minimal data', () => {
      const config = {
        url: 'https://tautulli.example.com:8181',
        apiKey: 'test-key',
      }

      it('should handle empty leaderboard', async () => {
        const mockEmptyResponse = {
          response: {
            result: 'success',
            data: [],
          },
        }

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockEmptyResponse,
        } as Response)

        const result = await fetchWatchTimeLeaderboard(config, 2024)

        expect(result.success).toBe(true)
        expect(result.data).toBeDefined()
        expect(result.data).toEqual([])
      })

      it('should handle single user in leaderboard', async () => {
        const mockSingleUserResponse = {
          response: {
            result: 'success',
            data: [
              {
                stat_id: 'top_users',
                rows: [
                  {
                    user_id: '123',
                    user: 'singleuser',
                    friendly_name: 'Single User',
                    total_duration: 7200, // 120 minutes
                    movies_duration: 3600,
                    shows_duration: 3600,
                  },
                ],
              },
            ],
          },
        }

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockSingleUserResponse,
        } as Response)

        const result = await fetchWatchTimeLeaderboard(config, 2024)

        expect(result.success).toBe(true)
        expect(result.data).toBeDefined()
        expect(result.data).toHaveLength(1)
        expect(result.data?.[0].userId).toBe('123')
        expect(result.data?.[0].totalWatchTime).toBe(120)
        expect(result.data?.[0].moviesWatchTime).toBe(60)
        expect(result.data?.[0].showsWatchTime).toBe(60)
      })

      it('should filter out users with zero watch time', async () => {
        const mockMixedResponse = {
          response: {
            result: 'success',
            data: [
              {
                stat_id: 'top_users',
                rows: [
                  {
                    user_id: '123',
                    user: 'activeuser',
                    friendly_name: 'Active User',
                    total_duration: 3600,
                    movies_duration: 1800,
                    shows_duration: 1800,
                  },
                  {
                    user_id: '456',
                    user: 'inactiveuser',
                    friendly_name: 'Inactive User',
                    total_duration: 0, // Zero watch time
                    movies_duration: 0,
                    shows_duration: 0,
                  },
                ],
              },
            ],
          },
        }

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockMixedResponse,
        } as Response)

        const result = await fetchWatchTimeLeaderboard(config, 2024)

        expect(result.success).toBe(true)
        expect(result.data).toBeDefined()
        // Should only include the active user
        expect(result.data).toHaveLength(1)
        expect(result.data?.[0].userId).toBe('123')
      })
    })

    describe('formatBytes - edge cases', () => {
      it('should handle negative values gracefully', () => {
        // formatBytes doesn't explicitly handle negative, but shouldn't crash
        const result = formatBytes(-1024)
        expect(result).toBeDefined()
        expect(typeof result).toBe('string')
      })

      it('should handle very large values', () => {
        const petabyte = 1024 * 1024 * 1024 * 1024 * 1024
        const result = formatBytes(petabyte)
        expect(result).toContain('PB')
      })

      it('should handle fractional bytes', () => {
        const result = formatBytes(512.5)
        expect(result).toBeDefined()
        expect(typeof result).toBe('string')
      })
    })
  })

  describe('fetchTopContentLeaderboards', () => {
    const config = {
      url: 'https://tautulli.example.com:8181',
      apiKey: 'test-key',
    }

    it('should fetch leaderboards for top content', async () => {
      const mockMovie1Leaderboard = {
        response: {
          result: 'success',
          data: [
            {
              user_id: '123',
              username: 'user1',
              friendly_name: 'User 1',
              total_duration: 3600,
              plays: 2,
            },
            {
              user_id: '456',
              username: 'user2',
              friendly_name: 'User 2',
              total_duration: 1800,
              plays: 1,
            },
          ],
        },
      }

      const mockMovie2Leaderboard = {
        response: {
          result: 'success',
          data: [
            {
              user_id: '123',
              username: 'user1',
              friendly_name: 'User 1',
              total_duration: 3600,
              plays: 2,
            },
            {
              user_id: '456',
              username: 'user2',
              friendly_name: 'User 2',
              total_duration: 1800,
              plays: 1,
            },
          ],
        },
      }

      const mockShowLeaderboard = {
        response: {
          result: 'success',
          data: [
            {
              user_id: '123',
              username: 'user1',
              friendly_name: 'User 1',
              total_duration: 7200,
              plays: 5,
            },
          ],
        },
      }

      // Mock 3 calls: Movie 1, Movie 2, Show 1
      // Reset mock first to clear any previous implementation
      mockFetch.mockReset()
      // Use mockImplementation to handle calls in any order
      mockFetch.mockImplementation((url: string | Request | URL) => {
        const urlStr = typeof url === 'string' ? url : url.toString()

        // Movie 1 (ratingKey 12345)
        if (urlStr.includes('rating_key=12345') || urlStr.includes('12345')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockMovie1Leaderboard,
          } as Response)
        }

        // Movie 2 (ratingKey 12346)
        if (urlStr.includes('rating_key=12346') || urlStr.includes('12346')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockMovie2Leaderboard,
          } as Response)
        }

        // Show 1 (ratingKey 67890)
        if (urlStr.includes('rating_key=67890') || urlStr.includes('67890')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockShowLeaderboard,
          } as Response)
        }

        // Default fallback - log for debugging
        console.warn('Unmatched URL in fetchTopContentLeaderboards test:', urlStr)
        return Promise.resolve({
          ok: false,
          statusText: 'Not mocked',
        } as Response)
      })

      const topMovies = [
        { title: 'Movie 1', ratingKey: '12345' },
        { title: 'Movie 2', ratingKey: '12346' },
      ]

      const topShows = [
        { title: 'Show 1', ratingKey: '67890' },
      ]

      const result = await fetchTopContentLeaderboards(
        config,
        topMovies,
        topShows,
        '123',
        2024
      )

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.movies).toHaveLength(2)
      expect(result.data?.shows).toHaveLength(1)
      expect(result.data?.movies[0].userPosition).toBe(1) // User 123 is first
    })

    it('should skip items without ratingKey', async () => {
      const topMovies = [
        { title: 'Movie 1', ratingKey: undefined },
      ]

      const topShows: Array<{ title: string; ratingKey?: string }> = []

      const result = await fetchTopContentLeaderboards(
        config,
        topMovies,
        topShows,
        '123',
        2024
      )

      expect(result.success).toBe(true)
      expect(result.data?.movies).toHaveLength(0)
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})

