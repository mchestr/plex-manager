/**
 * Tests for Jellyfin user management functions
 * Tests: createJellyfinUser, setJellyfinUserPolicy, deleteJellyfinUser,
 *        getJellyfinUserById, authenticateJellyfinUser, getJellyfinUsers
 */

import {
  createJellyfinUser,
  setJellyfinUserPolicy,
  deleteJellyfinUser,
  getJellyfinUserById,
  authenticateJellyfinUser,
  getJellyfinUsers,
} from '@/lib/connections/jellyfin'
import { createHash } from 'node:crypto'

import { makeJellyfinServerConfig } from '../../../__tests__/utils/test-builders'

describe('Jellyfin Users', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  describe('createJellyfinUser', () => {
    const config = makeJellyfinServerConfig()
    const username = 'testuser'
    const password = 'testpassword123'

    it('should successfully create a user', async () => {
      const mockUser = {
        Id: 'user-id-123',
        Name: username,
        HasPassword: true,
        HasConfiguredPassword: true,
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUser,
      })

      const result = await createJellyfinUser(config, username, password)

      expect(result.success).toBe(true)
      expect(result.userId).toBe('user-id-123')
      expect(result.error).toBeUndefined()
    })

    it('should construct correct URL and request body', async () => {
      const mockUser = { Id: 'user-id-123', Name: username }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUser,
      })

      await createJellyfinUser(config, username, password)

      expect(global.fetch).toHaveBeenCalledWith(
        `${config.url}/Users/New`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ Name: username, Password: password }),
        })
      )
    })

    it('should handle 400 bad request with error message', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => JSON.stringify({ message: 'Username already exists' }),
      })

      const result = await createJellyfinUser(config, username, password)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Username already exists')
    })

    it('should handle 400 bad request with Message field', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => JSON.stringify({ Message: 'Invalid username format' }),
      })

      const result = await createJellyfinUser(config, username, password)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid username format')
    })

    it('should handle 400 bad request with unparseable error', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Not JSON',
      })

      const result = await createJellyfinUser(config, username, password)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid username or username already exists')
    })

    it('should handle 401 unauthorized error', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => '',
      })

      const result = await createJellyfinUser(config, username, password)

      expect(result.success).toBe(false)
      expect(result.error).toBe('API key does not have permission to create users')
    })

    it('should handle 403 forbidden error', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => '',
      })

      const result = await createJellyfinUser(config, username, password)

      expect(result.success).toBe(false)
      expect(result.error).toBe('API key does not have permission to create users')
    })

    it('should handle missing user ID in response', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ Name: username }),
      })

      const result = await createJellyfinUser(config, username, password)

      expect(result.success).toBe(false)
      expect(result.error).toBe('User ID not returned from server')
    })

    it('should handle server errors (500)', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => '',
      })

      const result = await createJellyfinUser(config, username, password)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to create user')
    })

    it('should handle network errors', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Connection refused')
      )

      const result = await createJellyfinUser(config, username, password)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Error creating user')
      expect(result.error).toContain('Connection refused')
    })

    it('should handle non-Error exceptions', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce('Unknown error')

      const result = await createJellyfinUser(config, username, password)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to create Jellyfin user')
    })
  })

  describe('setJellyfinUserPolicy', () => {
    const config = makeJellyfinServerConfig()
    const userId = 'user-id-123'
    const settings = {
      libraryIds: ['lib-1', 'lib-2'],
      enableRemoteAccess: true,
      allowDownloads: false,
    }

    it('should successfully set user policy', async () => {
      const mockUser = {
        Id: userId,
        Name: 'testuser',
        Policy: {
          IsAdministrator: false,
          IsDisabled: false,
          EnableAllFolders: true,
        },
      }

      // First call: GET user
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUser,
      })

      // Second call: POST policy
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 204,
      })

      const result = await setJellyfinUserPolicy(config, userId, settings)

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('should first fetch user then update policy', async () => {
      const mockUser = { Id: userId, Name: 'testuser', Policy: {} }

      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockUser,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 204,
        })

      await setJellyfinUserPolicy(config, userId, settings)

      // First call should be GET user
      expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
        `${config.url}/Users/${userId}`
      )
      expect((global.fetch as jest.Mock).mock.calls[0][1].method).toBe('GET')

      // Second call should be POST policy
      expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe(
        `${config.url}/Users/${userId}/Policy`
      )
      expect((global.fetch as jest.Mock).mock.calls[1][1].method).toBe('POST')
    })

    it('should merge existing policy with new settings', async () => {
      const mockUser = {
        Id: userId,
        Name: 'testuser',
        Policy: {
          IsAdministrator: false,
          IsDisabled: false,
          MaxParentalRating: 100,
          EnableAllFolders: true,
        },
      }

      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockUser,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 204,
        })

      await setJellyfinUserPolicy(config, userId, settings)

      const policyBody = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[1][1].body
      )
      // Should preserve existing policy fields
      expect(policyBody.MaxParentalRating).toBe(100)
      // Should set new library restrictions
      expect(policyBody.EnableAllFolders).toBe(false)
      expect(policyBody.EnabledFolders).toEqual(['lib-1', 'lib-2'])
    })

    it('should enable all folders when no library IDs provided', async () => {
      const mockUser = { Id: userId, Name: 'testuser', Policy: {} }

      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockUser,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 204,
        })

      await setJellyfinUserPolicy(config, userId, {})

      const policyBody = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[1][1].body
      )
      expect(policyBody.EnableAllFolders).toBe(true)
    })

    it('should handle user fetch failure', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })

      const result = await setJellyfinUserPolicy(config, userId, settings)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to get user')
    })

    it('should handle policy update failure', async () => {
      const mockUser = { Id: userId, Name: 'testuser', Policy: {} }

      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockUser,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: async () => 'Invalid policy',
        })

      const result = await setJellyfinUserPolicy(config, userId, settings)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to set user permissions')
    })

    it('should handle network errors', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network timeout')
      )

      const result = await setJellyfinUserPolicy(config, userId, settings)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Error setting user permissions')
    })

    it('should handle non-Error exceptions', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce('Unknown error')

      const result = await setJellyfinUserPolicy(config, userId, settings)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to set Jellyfin user permissions')
    })
  })

  describe('deleteJellyfinUser', () => {
    const config = makeJellyfinServerConfig()
    const userId = 'user-id-123'

    it('should successfully delete a user', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 204,
      })

      const result = await deleteJellyfinUser(config, userId)

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should construct correct URL for delete', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 204,
      })

      await deleteJellyfinUser(config, userId)

      expect(global.fetch).toHaveBeenCalledWith(
        `${config.url}/Users/${userId}`,
        expect.objectContaining({
          method: 'DELETE',
        })
      )
    })

    it('should handle delete failure', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => '',
      })

      const result = await deleteJellyfinUser(config, userId)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to delete user')
    })

    it('should handle network errors', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Connection refused')
      )

      const result = await deleteJellyfinUser(config, userId)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Error deleting user')
    })

    it('should handle non-Error exceptions', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce('Unknown error')

      const result = await deleteJellyfinUser(config, userId)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to delete Jellyfin user')
    })
  })

  describe('getJellyfinUserById', () => {
    const config = makeJellyfinServerConfig()
    const userId = 'user-id-123'

    it('should successfully fetch user by ID', async () => {
      const mockUser = {
        Id: userId,
        Name: 'testuser',
        HasPassword: true,
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUser,
      })

      const result = await getJellyfinUserById(config, userId)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockUser)
    })

    it('should handle 404 not found', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })

      const result = await getJellyfinUserById(config, userId)

      expect(result.success).toBe(false)
      expect(result.error).toBe('User not found')
    })

    it('should handle other fetch failures', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      const result = await getJellyfinUserById(config, userId)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to fetch user')
    })

    it('should handle network errors', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      )

      const result = await getJellyfinUserById(config, userId)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Error fetching user')
    })

    it('should handle non-Error exceptions', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce('Unknown error')

      const result = await getJellyfinUserById(config, userId)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to fetch Jellyfin user')
    })
  })

  describe('authenticateJellyfinUser', () => {
    const config = makeJellyfinServerConfig()
    const username = 'testuser'
    const password = 'password123'
    const AUTHORIZATION_SHAPE =
      /^MediaBrowser Client="Plex%20Manager", Device="Server", DeviceId="[^"]+", Version="\d+\.\d+\.\d+"$/
    const env = process.env as Record<string, string | undefined>
    const originalClientId = env.PLEX_CLIENT_IDENTIFIER
    const originalDeviceId = env.JELLYFIN_DEVICE_ID

    const mockFetch = () => global.fetch as jest.Mock
    const headersOf = (call: number) =>
      (mockFetch().mock.calls[call][1] as { headers: Record<string, string> }).headers
    const authResult = (overrides: Record<string, unknown> = {}) => ({
      User: { Id: 'user-id-123', Name: username },
      AccessToken: 'access-token-abc',
      ServerId: 'server-id',
      ...overrides,
    })
    /** Sign-in requests get `signInResponses` in order; every logout gets 204. */
    const respondWith = (...signInResponses: Array<Record<string, unknown>>) => {
      const queue = [...signInResponses]
      mockFetch().mockImplementation(async (url: string) =>
        url.endsWith('/Sessions/Logout') ? { ok: true, status: 204 } : queue.shift()
      )
    }
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })

    beforeEach(() => {
      env.PLEX_CLIENT_IDENTIFIER = 'test-client-identifier'
      delete env.JELLYFIN_DEVICE_ID
    })

    afterAll(() => {
      env.PLEX_CLIENT_IDENTIFIER = originalClientId
      env.JELLYFIN_DEVICE_ID = originalDeviceId
    })

    it('should successfully authenticate user', async () => {
      respondWith(ok(authResult()))

      const result = await authenticateJellyfinUser(config, username, password)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(authResult())
    })

    it('should construct correct URL and request body', async () => {
      respondWith(ok(authResult()))

      await authenticateJellyfinUser(config, username, password)

      expect(global.fetch).toHaveBeenNthCalledWith(
        1,
        `${config.url}/Users/AuthenticateByName`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ Username: username, Pw: password }),
        })
      )
    })

    it('sends the client description in Authorization and no X-Emby-Authorization', async () => {
      respondWith(ok(authResult()))

      await authenticateJellyfinUser(config, username, password)

      const headers = headersOf(0)
      expect(headers.Authorization).toMatch(AUTHORIZATION_SHAPE)
      expect(headers).not.toHaveProperty('X-Emby-Authorization')
    })

    it('derives a stable DeviceId from PLEX_CLIENT_IDENTIFIER', async () => {
      const digest = createHash('sha256').update('test-client-identifier').digest('hex')
      const expected = `plex-manager-${digest.slice(0, 16)}`
      respondWith(ok(authResult()), ok(authResult()))

      await authenticateJellyfinUser(config, username, password)
      await authenticateJellyfinUser(config, username, password)

      expect(headersOf(0).Authorization).toContain(`DeviceId="${expected}"`)
      expect(headersOf(2).Authorization).toBe(headersOf(0).Authorization)
    })

    it('uses JELLYFIN_DEVICE_ID when it is set, URL-encoded', async () => {
      env.JELLYFIN_DEVICE_ID = 'my device "1"'
      respondWith(ok(authResult()))

      await authenticateJellyfinUser(config, username, password)

      expect(headersOf(0).Authorization).toContain('DeviceId="my%20device%20%221%22"')
      expect(headersOf(0).Authorization).toMatch(AUTHORIZATION_SHAPE)
    })

    it('retries a 400 exactly once with only the legacy header', async () => {
      respondWith({ ok: false, status: 400, statusText: 'Bad Request' }, ok(authResult()))

      const result = await authenticateJellyfinUser(config, username, password)

      expect(result.success).toBe(true)
      const signInCalls = mockFetch().mock.calls.filter(([url]) => String(url).endsWith('/Users/AuthenticateByName'))
      expect(signInCalls).toHaveLength(2)
      const retry = headersOf(1)
      expect(retry).not.toHaveProperty('Authorization')
      expect(retry['X-Emby-Authorization']).toBe(headersOf(0).Authorization)
      expect(mockFetch().mock.calls[1][1]).toMatchObject({
        method: 'POST',
        body: JSON.stringify({ Username: username, Pw: password }),
      })
    })

    it('stops after the legacy retry also fails', async () => {
      respondWith(
        { ok: false, status: 400, statusText: 'Bad Request' },
        { ok: false, status: 400, statusText: 'Bad Request' }
      )

      const result = await authenticateJellyfinUser(config, username, password)

      expect(result).toEqual({ success: false, error: 'Jellyfin rejected the sign-in request' })
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('should handle 401 unauthorized without retrying', async () => {
      respondWith({ ok: false, status: 401, statusText: 'Unauthorized' })

      const result = await authenticateJellyfinUser(config, username, password)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid username or password')
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it.each([
      [403, 'Forbidden'],
      [500, 'Internal Server Error'],
      [502, 'Upstream says: secret-internal-host:8096'],
    ])('maps a %i to a generic error without the status text', async (status, statusText) => {
      respondWith({ ok: false, status, statusText })

      const result = await authenticateJellyfinUser(config, username, password)

      expect(result).toEqual({ success: false, error: 'Jellyfin rejected the sign-in request' })
      expect(result.error).not.toContain(statusText)
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('logs out the session the sign-in opened, with Token in the header', async () => {
      respondWith(ok(authResult()))

      await authenticateJellyfinUser(config, username, password)

      expect(global.fetch).toHaveBeenCalledTimes(2)
      expect(mockFetch().mock.calls[1][0]).toBe(`${config.url}/Sessions/Logout`)
      expect(mockFetch().mock.calls[1][1]).toMatchObject({ method: 'POST' })
      const logout = headersOf(1)
      expect(logout.Authorization).toBe(`${headersOf(0).Authorization}, Token="access-token-abc"`)
      expect(logout).not.toHaveProperty('X-Emby-Authorization')
    })

    it('logs out with the legacy header after the legacy fallback', async () => {
      respondWith({ ok: false, status: 400, statusText: 'Bad Request' }, ok(authResult()))

      await authenticateJellyfinUser(config, username, password)

      expect(mockFetch().mock.calls[2][0]).toBe(`${config.url}/Sessions/Logout`)
      const logout = headersOf(2)
      expect(logout['X-Emby-Authorization']).toMatch(/, Token="access-token-abc"$/)
      expect(logout).not.toHaveProperty('Authorization')
    })

    it('still succeeds when the logout fails', async () => {
      mockFetch().mockImplementation(async (url: string) => {
        if (url.endsWith('/Sessions/Logout')) {
          throw new Error('socket hang up')
        }
        return ok(authResult())
      })

      const result = await authenticateJellyfinUser(config, username, password)

      expect(result.success).toBe(true)
    })

    it('should handle invalid response (missing User.Id), logging the token out', async () => {
      respondWith(ok(authResult({ User: { Name: username } })))

      const result = await authenticateJellyfinUser(config, username, password)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid authentication response')
      expect(mockFetch().mock.calls[1][0]).toBe(`${config.url}/Sessions/Logout`)
    })

    it('should handle invalid response (missing AccessToken)', async () => {
      respondWith(ok({ User: { Id: 'user-id', Name: username } }))

      const result = await authenticateJellyfinUser(config, username, password)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid authentication response')
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('should handle network errors without exposing the error text', async () => {
      mockFetch().mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.5:8096'))

      const result = await authenticateJellyfinUser(config, username, password)

      expect(result).toEqual({ success: false, error: 'Could not reach the Jellyfin server' })
    })

    it('should handle non-Error exceptions', async () => {
      mockFetch().mockRejectedValueOnce('Unknown error')

      const result = await authenticateJellyfinUser(config, username, password)

      expect(result).toEqual({ success: false, error: 'Could not reach the Jellyfin server' })
    })
  })

  describe('getJellyfinUsers', () => {
    const config = makeJellyfinServerConfig()

    it('should successfully fetch all users', async () => {
      const mockUsers = [
        { Id: 'user-1', Name: 'User One', HasPassword: true },
        { Id: 'user-2', Name: 'User Two', HasPassword: true },
      ]

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUsers,
      })

      const result = await getJellyfinUsers(config)

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
      expect(result.data?.[0].Name).toBe('User One')
    })

    it('should handle empty users list', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      })

      const result = await getJellyfinUsers(config)

      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
    })

    it('should construct correct URL', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      })

      await getJellyfinUsers(config)

      expect(global.fetch).toHaveBeenCalledWith(
        `${config.url}/Users`,
        expect.any(Object)
      )
    })

    it('should handle fetch failure', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      })

      const result = await getJellyfinUsers(config)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to fetch users')
    })

    it('should handle network errors', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Connection refused')
      )

      const result = await getJellyfinUsers(config)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Error fetching users')
    })

    it('should handle non-Error exceptions', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce('Unknown error')

      const result = await getJellyfinUsers(config)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to fetch Jellyfin users')
    })
  })
})
