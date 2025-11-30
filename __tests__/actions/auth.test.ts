import { checkServerAccess } from '@/actions/auth'
import { checkUserServerAccess, getPlexUserInfo } from '@/lib/connections/plex'
import { getActivePlexService } from '@/lib/services/service-helpers'
import {
  makePlexUserInfo,
  makePrismaPlexServer,
} from '../utils/test-builders'

jest.mock('@/lib/services/service-helpers', () => ({
  getActivePlexService: jest.fn(),
}))

jest.mock('@/lib/connections/plex', () => ({
  checkUserServerAccess: jest.fn(),
  getPlexUserInfo: jest.fn(),
}))

const mockGetActivePlexService = getActivePlexService as jest.MockedFunction<typeof getActivePlexService>
const mockCheckUserServerAccess = checkUserServerAccess as jest.MockedFunction<typeof checkUserServerAccess>
const mockGetPlexUserInfo = getPlexUserInfo as jest.MockedFunction<typeof getPlexUserInfo>

describe('checkServerAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return success when user has access', async () => {
    const mockPlexService = {
      id: 'plex-1',
      name: 'Test Server',
      url: 'https://plex.example.com:32400',
      isActive: true,
      config: {
        token: 'server-token',
        adminPlexUserId: 'admin-plex-id',
      },
    }
    const mockPlexUser = makePlexUserInfo({
      id: 'plex-user-1',
    })

    mockGetActivePlexService.mockResolvedValue(mockPlexService as any)
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
        url: mockPlexService.url,
        token: mockPlexService.config.token,
        adminPlexUserId: mockPlexService.config.adminPlexUserId,
      },
      'plex-user-1'
    )
  })

  it('should return error when no Plex server is configured', async () => {
    mockGetActivePlexService.mockResolvedValue(null)

    const result = await checkServerAccess('user-token')

    expect(result).toEqual({
      success: false,
      hasAccess: false,
      error: 'No Plex server configured',
    })
    expect(mockGetPlexUserInfo).not.toHaveBeenCalled()
  })

  it('should return error when user info fetch fails', async () => {
    const mockPlexService = {
      id: 'plex-1',
      name: 'Test Server',
      url: 'https://plex.example.com:32400',
      isActive: true,
      config: {
        token: 'server-token',
        adminPlexUserId: 'admin-plex-id',
      },
    }

    mockGetActivePlexService.mockResolvedValue(mockPlexService as any)
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
    const mockPlexService = {
      id: 'plex-1',
      name: 'Test Server',
      url: 'https://plex.example.com:32400',
      isActive: true,
      config: {
        token: 'server-token',
        adminPlexUserId: 'admin-plex-id',
      },
    }

    const mockPlexUser = {
      id: 'plex-user-1',
      username: 'testuser',
      email: 'test@example.com',
      thumb: 'https://example.com/thumb.jpg',
    }

    mockGetActivePlexService.mockResolvedValue(mockPlexService as any)
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
    mockGetActivePlexService.mockRejectedValue(new Error('Database error'))

    const result = await checkServerAccess('user-token')

    expect(result).toEqual({
      success: false,
      hasAccess: false,
      error: 'Database error',
    })
  })

  it('should handle non-Error exceptions', async () => {
    mockGetActivePlexService.mockRejectedValue('String error')

    const result = await checkServerAccess('user-token')

    expect(result).toEqual({
      success: false,
      hasAccess: false,
      error: 'Failed to check server access',
    })
  })
})

