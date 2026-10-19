/**
 * Tests for Plex API marking and search methods
 * Tests: markPlexItemWatched, searchPlexMedia
 */

import {
  markPlexItemWatched,
  searchPlexMedia,
  type PlexMediaItem,
} from '@/lib/connections/plex'
import { makePlexServerConfig } from '../../../__tests__/utils/test-builders'

describe('Plex Marking and Search', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  describe('markPlexItemWatched', () => {
    const config = makePlexServerConfig()
    const ratingKey = '12345'

    it('should successfully mark item as watched', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
      })

      const result = await markPlexItemWatched(config, ratingKey)

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/:/scrobble'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Accept: 'application/json',
          }),
        })
      )
    })

    it('should construct correct URL with rating key and token', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
      })

      await markPlexItemWatched(config, ratingKey)

      const callUrl = (global.fetch as jest.Mock).mock.calls[0][0]
      expect(callUrl).toContain(`${config.url}/:/scrobble`)
      expect(callUrl).toContain(`key=${ratingKey}`)
      expect(callUrl).toContain(`X-Plex-Token=${config.token}`)
      expect(callUrl).toContain('identifier=com.plexapp.plugins.library')
    })

    it('should handle 404 not found error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })

      const result = await markPlexItemWatched(config, 'nonexistent-key')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to mark item as watched')
      expect(result.error).toContain('Not Found')
    })

    it('should handle 401 unauthorized error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      })

      const result = await markPlexItemWatched(
        makePlexServerConfig({ token: 'invalid-token' }),
        ratingKey
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to mark item as watched')
      expect(result.error).toContain('Unauthorized')
    })

    it('should handle connection timeout', async () => {
      const abortError = new Error('AbortError')
      abortError.name = 'AbortError'
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(abortError)

      const result = await markPlexItemWatched(config, ratingKey)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Connection timeout')
    })

    it('should handle network errors', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      )

      const result = await markPlexItemWatched(config, ratingKey)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Error marking item as watched')
      expect(result.error).toContain('Network error')
    })

    it('should handle non-Error exceptions', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce('Unknown error')

      const result = await markPlexItemWatched(config, ratingKey)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to mark Plex item as watched')
    })

    it('should handle server errors (500)', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      const result = await markPlexItemWatched(config, ratingKey)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Internal Server Error')
    })
  })

  describe('searchPlexMedia', () => {
    const config = makePlexServerConfig()
    const query = 'Inception'

    describe('successful searches', () => {
      it('should successfully search media without type filter', async () => {
        const mockResponse = {
          MediaContainer: {
            Metadata: [
              {
                ratingKey: '123',
                title: 'Inception',
                type: 'movie',
                year: 2010,
                thumb: '/library/metadata/123/thumb',
              },
            ],
          },
        }

        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse,
        })

        const result = await searchPlexMedia(config, query)

        expect(result.success).toBe(true)
        expect(result.data).toHaveLength(1)
        expect(result.data?.[0]).toEqual({
          ratingKey: '123',
          title: 'Inception',
          type: 'movie',
          year: 2010,
          thumb: '/library/metadata/123/thumb',
          parentTitle: undefined,
          grandparentTitle: undefined,
          index: undefined,
          parentIndex: undefined,
          viewCount: undefined,
          lastViewedAt: undefined,
        })
      })

      it('should search with movie type filter', async () => {
        const mockResponse = {
          MediaContainer: {
            Metadata: [
              {
                ratingKey: '456',
                title: 'The Matrix',
                type: 'movie',
                year: 1999,
              },
            ],
          },
        }

        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse,
        })

        const result = await searchPlexMedia(config, 'Matrix', 'movie')

        expect(result.success).toBe(true)
        expect(result.data).toHaveLength(1)

        const callUrl = (global.fetch as jest.Mock).mock.calls[0][0]
        expect(callUrl).toContain('type=1')
      })

      it('should search with show type filter', async () => {
        const mockResponse = {
          MediaContainer: {
            Metadata: [
              {
                ratingKey: '789',
                title: 'Breaking Bad',
                type: 'show',
                year: 2008,
              },
            ],
          },
        }

        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse,
        })

        const result = await searchPlexMedia(config, 'Breaking Bad', 'show')

        expect(result.success).toBe(true)
        expect(result.data).toHaveLength(1)

        const callUrl = (global.fetch as jest.Mock).mock.calls[0][0]
        expect(callUrl).toContain('type=2')
      })

      it('should search with episode type filter', async () => {
        const mockResponse = {
          MediaContainer: {
            Metadata: [
              {
                ratingKey: '101112',
                title: 'Pilot',
                type: 'episode',
                parentTitle: 'Breaking Bad',
                grandparentTitle: 'Breaking Bad',
                index: 1,
                parentIndex: 1,
              },
            ],
          },
        }

        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse,
        })

        const result = await searchPlexMedia(config, 'Pilot', 'episode')

        expect(result.success).toBe(true)
        expect(result.data).toHaveLength(1)
        expect(result.data?.[0].parentTitle).toBe('Breaking Bad')

        const callUrl = (global.fetch as jest.Mock).mock.calls[0][0]
        expect(callUrl).toContain('type=4')
      })

      it('should handle multiple search results', async () => {
        const mockResponse = {
          MediaContainer: {
            Metadata: [
              {
                ratingKey: '1',
                title: 'Star Wars: Episode IV',
                type: 'movie',
                year: 1977,
              },
              {
                ratingKey: '2',
                title: 'Star Wars: Episode V',
                type: 'movie',
                year: 1980,
              },
              {
                ratingKey: '3',
                title: 'Star Wars: Episode VI',
                type: 'movie',
                year: 1983,
              },
            ],
          },
        }

        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse,
        })

        const result = await searchPlexMedia(config, 'Star Wars')

        expect(result.success).toBe(true)
        expect(result.data).toHaveLength(3)
        expect(result.data?.[0].title).toBe('Star Wars: Episode IV')
        expect(result.data?.[1].title).toBe('Star Wars: Episode V')
        expect(result.data?.[2].title).toBe('Star Wars: Episode VI')
      })

      it('should handle single search result', async () => {
        const mockResponse = {
          MediaContainer: {
            Metadata: {
              ratingKey: '999',
              title: 'The Godfather',
              type: 'movie',
              year: 1972,
            },
          },
        }

        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse,
        })

        const result = await searchPlexMedia(config, 'The Godfather')

        expect(result.success).toBe(true)
        expect(result.data).toHaveLength(1)
        expect(result.data?.[0].title).toBe('The Godfather')
      })

      it('should handle no search results', async () => {
        const mockResponse = {
          MediaContainer: {},
        }

        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse,
        })

        const result = await searchPlexMedia(config, 'NonexistentMovie12345')

        expect(result.success).toBe(true)
        expect(result.data).toEqual([])
      })

      it('should handle complete media item with all fields', async () => {
        const mockResponse = {
          MediaContainer: {
            Metadata: [
              {
                ratingKey: '555',
                title: 'The Office S01E01',
                type: 'episode',
                year: 2005,
                parentTitle: 'Season 1',
                grandparentTitle: 'The Office',
                index: 1,
                parentIndex: 1,
                thumb: '/library/metadata/555/thumb',
                viewCount: 5,
                lastViewedAt: 1640995200,
              },
            ],
          },
        }

        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse,
        })

        const result = await searchPlexMedia(config, 'The Office')

        expect(result.success).toBe(true)
        expect(result.data).toHaveLength(1)
        expect(result.data?.[0]).toEqual({
          ratingKey: '555',
          title: 'The Office S01E01',
          type: 'episode',
          year: 2005,
          parentTitle: 'Season 1',
          grandparentTitle: 'The Office',
          index: 1,
          parentIndex: 1,
          thumb: '/library/metadata/555/thumb',
          viewCount: 5,
          lastViewedAt: 1640995200,
        })
      })

      it('should properly encode special characters in query', async () => {
        const mockResponse = {
          MediaContainer: {},
        }

        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse,
        })

        await searchPlexMedia(config, 'Lord of the Rings: Return of the King')

        const callUrl = (global.fetch as jest.Mock).mock.calls[0][0]
        expect(callUrl).toContain(encodeURIComponent('Lord of the Rings: Return of the King'))
      })

      it('should handle numeric ratingKey conversion', async () => {
        const mockResponse = {
          MediaContainer: {
            Metadata: [
              {
                ratingKey: 12345,
                title: 'Test Movie',
                type: 'movie',
              },
            ],
          },
        }

        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse,
        })

        const result = await searchPlexMedia(config, 'Test')

        expect(result.success).toBe(true)
        expect(result.data?.[0].ratingKey).toBe('12345')
      })

      it('should handle missing ratingKey gracefully', async () => {
        const mockResponse = {
          MediaContainer: {
            Metadata: [
              {
                title: 'Test Movie',
                type: 'movie',
              },
            ],
          },
        }

        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse,
        })

        const result = await searchPlexMedia(config, 'Test')

        expect(result.success).toBe(true)
        expect(result.data?.[0].ratingKey).toBe('')
      })
    })

    describe('URL construction', () => {
      it('should construct correct URL with query parameter', async () => {
        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ MediaContainer: {} }),
        })

        await searchPlexMedia(config, 'Test Query')

        const callUrl = (global.fetch as jest.Mock).mock.calls[0][0]
        expect(callUrl).toContain(`${config.url}/search`)
        expect(callUrl).toContain(`query=${encodeURIComponent('Test Query')}`)
        expect(callUrl).toContain(`X-Plex-Token=${config.token}`)
      })

      it('should not include type parameter when no type specified', async () => {
        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ MediaContainer: {} }),
        })

        await searchPlexMedia(config, 'Query')

        const callUrl = (global.fetch as jest.Mock).mock.calls[0][0]
        expect(callUrl).not.toContain('type=')
      })
    })

    describe('error handling', () => {
      it('should handle 404 not found error', async () => {
        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        })

        const result = await searchPlexMedia(config, 'Query')

        expect(result.success).toBe(false)
        expect(result.error).toContain('Failed to search media')
        expect(result.error).toContain('Not Found')
      })

      it('should handle 401 unauthorized error', async () => {
        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
        })

        const result = await searchPlexMedia(
          makePlexServerConfig({ token: 'invalid-token' }),
          query
        )

        expect(result.success).toBe(false)
        expect(result.error).toContain('Failed to search media')
        expect(result.error).toContain('Unauthorized')
      })

      it('should handle connection timeout', async () => {
        const abortError = new Error('AbortError')
        abortError.name = 'AbortError'
        ;(global.fetch as jest.Mock).mockRejectedValueOnce(abortError)

        const result = await searchPlexMedia(config, query)

        expect(result.success).toBe(false)
        expect(result.error).toBe('Connection timeout')
      })

      it('should handle network errors', async () => {
        ;(global.fetch as jest.Mock).mockRejectedValueOnce(
          new Error('Network connection failed')
        )

        const result = await searchPlexMedia(config, query)

        expect(result.success).toBe(false)
        expect(result.error).toContain('Error searching media')
        expect(result.error).toContain('Network connection failed')
      })

      it('should handle non-Error exceptions', async () => {
        ;(global.fetch as jest.Mock).mockRejectedValueOnce('Unknown error')

        const result = await searchPlexMedia(config, query)

        expect(result.success).toBe(false)
        expect(result.error).toBe('Failed to search Plex media')
      })

      it('should handle server errors (500)', async () => {
        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        })

        const result = await searchPlexMedia(config, query)

        expect(result.success).toBe(false)
        expect(result.error).toContain('Internal Server Error')
      })

      it('should handle malformed JSON response', async () => {
        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error('Invalid JSON')
          },
        })

        const result = await searchPlexMedia(config, query)

        expect(result.success).toBe(false)
        expect(result.error).toContain('Invalid JSON')
      })
    })
  })
})
