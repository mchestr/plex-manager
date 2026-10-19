/**
 * @jest-environment node
 */

/**
 * lib/jellyfin-auth.ts reads the stored Jellyfin server itself (SEC-35): no
 * caller passes the URL or API key a sign-in or admin check goes to. A
 * sign-in reads the server once, so the password and the admin status are
 * checked against the same row.
 */

import { authenticateJellyfinUser, getJellyfinUserById } from '@/lib/connections/jellyfin-users'
import { authenticateJellyfin, getJellyfinLoginServer } from '@/lib/jellyfin-auth'
import { prisma } from '@/lib/prisma'
import type { JellyfinUser } from '@/lib/validations/jellyfin'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

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
    /** Jellyfin accepts the password and returns `user`'s ID and name. */
    function jellyfinAccepts(user: JellyfinUser) {
      mockAuthenticateJellyfinUser.mockResolvedValue({
        success: true,
        data: { User: { Id: user.Id, Name: user.Name }, AccessToken: 'already-logged-out' },
      })
    }

    it('signs in against the stored server and returns no access token', async () => {
      jellyfinAccepts(jellyfinUser('jf-alice', 'alice', false))
      mockGetJellyfinUserById.mockResolvedValue({ success: true, data: jellyfinUser('jf-alice', 'alice', false) })

      const result = await authenticateJellyfin(' alice ', 'correct-password')

      expect(result).toEqual({ success: true, data: { id: 'jf-alice', username: 'alice', isAdmin: false } })
      expect(mockAuthenticateJellyfinUser).toHaveBeenCalledWith(
        { url: SERVER.url, apiKey: SERVER.apiKey },
        'alice',
        'correct-password'
      )
    })

    it('reads the server once and checks the admin status against the same row', async () => {
      const other = { ...SERVER, id: 'jf-server-2', url: 'http://other.local:8096', apiKey: 'other-key' }
      mockFindFirst.mockResolvedValueOnce(SERVER).mockResolvedValue(other)
      jellyfinAccepts(jellyfinUser('jf-bob', 'bob', true))
      mockGetJellyfinUserById.mockResolvedValue({ success: true, data: jellyfinUser('jf-bob', 'bob', true) })

      const result = await authenticateJellyfin('bob', 'correct-password')

      expect(result).toEqual({ success: true, data: { id: 'jf-bob', username: 'bob', isAdmin: true } })
      expect(mockFindFirst).toHaveBeenCalledTimes(1)
      expect(mockGetJellyfinUserById).toHaveBeenCalledWith({ url: SERVER.url, apiKey: SERVER.apiKey }, 'jf-bob')
    })

    it("marks the server's recorded admin without a Jellyfin user lookup", async () => {
      jellyfinAccepts(jellyfinUser('jf-owner', 'owner', false))

      const result = await authenticateJellyfin('owner', 'correct-password')

      expect(result).toEqual({ success: true, data: { id: 'jf-owner', username: 'owner', isAdmin: true } })
      expect(mockGetJellyfinUserById).not.toHaveBeenCalled()
    })

    it('is not admin for a user without IsAdministrator', async () => {
      jellyfinAccepts(jellyfinUser('jf-carol', 'carol', false))
      mockGetJellyfinUserById.mockResolvedValue({ success: true, data: jellyfinUser('jf-carol', 'carol', false) })

      const result = await authenticateJellyfin('carol', 'correct-password')

      expect(result.data?.isAdmin).toBe(false)
    })

    it('still signs in, as not admin, when the admin lookup fails', async () => {
      jellyfinAccepts(jellyfinUser('jf-dave', 'dave', true))
      mockGetJellyfinUserById.mockResolvedValue({ success: false, error: 'User not found' })

      const result = await authenticateJellyfin('dave', 'correct-password')

      expect(result).toEqual({ success: true, data: { id: 'jf-dave', username: 'dave', isAdmin: false } })
    })

    it('still signs in, as not admin, when the admin lookup throws', async () => {
      jellyfinAccepts(jellyfinUser('jf-erin', 'erin', true))
      mockGetJellyfinUserById.mockRejectedValue(new Error('socket hang up'))

      const result = await authenticateJellyfin('erin', 'correct-password')

      expect(result).toEqual({ success: true, data: { id: 'jf-erin', username: 'erin', isAdmin: false } })
    })

    it('passes the connection error through without an admin lookup', async () => {
      mockAuthenticateJellyfinUser.mockResolvedValue({ success: false, error: 'Invalid username or password' })

      await expect(authenticateJellyfin('alice', 'wrong')).resolves.toEqual({
        success: false,
        error: 'Invalid username or password',
      })
      expect(mockGetJellyfinUserById).not.toHaveBeenCalled()
    })

    it('does not contact Jellyfin when sign-in is turned off', async () => {
      mockFindFirst.mockResolvedValue({ ...SERVER, enabledForLogin: false })

      const result = await authenticateJellyfin('alice', 'correct-password')

      expect(result).toEqual({ success: false, error: 'Jellyfin sign-in is not available' })
      expect(mockAuthenticateJellyfinUser).not.toHaveBeenCalled()
      expect(mockGetJellyfinUserById).not.toHaveBeenCalled()
    })

    it('does not contact Jellyfin when no server is active', async () => {
      mockFindFirst.mockResolvedValue(null)

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
})
