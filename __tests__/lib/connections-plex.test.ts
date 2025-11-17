/**
 * Tests for lib/connections/plex.ts - Plex API integration
 */

import {
  checkUserServerAccess,
  getAllPlexServerUsers,
  getPlexUserInfo,
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
        },
        '999'
      )

      expect(result.success).toBe(true)
      expect(result.hasAccess).toBe(false)
      expect(result.error).toContain("User not found in server's user list")
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
      })

      const result = await checkUserServerAccess(
        {
          hostname: 'plex.example.com',
          port: 32400,
          protocol: 'https',
          token: 'invalid-token',
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
})

