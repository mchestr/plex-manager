/**
 * Tests for Jellyfin connection testing and server info functions
 * Tests: testJellyfinConnection, getJellyfinServerInfo, getJellyfinLibraries
 */

import {
  testJellyfinConnection,
  getJellyfinServerInfo,
  getJellyfinLibraries,
} from '@/lib/connections/jellyfin'
import { makeJellyfinServerConfig } from '../../../__tests__/utils/test-builders'

// Store original env
const originalEnv = process.env

describe('Jellyfin Connection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
    // Reset env to disable test mode bypass for these tests
    process.env = { ...originalEnv, NODE_ENV: 'development', SKIP_CONNECTION_TESTS: 'false' }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('testJellyfinConnection', () => {
    const config = makeJellyfinServerConfig()

    it('should return success in test mode', async () => {
      process.env.NODE_ENV = 'test'

      const result = await testJellyfinConnection(config)

      expect(result.success).toBe(true)
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('should return success when SKIP_CONNECTION_TESTS is true', async () => {
      process.env.SKIP_CONNECTION_TESTS = 'true'

      const result = await testJellyfinConnection(config)

      expect(result.success).toBe(true)
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('should successfully connect to Jellyfin server', async () => {
      const mockSystemInfo = {
        Id: 'server-id-123',
        ServerName: 'My Jellyfin',
        Version: '10.8.0',
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSystemInfo,
      })

      const result = await testJellyfinConnection(config)

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/System/Info'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Accept: 'application/json',
          }),
        })
      )
    })

    it('should construct correct URL with auth header', async () => {
      const mockSystemInfo = {
        Id: 'server-id-123',
        ServerName: 'My Jellyfin',
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSystemInfo,
      })

      await testJellyfinConnection(config)

      const callUrl = (global.fetch as jest.Mock).mock.calls[0][0]
      expect(callUrl).toBe(`${config.url}/System/Info`)

      const callOptions = (global.fetch as jest.Mock).mock.calls[0][1]
      expect(callOptions.headers.Authorization).toContain(config.apiKey)
    })

    it('should handle 401 unauthorized error', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      })

      const result = await testJellyfinConnection(
        makeJellyfinServerConfig({ apiKey: 'invalid-key' })
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid Jellyfin API key')
    })

    it('should handle 403 forbidden error', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      })

      const result = await testJellyfinConnection(config)

      expect(result.success).toBe(false)
      expect(result.error).toBe('API key does not have admin privileges')
    })

    it('should handle 404 not found error', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })

      const result = await testJellyfinConnection(config)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Jellyfin server not found at this address')
    })

    it('should handle server errors (500)', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      const result = await testJellyfinConnection(config)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Connection failed')
      expect(result.error).toContain('Internal Server Error')
    })

    it('should handle invalid response (missing Id)', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ServerName: 'My Jellyfin' }),
      })

      const result = await testJellyfinConnection(config)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid response from Jellyfin server')
    })

    it('should handle invalid response (missing ServerName)', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ Id: 'server-id' }),
      })

      const result = await testJellyfinConnection(config)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid response from Jellyfin server')
    })

    it('should handle connection timeout', async () => {
      const abortError = new Error('AbortError')
      abortError.name = 'AbortError'
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(abortError)

      const result = await testJellyfinConnection(config)

      expect(result.success).toBe(false)
      expect(result.error).toContain('timeout')
    })

    it('should handle network errors', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      )

      const result = await testJellyfinConnection(config)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Connection error')
      expect(result.error).toContain('Network error')
    })

    it('should handle non-Error exceptions', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce('Unknown error')

      const result = await testJellyfinConnection(config)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to connect to Jellyfin server')
    })
  })

  describe('getJellyfinServerInfo', () => {
    const config = makeJellyfinServerConfig()

    it('should successfully fetch server info', async () => {
      const mockSystemInfo = {
        Id: 'server-id-123',
        ServerName: 'My Jellyfin',
        Version: '10.8.0',
        ProductName: 'Jellyfin Server',
        OperatingSystem: 'Linux',
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSystemInfo,
      })

      const result = await getJellyfinServerInfo(config)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockSystemInfo)
      expect(result.error).toBeUndefined()
    })

    it('should handle missing server ID in response', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ServerName: 'My Jellyfin' }),
      })

      const result = await getJellyfinServerInfo(config)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Server ID not found in response')
    })

    it('should handle fetch failure', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      const result = await getJellyfinServerInfo(config)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to fetch server info')
    })

    it('should handle network errors', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Connection refused')
      )

      const result = await getJellyfinServerInfo(config)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Error fetching server info')
      expect(result.error).toContain('Connection refused')
    })

    it('should handle non-Error exceptions', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce('Unknown error')

      const result = await getJellyfinServerInfo(config)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to fetch Jellyfin server info')
    })
  })

  describe('getJellyfinLibraries', () => {
    const config = makeJellyfinServerConfig()

    it('should successfully fetch libraries', async () => {
      const mockLibraries = [
        {
          Name: 'Movies',
          CollectionType: 'movies',
          ItemId: 'lib-1',
          Locations: ['/media/movies'],
        },
        {
          Name: 'TV Shows',
          CollectionType: 'tvshows',
          ItemId: 'lib-2',
          Locations: ['/media/tv'],
        },
      ]

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockLibraries,
      })

      const result = await getJellyfinLibraries(config)

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
      expect(result.data?.[0].Name).toBe('Movies')
      expect(result.data?.[1].Name).toBe('TV Shows')
    })

    it('should handle empty libraries list', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      })

      const result = await getJellyfinLibraries(config)

      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
    })

    it('should construct correct URL for libraries endpoint', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      })

      await getJellyfinLibraries(config)

      const callUrl = (global.fetch as jest.Mock).mock.calls[0][0]
      expect(callUrl).toBe(`${config.url}/Library/VirtualFolders`)
    })

    it('should handle fetch failure', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      })

      const result = await getJellyfinLibraries(config)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to fetch libraries')
    })

    it('should handle network errors', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network timeout')
      )

      const result = await getJellyfinLibraries(config)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Error fetching libraries')
      expect(result.error).toContain('Network timeout')
    })

    it('should handle non-Error exceptions', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce('Unknown error')

      const result = await getJellyfinLibraries(config)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to fetch Jellyfin libraries')
    })
  })
})
