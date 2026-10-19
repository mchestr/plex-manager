import { checkServerAccess, isSubscriptionGatingEnabled } from '@/actions/auth'
import { checkUserServerAccess, getPlexUserInfo } from '@/lib/connections/plex'
import {
  makePlexUserInfo,
  makePrismaPlexServer,
} from '../utils/test-builders'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock('next-auth', () => ({ getServerSession: jest.fn().mockResolvedValue(null) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

jest.mock('@/lib/connections/plex', () => ({
  checkUserServerAccess: jest.fn(),
  getPlexUserInfo: jest.fn(),
}))

const mockPrisma = prismaMock
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

    const result = await checkServerAccess({ token: 'user-token-123', isInviteFlow: false })

    expect(result).toEqual({ success: true, data: { hasAccess: true } })
    expect(mockGetPlexUserInfo).toHaveBeenCalledWith('user-token-123')
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

    const result = await checkServerAccess({ token: 'user-token-123', isInviteFlow: false })

    expect(result).toEqual({ success: false, code: 'NOT_FOUND', error: 'No Plex server is configured.' })
    expect(mockGetPlexUserInfo).not.toHaveBeenCalled()
  })

  it('should return error when user info fetch fails', async () => {
    const mockPlexServer = makePrismaPlexServer()

    mockPrisma.plexServer.findFirst.mockResolvedValue(mockPlexServer as any)
    mockGetPlexUserInfo.mockResolvedValue({
      success: false,
      error: 'Failed to fetch user info',
    })

    const result = await checkServerAccess({ token: 'user-token-123', isInviteFlow: false })

    expect(result).toMatchObject({ success: false, code: 'UPSTREAM_UNAVAILABLE' })
    expect(JSON.stringify(result)).not.toContain('Failed to fetch user info')
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

    const result = await checkServerAccess({ token: 'user-token-123', isInviteFlow: false })

    expect(result).toEqual({ success: true, data: { hasAccess: false } })
  })

  it('never echoes an internal error (SEC-20)', async () => {
    mockPrisma.plexServer.findFirst.mockRejectedValue(new Error("Can't reach database server at db:5432"))

    const result = await checkServerAccess({ token: 'user-token-123', isInviteFlow: false })

    expect(result).toMatchObject({ success: false, code: 'INTERNAL' })
    expect(JSON.stringify(result)).not.toContain('db:5432')
  })

  it('fails a check plex.tv could not complete instead of guessing', async () => {
    mockPrisma.plexServer.findFirst.mockResolvedValue(makePrismaPlexServer() as any)
    mockGetPlexUserInfo.mockResolvedValue({ success: true, data: makePlexUserInfo() })
    mockCheckUserServerAccess.mockResolvedValue({ success: false, hasAccess: false, error: 'ECONNRESET 10.0.0.5' })

    const result = await checkServerAccess({ token: 'user-token-123', isInviteFlow: false })

    expect(result).toMatchObject({ success: false, code: 'UPSTREAM_UNAVAILABLE' })
    expect(JSON.stringify(result)).not.toContain('10.0.0.5')
  })

  it.each([
    ['a caller-chosen delay', { token: 'user-token-123', isInviteFlow: true, initialDelay: 600000 }],
    ['caller-chosen retries', { token: 'user-token-123', isInviteFlow: true, maxRetries: 1000 }],
    ['a short token', { token: 'x', isInviteFlow: false }],
    ['a missing flow flag', { token: 'user-token-123' }],
  ])('refuses %s before doing anything (SEC-19)', async (_label, input) => {
    const started = Date.now()
    // A hostile caller is not bound by the parameter type
    const result = await checkServerAccess(input as Parameters<typeof checkServerAccess>[0])

    expect(result).toMatchObject({ success: false, code: 'VALIDATION' })
    expect(Date.now() - started).toBeLessThan(100)
    expect(mockPrisma.plexServer.findFirst).not.toHaveBeenCalled()
  })

  it('should handle non-Error exceptions', async () => {
    mockPrisma.plexServer.findFirst.mockRejectedValue('String error')

    const result = await checkServerAccess({ token: 'user-token-123', isInviteFlow: false })

    expect(result).toEqual({
      success: false,
      code: 'INTERNAL',
      error: "We couldn't check your access to the server. Please try again.",
    })
  })
})

describe('isSubscriptionGatingEnabled', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns true when Stripe gating is enabled', async () => {
    mockPrisma.config.findUnique.mockResolvedValue({ stripeEnabled: true } as any)

    await expect(isSubscriptionGatingEnabled()).resolves.toEqual({ success: true, data: true })
    expect(mockPrisma.config.findUnique).toHaveBeenCalledWith({
      where: { id: 'config' },
      select: { stripeEnabled: true },
    })
  })

  it('returns false when Stripe gating is disabled', async () => {
    mockPrisma.config.findUnique.mockResolvedValue({ stripeEnabled: false } as any)

    await expect(isSubscriptionGatingEnabled()).resolves.toEqual({ success: true, data: false })
  })

  it('returns false when there is no config row', async () => {
    mockPrisma.config.findUnique.mockResolvedValue(null)

    await expect(isSubscriptionGatingEnabled()).resolves.toEqual({ success: true, data: false })
  })

  it('fails closed (not success) on a database error', async () => {
    mockPrisma.config.findUnique.mockRejectedValue(new Error('Database error'))

    await expect(isSubscriptionGatingEnabled()).resolves.toMatchObject({ success: false, code: 'INTERNAL' })
  })
})

