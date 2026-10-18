/**
 * @jest-environment node
 */

/**
 * lib/jellyfin-auth.ts reads the stored Jellyfin server itself (SEC-35): no
 * caller passes the URL or API key a sign-in or admin check goes to.
 */

import { authenticateJellyfinUser, getJellyfinUserById } from '@/lib/connections/jellyfin-users'
import { authenticateJellyfin, getJellyfinLoginServer, isJellyfinAdmin } from '@/lib/jellyfin-auth'
import { prisma } from '@/lib/prisma'
import type { JellyfinUser } from '@/lib/validations/jellyfin'

jest.mock('@/lib/prisma', () => ({
  prisma: { jellyfinServer: { findFirst: jest.fn() } },
}))

jest.mock('@/lib/connections/jellyfin-users', () => ({
  authenticateJellyfinUser: jest.fn(),
  getJellyfinUserById: jest.fn(),
}))

const mockWarn = jest.fn()
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: (...args: unknown[]) => mockWarn(...args),
  }),
}))

const mockFindFirst = prisma.jellyfinServer.findFirst as jest.Mock
const mockAuthenticateJellyfinUser = authenticateJellyfinUser as jest.MockedFunction<typeof authenticateJellyfinUser>
const mockGetJellyfinUserById = getJellyfinUserById as jest.MockedFunction<typeof getJellyfinUserById>

function jellyfinUser(id: string, name: string, isAdministrator: boolean): JellyfinUser {
  return {
    Id: id,
    Name: name,
    HasPassword: true,
    HasConfiguredPassword: true,
    Policy: { IsAdministrator: isAdministrator, IsDisabled: false },
  }
}

const SERVER = {
  id: 'jf-server-1',
  url: 'http://jellyfin.local:8096',
  apiKey: 'stored-api-key',
  adminUserId: 'jf-owner',
  isActive: true,
  enabledForLogin: true,
}

describe('lib/jellyfin-auth', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFindFirst.mockResolvedValue(SERVER)
  })

  describe('getJellyfinLoginServer', () => {
    it('returns the active server when sign-in is allowed', async () => {
      await expect(getJellyfinLoginServer()).resolves.toBe(SERVER)
      expect(mockFindFirst).toHaveBeenCalledWith({ where: { isActive: true } })
    })

    it('returns null and logs when "Allow Jellyfin sign-in" is off', async () => {
      mockFindFirst.mockResolvedValue({ ...SERVER, enabledForLogin: false })

      await expect(getJellyfinLoginServer()).resolves.toBeNull()
      expect(mockWarn).toHaveBeenCalledWith('jellyfin.login.disabled', { serverId: 'jf-server-1' })
    })

    it('returns null when no server is active', async () => {
      mockFindFirst.mockResolvedValue(null)

      await expect(getJellyfinLoginServer()).resolves.toBeNull()
    })
  })

  describe('authenticateJellyfin', () => {
    it('signs in against the stored server and returns no access token', async () => {
      mockAuthenticateJellyfinUser.mockResolvedValue({
        success: true,
        data: {
          User: jellyfinUser('jf-alice', 'alice', false),
          AccessToken: 'already-logged-out',
          ServerId: 'server-id',
        },
      })

      const result = await authenticateJellyfin(' alice ', 'correct-password')

      expect(result).toEqual({ success: true, data: { id: 'jf-alice', username: 'alice' } })
      expect(mockAuthenticateJellyfinUser).toHaveBeenCalledWith(
        { url: SERVER.url, apiKey: SERVER.apiKey },
        'alice',
        'correct-password'
      )
    })

    it('passes the connection error through', async () => {
      mockAuthenticateJellyfinUser.mockResolvedValue({ success: false, error: 'Invalid username or password' })

      await expect(authenticateJellyfin('alice', 'wrong')).resolves.toEqual({
        success: false,
        error: 'Invalid username or password',
      })
    })

    it('does not contact Jellyfin when sign-in is turned off', async () => {
      mockFindFirst.mockResolvedValue({ ...SERVER, enabledForLogin: false })

      const result = await authenticateJellyfin('alice', 'correct-password')

      expect(result).toEqual({ success: false, error: 'Jellyfin sign-in is not available' })
      expect(mockAuthenticateJellyfinUser).not.toHaveBeenCalled()
    })

    it('rejects malformed credentials before reading the server', async () => {
      const result = await authenticateJellyfin('a'.repeat(101), 'password')

      expect(result).toEqual({ success: false, error: 'Username is too long' })
      expect(mockFindFirst).not.toHaveBeenCalled()
      expect(mockAuthenticateJellyfinUser).not.toHaveBeenCalled()
    })

    it('returns a generic error when the server lookup throws', async () => {
      mockFindFirst.mockRejectedValue(new Error('connection terminated'))

      await expect(authenticateJellyfin('alice', 'password')).resolves.toEqual({
        success: false,
        error: 'An unexpected error occurred during authentication',
      })
    })
  })

  describe('isJellyfinAdmin', () => {
    it("is true for the server's recorded admin without a Jellyfin request", async () => {
      await expect(isJellyfinAdmin('jf-owner')).resolves.toBe(true)
      expect(mockGetJellyfinUserById).not.toHaveBeenCalled()
    })

    it("reads the user's policy from the stored server", async () => {
      mockGetJellyfinUserById.mockResolvedValue({ success: true, data: jellyfinUser('jf-bob', 'bob', true) })

      await expect(isJellyfinAdmin('jf-bob')).resolves.toBe(true)
      expect(mockGetJellyfinUserById).toHaveBeenCalledWith({ url: SERVER.url, apiKey: SERVER.apiKey }, 'jf-bob')
    })

    it('is false for a user without IsAdministrator', async () => {
      mockGetJellyfinUserById.mockResolvedValue({ success: true, data: jellyfinUser('jf-carol', 'carol', false) })

      await expect(isJellyfinAdmin('jf-carol')).resolves.toBe(false)
    })

    it('is false when the user lookup fails', async () => {
      mockGetJellyfinUserById.mockResolvedValue({ success: false, error: 'User not found' })

      await expect(isJellyfinAdmin('jf-dave')).resolves.toBe(false)
    })

    it('is false when no server is active', async () => {
      mockFindFirst.mockResolvedValue(null)

      await expect(isJellyfinAdmin('jf-owner')).resolves.toBe(false)
      expect(mockGetJellyfinUserById).not.toHaveBeenCalled()
    })
  })
})
