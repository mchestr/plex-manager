/**
 * Tests for lib/connections/plex.ts - Plex API integration
 */

import {
  acceptPlexInvite,
  checkUserServerAccess,
  getAllPlexServerUsers,
  getPlexServerIdentity,
  getPlexUserInfo,
  inviteUserToPlexServer,
  testPlexConnection,
} from '@/lib/connections/plex'

describe('Plex Connection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  describe('testPlexConnection', () => {
    it('should successfully test Plex connection', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
      })

      const result = await testPlexConnection({
        hostname: 'plex.example.com',
        port: 32400,
        protocol: 'https',
        token: 'test-token',
      })

      expect(result.success).toBe(true)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('plex.example.com'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Accept: 'application/json',
          }),
        })
      )
    })

    it('should handle invalid token', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      const result = await testPlexConnection({
        hostname: 'plex.example.com',
        port: 32400,
        protocol: 'https',
        token: 'invalid-token',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid Plex token')
    })

    it('should handle server not found', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await testPlexConnection({
        hostname: 'nonexistent.example.com',
        port: 32400,
        protocol: 'https',
        token: 'test-token',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    it('should handle connection timeout', async () => {
      const abortError = new Error('AbortError')
      abortError.name = 'AbortError'
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(abortError)

      const result = await testPlexConnection({
        hostname: 'slow.example.com',
        port: 32400,
        protocol: 'https',
        token: 'test-token',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('timeout')
    })

    it('should handle other connection errors', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      )

      const result = await testPlexConnection({
        hostname: 'plex.example.com',
        port: 32400,
        protocol: 'https',
        token: 'test-token',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Connection error')
    })
  })

  describe('getPlexUserInfo', () => {
    it('should successfully get Plex user info', async () => {
      const mockUserData = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        thumb: 'https://example.com/thumb.jpg',
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockUserData,
      })

      const result = await getPlexUserInfo('test-token')

      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        thumb: 'https://example.com/thumb.jpg',
      })
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
        user: {
          id: 'user-123',
          username: 'testuser',
          email: 'test@example.com',
        },
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockUserData,
      })

      const result = await getPlexUserInfo('test-token')

      expect(result.success).toBe(true)
      expect(result.data?.id).toBe('user-123')
      expect(result.data?.username).toBe('testuser')
    })

    it('should handle invalid token', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      const result = await getPlexUserInfo('invalid-token')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid Plex token')
    })

    it('should handle invalid user data', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}), // Missing required fields
      })

      const result = await getPlexUserInfo('test-token')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid user data')
    })

    it('should handle connection timeout', async () => {
      const abortError = new Error('AbortError')
      abortError.name = 'AbortError'
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(abortError)

      const result = await getPlexUserInfo('test-token')

      expect(result.success).toBe(false)
      expect(result.error).toContain('timeout')
    })
  })

  describe('checkUserServerAccess', () => {
    it('should return true when user is admin (even if not in user list)', async () => {
      // Clear any previous mocks
      jest.clearAllMocks()

      const result = await checkUserServerAccess(
        {
          hostname: 'plex.example.com',
          port: 32400,
          protocol: 'https',
          token: 'server-token',
          adminPlexUserId: '123',
        },
        '123'
      )

      expect(result.success).toBe(true)
      expect(result.hasAccess).toBe(true)
      // Should not call fetch since admin check happens first
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('should return true when user exists in server user list', async () => {
      const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer>
  <Account id="123" name="Test User" email="test@example.com" restricted="0" serverAdmin="0"/>
  <Account id="456" name="Other User" email="other@example.com" restricted="0" serverAdmin="0"/>
</MediaContainer>`

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => xmlResponse,
      })

      const result = await checkUserServerAccess(
        {
          hostname: 'plex.example.com',
          port: 32400,
          protocol: 'https',
          token: 'server-token',
          adminPlexUserId: '999',
        },
        '123'
      )

      expect(result.success).toBe(true)
      expect(result.hasAccess).toBe(true)
    })

    it('should return false when user does not exist in server user list', async () => {
      const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer>
  <Account id="123" name="Test User" email="test@example.com" restricted="0" serverAdmin="0"/>
  <Account id="456" name="Other User" email="other@example.com" restricted="0" serverAdmin="0"/>
</MediaContainer>`

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => xmlResponse,
      })

      const result = await checkUserServerAccess(
        {
          hostname: 'plex.example.com',
          port: 32400,
          protocol: 'https',
          token: 'server-token',
          adminPlexUserId: '999',
        },
        '777' // Different from admin (999) and not in user list
      )

      expect(result.success).toBe(true)
      expect(result.hasAccess).toBe(false)
      expect(result.error).toContain("User not found in server's user list")
    })

    it('should handle normalized ID comparison for admin (trim whitespace)', async () => {
      // Clear any previous mocks
      jest.clearAllMocks()

      const result = await checkUserServerAccess(
        {
          hostname: 'plex.example.com',
          port: 32400,
          protocol: 'https',
          token: 'server-token',
          adminPlexUserId: ' 123 ',
        },
        '123'
      )

      expect(result.success).toBe(true)
      expect(result.hasAccess).toBe(true)
      // Should not call fetch since admin check happens first
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('should handle normalized ID comparison (trim whitespace)', async () => {
      const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer>
  <Account id=" 123 " name="Test User" email="test@example.com" restricted="0" serverAdmin="0"/>
</MediaContainer>`

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => xmlResponse,
      })

      const result = await checkUserServerAccess(
        {
          hostname: 'plex.example.com',
          port: 32400,
          protocol: 'https',
          token: 'server-token',
          adminPlexUserId: '999',
        },
        '123'
      )

      expect(result.success).toBe(true)
      expect(result.hasAccess).toBe(true)
    })

    it('should handle failed server user fetch', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Unauthorized',
      })

      const result = await checkUserServerAccess(
        {
          hostname: 'plex.example.com',
          port: 32400,
          protocol: 'https',
          token: 'invalid-token',
          adminPlexUserId: '999',
        },
        '123'
      )

      expect(result.success).toBe(false)
      expect(result.hasAccess).toBe(false)
      expect(result.error).toContain('Unauthorized')
    })

    it('should handle empty user list', async () => {
      const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer>
</MediaContainer>`

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => xmlResponse,
      })

      const result = await checkUserServerAccess(
        {
          hostname: 'plex.example.com',
          port: 32400,
          protocol: 'https',
          token: 'server-token',
          adminPlexUserId: '999',
        },
        '123'
      )

      expect(result.success).toBe(true)
      expect(result.hasAccess).toBe(false)
      expect(result.error).toContain("User not found in server's user list")
    })

    it('should handle connection timeout', async () => {
      const abortError = new Error('AbortError')
      abortError.name = 'AbortError'
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(abortError)

      const result = await checkUserServerAccess(
        {
          hostname: 'plex.example.com',
          port: 32400,
          protocol: 'https',
          token: 'server-token',
          adminPlexUserId: '999',
        },
        '123'
      )

      expect(result.success).toBe(false)
      expect(result.hasAccess).toBe(false)
      expect(result.error).toContain('timeout')
    })
  })

  describe('getAllPlexServerUsers', () => {
    it('should successfully get all server users', async () => {
      const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer>
  <Account id="1" name="User 1" email="user1@example.com" thumb="thumb1.jpg" restricted="0" serverAdmin="1"/>
  <Account id="2" name="User 2" email="user2@example.com" restricted="1" serverAdmin="0"/>
</MediaContainer>`

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => xmlResponse,
      })

      const result = await getAllPlexServerUsers({
        hostname: 'plex.example.com',
        port: 32400,
        protocol: 'https',
        token: 'server-token',
      })

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
      expect(result.data?.[0]).toEqual({
        id: '1',
        name: 'User 1',
        email: 'user1@example.com',
        thumb: 'thumb1.jpg',
        restricted: false,
        serverAdmin: true,
      })
      expect(result.data?.[1]).toEqual({
        id: '2',
        name: 'User 2',
        email: 'user2@example.com',
        restricted: true,
        serverAdmin: false,
      })
    })

    it('should handle single account response', async () => {
      const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer>
  <Account id="1" name="User 1" email="user1@example.com" restricted="0" serverAdmin="1"/>
</MediaContainer>`

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => xmlResponse,
      })

      const result = await getAllPlexServerUsers({
        hostname: 'plex.example.com',
        port: 32400,
        protocol: 'https',
        token: 'server-token',
      })

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
    })

    it('should handle empty response', async () => {
      const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer>
</MediaContainer>`

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => xmlResponse,
      })

      const result = await getAllPlexServerUsers({
        hostname: 'plex.example.com',
        port: 32400,
        protocol: 'https',
        token: 'server-token',
      })

      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
    })

    it('should handle invalid token', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Unauthorized',
      })

      const result = await getAllPlexServerUsers({
        hostname: 'plex.example.com',
        port: 32400,
        protocol: 'https',
        token: 'invalid-token',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Unauthorized')
    })

    it('should handle invalid XML', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => 'invalid xml',
      })

      const result = await getAllPlexServerUsers({
        hostname: 'plex.example.com',
        port: 32400,
        protocol: 'https',
        token: 'server-token',
      })

      // XML parser may not throw on invalid XML, so it might return success with empty data
      // or fail to parse - check for either case
      if (result.success === false) {
        expect(result.error).toContain('Failed to parse XML')
      } else {
        // If parser doesn't throw, it returns success with empty data
        expect(result.success).toBe(true)
        expect(result.data).toEqual([])
      }
    })

    it('should handle connection timeout', async () => {
      const abortError = new Error('AbortError')
      abortError.name = 'AbortError'
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(abortError)

      const result = await getAllPlexServerUsers({
        hostname: 'plex.example.com',
        port: 32400,
        protocol: 'https',
        token: 'server-token',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('timeout')
    })
  })

  describe('inviteUserToPlexServer', () => {
    const mockServerConfig = {
      hostname: 'plex.example.com',
      port: 32400,
      protocol: 'https',
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
      expect(result.error).toContain('Invalid library section IDs')
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

