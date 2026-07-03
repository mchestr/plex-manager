import { authOptions } from '@/lib/auth'
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

/**
 * Resolve the Plex provider's `authorize` function from the NextAuth options.
 * next-auth normalizes every CredentialsProvider to a top-level `id`/`name` of
 * "credentials", preserving the configured name at `options.name` — so the Plex
 * provider is identified by `options.name === 'Plex'`. `authorize` is available
 * at the top level (with `options.authorize` as a cross-version fallback).
 */
function getPlexAuthorize() {
  const provider = authOptions.providers.find(
    (p) => (p as { options?: { name?: string } }).options?.name === 'Plex'
  ) as { authorize?: unknown; options?: { authorize?: unknown } } | undefined
  // Prefer `options.authorize` — that's our raw handler. `provider.authorize`
  // is next-auth's wrapper, which coerces/validates credentials and would not
  // invoke our logic with a plain object.
  const authorize = (provider?.options?.authorize ?? provider?.authorize) as (
    credentials: Record<string, string> | undefined,
    req?: unknown
  ) => Promise<unknown>
  if (typeof authorize !== 'function') {
    throw new Error('Plex authorize function not found on authOptions')
  }
  return authorize
}

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

describe('Plex authorize access relaxation', () => {
  const authorize = getPlexAuthorize()
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    jest.clearAllMocks()
    // Disable the authorize() TEST MODE BYPASS so the real Plex access-check /
    // ACCESS_DENIED path runs. The bypass triggers when NODE_ENV === 'test'
    // (jest's default) OR ENABLE_TEST_AUTH === 'true', so both must be cleared.
    delete process.env.ENABLE_TEST_AUTH
    ;(process.env as { NODE_ENV?: string }).NODE_ENV = 'development'
    mockPrisma.plexServer.findFirst.mockResolvedValue(PLEX_SERVER as never)
    mockGetPlexUserInfo.mockResolvedValue({ success: true, data: NON_MEMBER } as never)
  })

  afterEach(() => {
    ;(process.env as { NODE_ENV?: string }).NODE_ENV = originalNodeEnv
  })

  it('throws ACCESS_DENIED for a non-member when stripe is disabled', async () => {
    mockCheckUserServerAccess.mockResolvedValue({
      success: true,
      hasAccess: false,
      error: 'User does not have access to this server',
    })
    mockPrisma.config.findUnique.mockResolvedValue({ stripeEnabled: false })

    await expect(authorize({ authToken: 'tok' })).rejects.toThrow('ACCESS_DENIED')
    expect(mockPrisma.user.create).not.toHaveBeenCalled()
  })

  it('throws ACCESS_DENIED for a non-member when config row is missing', async () => {
    mockCheckUserServerAccess.mockResolvedValue({ success: true, hasAccess: false })
    mockPrisma.config.findUnique.mockResolvedValue(null)

    await expect(authorize({ authToken: 'tok' })).rejects.toThrow('ACCESS_DENIED')
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

    const result = (await authorize({ authToken: 'tok' })) as { id: string; isAdmin: boolean }

    expect(result).toMatchObject({ id: 'db-user-99', isAdmin: false })
    expect(mockPrisma.user.create).toHaveBeenCalled()
  })

  it('throws ACCESS_DENIED when the access check fails (API error), regardless of flag', async () => {
    mockCheckUserServerAccess.mockResolvedValue({
      success: false,
      hasAccess: false,
      error: 'Failed to fetch users',
    })
    // Even with stripe enabled, a failed check must not admit the user.
    mockPrisma.config.findUnique.mockResolvedValue({ stripeEnabled: true })

    await expect(authorize({ authToken: 'tok' })).rejects.toThrow('ACCESS_DENIED')
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

    const result = (await authorize({ authToken: 'tok' })) as { id: string }

    expect(result).toMatchObject({ id: 'db-user-1' })
    expect(mockPrisma.config.findUnique).not.toHaveBeenCalled()
  })
})
