import { checkServerAccess, isSubscriptionGatingEnabled } from '@/actions/auth'
import { checkUserServerAccess, getPlexUserInfo } from '@/lib/connections/plex'
import { prisma } from '@/lib/prisma'
import {
  makePlexUserInfo,
  makePrismaPlexServer,
} from '../utils/test-builders'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    plexServer: {
      findFirst: jest.fn(),
    },
    config: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/lib/connections/plex', () => ({
  checkUserServerAccess: jest.fn(),
  getPlexUserInfo: jest.fn(),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockCheckUserServerAccess = checkUserServerAccess as jest.MockedFunction<typeof checkUserServerAccess>
const mockGetPlexUserInfo = getPlexUserInfo as jest.MockedFunction<typeof getPlexUserInfo>

describe('checkServerAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return success when user has access', async () => {
    const mockPlexServer = makePrismaPlexServer()
    const mockPlexUser = makePlexUserInfo({
      id: 'plex-user-1',
    })

    mockPrisma.plexServer.findFirst.mockResolvedValue(mockPlexServer as any)
    mockGetPlexUserInfo.mockResolvedValue({
      success: true,
      data: mockPlexUser,
    })
    mockCheckUserServerAccess.mockResolvedValue({
      success: true,
      hasAccess: true,
    })

    const result = await checkServerAccess('user-token')

    expect(result).toEqual({
      success: true,
      hasAccess: true,
    })
    expect(mockGetPlexUserInfo).toHaveBeenCalledWith('user-token')
    expect(mockCheckUserServerAccess).toHaveBeenCalledWith(
      {
        url: mockPlexServer.url,
        token: mockPlexServer.token,
        adminPlexUserId: mockPlexServer.adminPlexUserId,
      },
      'plex-user-1'
    )
  })

  it('should return error when no Plex server is configured', async () => {
    mockPrisma.plexServer.findFirst.mockResolvedValue(null)

    const result = await checkServerAccess('user-token')

    expect(result).toEqual({
      success: false,
      hasAccess: false,
      error: 'No Plex server configured',
    })
    expect(mockGetPlexUserInfo).not.toHaveBeenCalled()
  })

  it('should return error when user info fetch fails', async () => {
    const mockPlexServer = makePrismaPlexServer()

    mockPrisma.plexServer.findFirst.mockResolvedValue(mockPlexServer as any)
    mockGetPlexUserInfo.mockResolvedValue({
      success: false,
      error: 'Failed to fetch user info',
    })

    const result = await checkServerAccess('user-token')

    expect(result).toEqual({
      success: false,
      hasAccess: false,
      error: 'Failed to fetch user info',
    })
    expect(mockCheckUserServerAccess).not.toHaveBeenCalled()
  })

  it('should return error when user does not have access', async () => {
    const mockPlexServer = {
      id: 'server-1',
      url: 'https://plex.example.com:32400',
      token: 'server-token',
      adminPlexUserId: 'admin-plex-id',
      isActive: true,
    }

    const mockPlexUser = {
      id: 'plex-user-1',
      username: 'testuser',
      email: 'test@example.com',
      thumb: 'https://example.com/thumb.jpg',
    }

    mockPrisma.plexServer.findFirst.mockResolvedValue(mockPlexServer as any)
    mockGetPlexUserInfo.mockResolvedValue({
      success: true,
      data: mockPlexUser,
    })
    mockCheckUserServerAccess.mockResolvedValue({
      success: true,
      hasAccess: false,
      error: 'User not found in server',
    })

    const result = await checkServerAccess('user-token')

    expect(result).toEqual({
      success: true,
      hasAccess: false,
      error: 'User not found in server',
    })
  })

  it('should handle errors gracefully', async () => {
    mockPrisma.plexServer.findFirst.mockRejectedValue(new Error('Database error'))

    const result = await checkServerAccess('user-token')

    expect(result).toEqual({
      success: false,
      hasAccess: false,
      error: 'Database error',
    })
  })

  it('should handle non-Error exceptions', async () => {
    mockPrisma.plexServer.findFirst.mockRejectedValue('String error')

    const result = await checkServerAccess('user-token')

    expect(result).toEqual({
      success: false,
      hasAccess: false,
      error: 'Failed to check server access',
    })
  })
})

describe('isSubscriptionGatingEnabled', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns true when Stripe gating is enabled', async () => {
    mockPrisma.config.findUnique.mockResolvedValue({ stripeEnabled: true } as any)

    await expect(isSubscriptionGatingEnabled()).resolves.toBe(true)
    expect(mockPrisma.config.findUnique).toHaveBeenCalledWith({
      where: { id: 'config' },
      select: { stripeEnabled: true },
    })
  })

  it('returns false when Stripe gating is disabled', async () => {
    mockPrisma.config.findUnique.mockResolvedValue({ stripeEnabled: false } as any)

    await expect(isSubscriptionGatingEnabled()).resolves.toBe(false)
  })

  it('returns false when there is no config row', async () => {
    mockPrisma.config.findUnique.mockResolvedValue(null)

    await expect(isSubscriptionGatingEnabled()).resolves.toBe(false)
  })

  it('fails closed (returns false) on a database error', async () => {
    mockPrisma.config.findUnique.mockRejectedValue(new Error('Database error'))

    await expect(isSubscriptionGatingEnabled()).resolves.toBe(false)
  })
})

