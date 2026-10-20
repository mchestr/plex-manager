import { signInWithPlexToken } from '@/__tests__/helpers/plex-sign-in'
import { checkUserServerAccess, getPlexUserInfo } from '@/lib/connections/plex'
import { prisma } from '@/lib/prisma'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    plexServer: {
      findFirst: jest.fn(),
    },
    config: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}))

jest.mock('@/lib/connections/plex-pin', () => ({ readPin: jest.fn() }))

jest.mock('@/lib/connections/plex', () => ({
  checkUserServerAccess: jest.fn(),
  getPlexUserInfo: jest.fn(),
}))

// Auth flow lazily imports the audit log; stub so it never touches real deps.
jest.mock('@/lib/security/audit-log', () => ({
  logAuditEvent: jest.fn(),
  AuditEventType: {
    USER_CREATED: 'USER_CREATED',
    ADMIN_PRIVILEGE_GRANTED: 'ADMIN_PRIVILEGE_GRANTED',
    ADMIN_PRIVILEGE_REVOKED: 'ADMIN_PRIVILEGE_REVOKED',
  },
}))

const mockPrisma = prisma as unknown as {
  plexServer: { findFirst: jest.Mock }
  config: { findUnique: jest.Mock }
  user: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock }
}
const mockCheckUserServerAccess = checkUserServerAccess as jest.MockedFunction<
  typeof checkUserServerAccess
>
const mockGetPlexUserInfo = getPlexUserInfo as jest.MockedFunction<typeof getPlexUserInfo>

const PLEX_SERVER = {
  id: 'server-1',
  url: 'https://plex.example.com:32400',
  token: 'server-token',
  adminPlexUserId: 'admin-plex-id',
  isActive: true,
}

const NON_MEMBER = {
  id: 'plex-user-99',
  username: 'nonmember',
  email: 'nonmember@example.com',
  thumb: 'https://example.com/thumb.jpg',
}

const env = process.env as Record<string, string | undefined>
const originalNodeEnv = env.NODE_ENV

/**
 * Runs authorize() under Jest's default NODE_ENV=test without E2E test mode.
 */
function disableTestLogin() {
  delete env.E2E_TEST_MODE
  env.NODE_ENV = 'test'
}

afterEach(() => {
  env.NODE_ENV = originalNodeEnv
  delete env.E2E_TEST_MODE
})

describe('Plex authorize access relaxation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    disableTestLogin()
    mockPrisma.plexServer.findFirst.mockResolvedValue(PLEX_SERVER as never)
    mockGetPlexUserInfo.mockResolvedValue({ success: true, data: NON_MEMBER } as never)
  })

  it('throws access_denied for a non-member when stripe is disabled', async () => {
    mockCheckUserServerAccess.mockResolvedValue({
      success: true,
      hasAccess: false,
      error: 'User does not have access to this server',
    })
    mockPrisma.config.findUnique.mockResolvedValue({ stripeEnabled: false })

    await expect(signInWithPlexToken('tok')).rejects.toThrow('access_denied')
    expect(mockPrisma.user.create).not.toHaveBeenCalled()
  })

  it('throws access_denied for a non-member when config row is missing', async () => {
    mockCheckUserServerAccess.mockResolvedValue({ success: true, hasAccess: false })
    mockPrisma.config.findUnique.mockResolvedValue(null)

    await expect(signInWithPlexToken('tok')).rejects.toThrow('access_denied')
  })

  it('allows a non-member session when stripe is enabled (creates user)', async () => {
    mockCheckUserServerAccess.mockResolvedValue({ success: true, hasAccess: false })
    mockPrisma.config.findUnique.mockResolvedValue({ stripeEnabled: true })
    mockPrisma.user.findUnique.mockResolvedValue(null)
    mockPrisma.user.create.mockResolvedValue({
      id: 'db-user-99',
      email: NON_MEMBER.email,
      name: NON_MEMBER.username,
      image: NON_MEMBER.thumb,
      isAdmin: false,
    } as never)

    const result = (await signInWithPlexToken('tok')) as { id: string; isAdmin: boolean }

    expect(result).toMatchObject({ id: 'db-user-99', isAdmin: false })
    expect(mockPrisma.user.create).toHaveBeenCalled()
  })

  it('throws access_denied when the access check fails (API error), regardless of flag', async () => {
    mockCheckUserServerAccess.mockResolvedValue({
      success: false,
      hasAccess: false,
      error: 'Failed to fetch users',
    })
    // Even with stripe enabled, a failed check must not admit the user.
    mockPrisma.config.findUnique.mockResolvedValue({ stripeEnabled: true })

    await expect(signInWithPlexToken('tok')).rejects.toThrow('access_denied')
    // Config should not even be consulted for a hard failure.
    expect(mockPrisma.config.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.user.create).not.toHaveBeenCalled()
  })

  it('signs in a member normally and does not consult the stripe flag', async () => {
    mockCheckUserServerAccess.mockResolvedValue({ success: true, hasAccess: true })
    mockPrisma.user.findUnique.mockResolvedValue(null)
    mockPrisma.user.create.mockResolvedValue({
      id: 'db-user-1',
      email: NON_MEMBER.email,
      name: NON_MEMBER.username,
      image: NON_MEMBER.thumb,
      isAdmin: false,
    } as never)

    const result = (await signInWithPlexToken('tok')) as { id: string }

    expect(result).toMatchObject({ id: 'db-user-1' })
    expect(mockPrisma.config.findUnique).not.toHaveBeenCalled()
  })
})

describe('Plex authorize has no test-token login', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    disableTestLogin()
    mockPrisma.plexServer.findFirst.mockResolvedValue(PLEX_SERVER as never)
    // A real Plex rejects the old literal test token.
    mockGetPlexUserInfo.mockResolvedValue({ success: false, error: 'Unauthorized' } as never)
  })

  it.each([
    ['unset', undefined],
    ['true', 'true'],
  ])('sends TEST_ADMIN_TOKEN to Plex with E2E_TEST_MODE %s', async (_label, flag) => {
    if (flag) env.E2E_TEST_MODE = flag

    const result = await signInWithPlexToken('TEST_ADMIN_TOKEN')

    expect(result).toBeNull()
    expect(mockGetPlexUserInfo).toHaveBeenCalledWith('TEST_ADMIN_TOKEN')
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalledWith({
      where: { email: 'admin@example.com' },
    })
  })
})
