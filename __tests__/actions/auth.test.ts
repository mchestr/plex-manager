import { checkServerAccess } from '@/actions/auth'
import { prisma } from '@/lib/prisma'
import { checkUserServerAccess, getPlexUserInfo } from '@/lib/connections/plex'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    plexServer: {
      findFirst: jest.fn(),
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
    const mockPlexServer = {
      id: 'server-1',
      hostname: 'plex.example.com',
      port: 32400,
      protocol: 'https' as const,
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
        hostname: 'plex.example.com',
        port: 32400,
        protocol: 'https',
        token: 'server-token',
        adminPlexUserId: 'admin-plex-id',
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
    const mockPlexServer = {
      id: 'server-1',
      hostname: 'plex.example.com',
      port: 32400,
      protocol: 'https' as const,
      token: 'server-token',
      adminPlexUserId: 'admin-plex-id',
      isActive: true,
    }

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
      hostname: 'plex.example.com',
      port: 32400,
      protocol: 'https' as const,
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

