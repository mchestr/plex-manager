/**
 * Tests for lib/connections/plex.ts - Plex API integration. The access check
 * and the plex.tv users list are tested on recorded responses in
 * lib/connections/__tests__/plex-user-access.test.ts and plex-tv-users.test.ts.
 */

import {
    acceptPlexInvite,
    getPlexUserInfo,
    inviteUserToPlexServer,
    testPlexConnection
} from '@/lib/connections/plex'
import {
  makePlexServerConfig,
  makePlexUserInfo,
} from '../utils/test-builders'

describe('Plex Connection', () => {
  // Helper to temporarily disable test mode
  const withTestModeDisabled = <T>(fn: () => Promise<T>): Promise<T> => {
    const originalEnv = process.env.NODE_ENV
    const originalSkip = process.env.SKIP_CONNECTION_TESTS
    jest.replaceProperty(process.env, 'NODE_ENV', 'production')
    delete process.env.SKIP_CONNECTION_TESTS

    return fn().finally(() => {
      jest.replaceProperty(process.env, 'NODE_ENV', originalEnv)
      if (originalSkip) {
        process.env.SKIP_CONNECTION_TESTS = originalSkip
      }
    })
  }

  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  describe('testPlexConnection', () => {
    it('should successfully test Plex connection', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ MediaContainer: { size: 0 } }),
      })

      const config = makePlexServerConfig()
      const result = await withTestModeDisabled(() => testPlexConnection(config))

      expect(result.success).toBe(true)
      expect(global.fetch).toHaveBeenCalledWith(
        `${config.url}/status/sessions`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Accept: 'application/json',
            'X-Plex-Token': config.token,
          }),
        })
      )
    })

    it('should handle invalid token', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      const result = await withTestModeDisabled(() => testPlexConnection(makePlexServerConfig({ token: 'invalid-token' })))

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid Plex token')
    })

    it('should handle server not found', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await withTestModeDisabled(() => testPlexConnection(makePlexServerConfig({ url: 'https://nonexistent.example.com:32400' })))

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    it('should report a failed request without its error text', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      )

      const result = await withTestModeDisabled(() => testPlexConnection(makePlexServerConfig()))

      expect(result.success).toBe(false)
      expect(result.error).toBe('Could not reach Plex')
    })
  })

  describe('getPlexUserInfo', () => {

    it('should successfully get Plex user info', async () => {
      const mockUserData = makePlexUserInfo()

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockUserData,
      })

      const result = await withTestModeDisabled(() => getPlexUserInfo('test-token'))

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockUserData)
      expect(global.fetch).toHaveBeenCalledWith(
        'https://plex.tv/api/v2/user',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Plex-Token': 'test-token',
          }),
        })
      )
    })

    it('should handle alternative response format', async () => {
      const mockUserData = {
        user: makePlexUserInfo({
          id: 'user-123',
          username: 'testuser',
          email: 'test@example.com',
        }),
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockUserData,
      })

      const result = await withTestModeDisabled(() => getPlexUserInfo('test-token'))

      expect(result.success).toBe(true)
      expect(result.data?.id).toBe('user-123')
      expect(result.data?.username).toBe('testuser')
    })

    it('should handle invalid token', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      const result = await withTestModeDisabled(() => getPlexUserInfo('invalid-token'))

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid Plex token')
    })

    it('should handle invalid user data', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}), // Missing required fields
      })

      const result = await withTestModeDisabled(() => getPlexUserInfo('test-token'))

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid user data')
    })

    it('should handle connection timeout', async () => {
      const abortError = new Error('AbortError')
      abortError.name = 'AbortError'
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(abortError)

      const result = await withTestModeDisabled(() => getPlexUserInfo('test-token'))

      expect(result.success).toBe(false)
      expect(result.error).toContain('timeout')
    })
  })

  describe('inviteUserToPlexServer', () => {
    const mockServerConfig = {
      url: 'https://plex.example.com:32400',
      token: 'server-token',
    }

    beforeEach(() => {
      process.env.PLEX_CLIENT_IDENTIFIER = 'test-client-id'
    })

    afterEach(() => {
      delete process.env.PLEX_CLIENT_IDENTIFIER
    })

    it('should successfully invite user with all libraries', async () => {
      // Mock identity response (XML)
      const identityXml = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer machineIdentifier="test-machine-id" />
`
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => identityXml,
      })

      // Mock Plex.tv API response with library sections
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          librarySections: [
            { id: 1001, key: 1, title: 'Movies', type: 'movie' },
            { id: 1002, key: 2, title: 'TV Shows', type: 'show' },
          ],
        }),
      })

      // Mock invite response
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 12345 }),
      })

      const result = await inviteUserToPlexServer(mockServerConfig, 'user@example.com')

      expect(result.success).toBe(true)
      expect(result.inviteID).toBe(12345)
      expect(global.fetch).toHaveBeenCalledTimes(3)
    })

    it('should successfully invite user with specific libraries', async () => {
      // Mock identity response (XML)
      const identityXml = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer machineIdentifier="test-machine-id" />
`
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => identityXml,
      })

      // Mock Plex.tv API response with library sections
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          librarySections: [
            { id: 1001, key: 1, title: 'Movies', type: 'movie' },
            { id: 1002, key: 2, title: 'TV Shows', type: 'show' },
            { id: 1003, key: 3, title: 'Music', type: 'artist' },
          ],
        }),
      })

      // Mock invite response
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 12345 }),
      })

      const result = await inviteUserToPlexServer(mockServerConfig, 'user@example.com', {
        librarySectionIds: [1, 2],
        allowDownloads: true,
      })

      expect(result.success).toBe(true)
      expect(result.inviteID).toBe(12345)

      // Verify the invite payload includes only the specified libraries
      const inviteCall = (global.fetch as jest.Mock).mock.calls[2]
      const invitePayload = JSON.parse(inviteCall[1].body)
      expect(invitePayload.librarySectionIds).toEqual([1001, 1002])
      expect(invitePayload.settings.allowSync).toBe(true)
    })

    it('should handle missing PLEX_CLIENT_IDENTIFIER', async () => {
      delete process.env.PLEX_CLIENT_IDENTIFIER

      // Mock identity response (XML) - but it won't be reached due to missing env var
      const identityXml = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer machineIdentifier="test-machine-id" />
`
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => identityXml,
      })

      const result = await inviteUserToPlexServer(mockServerConfig, 'user@example.com')

      expect(result.success).toBe(false)
      expect(result.error).toContain('PLEX_CLIENT_IDENTIFIER')
    })

    it('should handle failed identity fetch', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Unauthorized',
      })

      const result = await inviteUserToPlexServer(mockServerConfig, 'user@example.com')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should handle failed Plex.tv API fetch', async () => {
      // Mock identity response (XML)
      const identityXml = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer machineIdentifier="test-machine-id" />
`
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => identityXml,
      })

      // Mock failed Plex.tv API response
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      })

      const result = await inviteUserToPlexServer(mockServerConfig, 'user@example.com')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to fetch library sections')
    })

    it('should handle no libraries found', async () => {
      // Mock identity response (XML)
      const identityXml = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer machineIdentifier="test-machine-id" />
`
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => identityXml,
      })

      // Mock Plex.tv API response with no libraries
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          librarySections: [],
        }),
      })

      const result = await inviteUserToPlexServer(mockServerConfig, 'user@example.com')

      expect(result.success).toBe(false)
      expect(result.error).toContain('No libraries found')
    })

    it('should handle invalid library section IDs', async () => {
      // Mock identity response (XML)
      const identityXml = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer machineIdentifier="test-machine-id" />
`
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => identityXml,
      })

      // Mock Plex.tv API response
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          librarySections: [
            { id: 1001, key: 1, title: 'Movies', type: 'movie' },
            { id: 1002, key: 2, title: 'TV Shows', type: 'show' },
          ],
        }),
      })

      const result = await inviteUserToPlexServer(mockServerConfig, 'user@example.com', {
        librarySectionIds: [999], // Invalid ID
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('None of the configured library section IDs exist')
    })

    it('refuses an empty library list instead of sharing every library', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => '<?xml version="1.0" encoding="UTF-8"?>\n<MediaContainer machineIdentifier="test-machine-id" />\n',
      })
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ librarySections: [{ id: 1001, key: 1, title: 'Movies', type: 'movie' }] }),
      })

      const result = await inviteUserToPlexServer(mockServerConfig, 'user@example.com', { librarySectionIds: [] })

      expect(result).toEqual({ success: false, error: 'The invite has no libraries to share' })
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('should share the valid subset when some configured library IDs are stale', async () => {
      // Mock identity response (XML)
      const identityXml = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer machineIdentifier="test-machine-id" />
`
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => identityXml,
      })

      // Mock Plex.tv API response
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          librarySections: [
            { id: 1001, key: 1, title: 'Movies', type: 'movie' },
            { id: 1002, key: 2, title: 'TV Shows', type: 'show' },
          ],
        }),
      })

      // Mock invite response
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 12345 }),
      })

      const result = await inviteUserToPlexServer(mockServerConfig, 'user@example.com', {
        librarySectionIds: [1, 999], // 999 was deleted from the server
      })

      expect(result.success).toBe(true)
      expect(result.inviteID).toBe(12345)

      // Only the still-existing library is shared — never a fall back to all
      const inviteCall = (global.fetch as jest.Mock).mock.calls[2]
      const invitePayload = JSON.parse(inviteCall[1].body)
      expect(invitePayload.librarySectionIds).toEqual([1001])
    })

    it('should handle invite API error response', async () => {
      // Mock identity response (XML)
      const identityXml = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer machineIdentifier="test-machine-id" />
`
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => identityXml,
      })

      // Mock Plex.tv API response
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          librarySections: [
            { id: 1001, key: 1, title: 'Movies', type: 'movie' },
          ],
        }),
      })

      // Mock failed invite response
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => JSON.stringify({
          errors: [{ code: 1002, message: 'Invalid email address' }],
        }),
      })

      const result = await inviteUserToPlexServer(mockServerConfig, 'invalid-email')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid email address')
    })

    it('should handle invite response without ID', async () => {
      // Mock identity response (XML)
      const identityXml = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer machineIdentifier="test-machine-id" />
`
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => identityXml,
      })

      // Mock Plex.tv API response
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          librarySections: [
            { id: 1001, key: 1, title: 'Movies', type: 'movie' },
          ],
        }),
      })

      // Mock invite response without ID
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })

      const result = await inviteUserToPlexServer(mockServerConfig, 'user@example.com')

      expect(result.success).toBe(true)
      expect(result.inviteID).toBeUndefined()
    })

    it('should handle uppercase LibrarySections field', async () => {
      // Mock identity response (XML)
      const identityXml = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer machineIdentifier="test-machine-id" />
`
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => identityXml,
      })

      // Mock Plex.tv API response with uppercase field
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          LibrarySections: [
            { id: 1001, key: 1, title: 'Movies', type: 'movie' },
          ],
        }),
      })

      // Mock invite response
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 12345 }),
      })

      const result = await inviteUserToPlexServer(mockServerConfig, 'user@example.com')

      expect(result.success).toBe(true)
      expect(result.inviteID).toBe(12345)
    })
  })

  describe('acceptPlexInvite', () => {
    beforeEach(() => {
      process.env.PLEX_CLIENT_IDENTIFIER = 'test-client-id'
    })

    afterEach(() => {
      delete process.env.PLEX_CLIENT_IDENTIFIER
    })

    it('should successfully accept invite', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      })

      const result = await acceptPlexInvite('user-token', 12345)

      expect(result.success).toBe(true)
      expect(global.fetch).toHaveBeenCalledWith(
        'https://plex.tv/api/v2/shared_servers/12345/accept',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Plex-Token': 'user-token',
          }),
        })
      )
    })

    it('should handle failed accept', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({
          errors: [{ code: 1002, message: 'Invite not found' }],
        }),
      })

      const result = await acceptPlexInvite('user-token', 99999)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invite not found')
    })

    it('should handle missing PLEX_CLIENT_IDENTIFIER', async () => {
      delete process.env.PLEX_CLIENT_IDENTIFIER

      const result = await acceptPlexInvite('user-token', 12345)

      expect(result.success).toBe(false)
      expect(result.error).toContain('PLEX_CLIENT_IDENTIFIER')
    })
  })
})

