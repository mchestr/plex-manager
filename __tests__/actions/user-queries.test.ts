import { getUserPlexWrapped, getAllUsersWithWrapped, unshareUserLibrary } from '@/actions/user-queries'
import { requireAdmin } from '@/lib/admin'
import { getPlexServerIdentity, getPlexUsers, unshareUserFromPlexServer } from '@/lib/connections/plex'
import { buildPlexServer, buildUser } from '@/__tests__/helpers/factories'
import { aggregateLlmUsage } from '@/lib/utils'
import { usageTotalsByUser, usageTotalsForWrapped } from '@/lib/llm/usage-totals'
import { getServerSession } from 'next-auth'
import { makePrismaUser, makePrismaWrapped, makePrismaLlmUsage } from '../utils/test-builders'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/admin', () => ({
  requireAdmin: jest.fn(),
}))

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
// Usage totals come from aggregate queries (P7.8, BP-28); lib/llm/__tests__/usage-totals.pg.test.ts covers the sums.
jest.mock('@/lib/llm/usage-totals', () => ({
  usageTotalsByUser: jest.fn(async () => new Map()),
  usageTotalsForWrapped: jest.fn(async () => new Map()),
}))

beforeEach(() => mockReset(prismaMock))

jest.mock('@/lib/connections/plex', () => ({
  checkUserServerAccess: jest.fn(),
  getPlexServerIdentity: jest.fn(),
  getPlexUsers: jest.fn(),
  unshareUserFromPlexServer: jest.fn(),
}))

const mockPrisma = prismaMock

/** The row the action returns, or null for no row or a failure. */
async function read(userId: string, year: number) {
  const result = await getUserPlexWrapped({ userId, year })
  return result.success ? result.data : null
}

describe('getUserPlexWrapped', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2024-06-01T12:00:00Z'))
    jest.clearAllMocks()
    // These tests request user-1's own wrapped; mock the owning session so the
    // ownership check inside getUserPlexWrapped passes.
    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-1', isAdmin: false },
    })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should return wrapped for user and year', async () => {
    const mockWrapped = makePrismaWrapped({
      userId: 'user-1',
      year: 2024,
      user: {
        id: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
        image: null,
      },
    })

    mockPrisma.plexWrapped.findUnique.mockResolvedValue(mockWrapped as any)

    const result = await read('user-1', 2024)

    expect(result).toEqual(mockWrapped)
    expect(mockPrisma.plexWrapped.findUnique).toHaveBeenCalledWith({
      where: {
        userId_year: {
          userId: 'user-1',
          year: 2024,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    })
  })

  it("drops a legacy row's leaderboards before the data leaves the server", async () => {
    const data = {
      version: 2,
      userName: 'Test User',
      statistics: {
        moviesWatched: 3,
        leaderboards: { watchTime: { leaderboard: [{ friendly_name: 'Someone Else', total_minutes: 900 }] } },
      },
    }
    mockPrisma.plexWrapped.findUnique.mockResolvedValue(
      makePrismaWrapped({ userId: 'user-1', year: 2024, data: JSON.stringify(data) }) as any
    )

    const result = await read('user-1', 2024)

    // Re-serialised from the stored-data parser, which drops leaderboards
    const visible = JSON.parse(result!.data)
    expect(visible).toMatchObject({ version: 2, userName: 'Test User', statistics: { moviesWatched: 3 } })
    expect(visible.statistics).not.toHaveProperty('leaderboards')
    expect(result!.data).not.toContain('Someone Else')
  })

  // P0.14: no calendar default. In January the caller's season year (2026)
  // is looked up, not the new calendar year.
  it('looks up the year it is given, not the calendar year', async () => {
    jest.setSystemTime(new Date('2027-01-02T12:00:00Z'))
    mockPrisma.plexWrapped.findUnique.mockResolvedValue(null)

    await read('user-1', 2026)

    expect(mockPrisma.plexWrapped.findUnique).toHaveBeenCalledWith({
      where: {
        userId_year: {
          userId: 'user-1',
          year: 2026,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    })
  })

  it('should return null when wrapped not found', async () => {
    mockPrisma.plexWrapped.findUnique.mockResolvedValue(null)

    const result = await read('user-1', 2024)

    expect(result).toBeNull()
  })

  it('should return null on error', async () => {
    mockPrisma.plexWrapped.findUnique.mockRejectedValue(new Error('Database error'))

    const result = await read('user-1', 2024)

    expect(result).toBeNull()
  })

  describe('stored error (P0.9)', () => {
    // A row written before P0.9 still holds the Tautulli roster.
    const LEGACY_ROSTER_ERROR =
      'User not found in Tautulli. Plex User ID: 1, Email: me@example.com. Available users: olga_plex (olga.private@example.com), piet_plex (piet.private@example.com)'

    it('gives a member a stored code, not the legacy roster text', async () => {
      mockPrisma.plexWrapped.findUnique.mockResolvedValue(
        makePrismaWrapped({ status: 'failed', error: LEGACY_ROSTER_ERROR }) as any
      )

      const result = await read('user-1', 2024)

      expect(result?.error).toBe('{"code":"GENERATION_FAILED"}')
      const output = JSON.stringify(result)
      for (const value of ['olga_plex', 'olga.private@example.com', 'piet_plex', 'piet.private@example.com', 'Available users']) {
        expect(output).not.toContain(value)
      }
    })

    it('passes a stored code through to a member unchanged', async () => {
      mockPrisma.plexWrapped.findUnique.mockResolvedValue(
        makePrismaWrapped({ status: 'failed', error: '{"code":"TAUTULLI_USER_NOT_FOUND"}' }) as any
      )

      const result = await read('user-1', 2024)

      expect(result?.error).toBe('{"code":"TAUTULLI_USER_NOT_FOUND"}')
    })

    it('leaves a row without an error untouched', async () => {
      const row = makePrismaWrapped({ status: 'completed', error: null })
      mockPrisma.plexWrapped.findUnique.mockResolvedValue(row as any)

      const result = await read('user-1', 2024)

      expect(result).toEqual(row)
    })

    it('gives an admin the stored text as is', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', isAdmin: true } })
      mockPrisma.plexWrapped.findUnique.mockResolvedValue(
        makePrismaWrapped({ status: 'failed', error: LEGACY_ROSTER_ERROR }) as any
      )

      const result = await read('user-1', 2024)

      expect(result?.error).toBe(LEGACY_ROSTER_ERROR)
    })
  })
})

describe('getAllUsersWithWrapped', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2024-06-01T12:00:00Z'))
    jest.clearAllMocks()
    // No subscriptions by default; fetchSubscriptionMap returns an empty map so
    // the existing (non-subscription) assertions are unaffected.
    mockPrisma.subscription.findMany.mockResolvedValue([])
    mockPrisma.rewindGeneration.findMany.mockResolvedValue([])
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should return all users with wrapped status', async () => {
    const mockUsers = [
      makePrismaUser({
        id: 'user-1',
        name: 'User 1',
        email: 'user1@example.com',
        plexUserId: 'plex-1',
        plexWrapped: [
          makePrismaWrapped({
            id: 'wrapped-1',
            year: 2024,
            status: 'completed',
            generatedAt: new Date(),
            llmUsage: [
              makePrismaLlmUsage({
                totalTokens: 1000,
                promptTokens: 500,
                completionTokens: 500,
                cost: 0.01,
              }),
            ],
          }),
        ],
        llmUsage: [
          makePrismaLlmUsage({
            totalTokens: 1000,
            promptTokens: 500,
            completionTokens: 500,
            cost: 0.01,
          }),
        ],
      }),
    ]

    mockPrisma.user.findMany.mockResolvedValue(mockUsers as any)
    mockPrisma.plexWrapped.findMany.mockResolvedValue([
      {
        userId: 'user-1',
        shareToken: 'token-1',
        _count: {
          shareVisits: 5,
        },
      },
    ] as any)

    const totals = { totalTokens: 1000, promptTokens: 500, completionTokens: 500, cost: 0.01, provider: 'openai', model: 'gpt-4', count: 1 }
    jest.mocked(usageTotalsForWrapped).mockResolvedValueOnce(new Map([['wrapped-1', totals]]))
    jest.mocked(usageTotalsByUser).mockResolvedValueOnce(new Map([['user-1', totals]]))

    const { users: result } = await getAllUsersWithWrapped(2024)

    expect(usageTotalsForWrapped).toHaveBeenCalledWith(['wrapped-1'])
    expect(usageTotalsByUser).toHaveBeenCalledWith(['user-1'])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'user-1',
      name: 'User 1',
      wrappedStatus: 'completed',
      totalWrappedCount: 1,
      totalShares: 1,
      totalVisits: 5,
    })
    expect(result[0].llmUsage).toMatchObject({
      totalTokens: 1000,
      promptTokens: 500,
      completionTokens: 500,
      cost: 0.01,
      provider: 'openai',
      model: 'gpt-4',
      count: 1,
    })
  })

  // P0.14: the year comes from the caller (the season year), never the calendar.
  it('reads the year it is given, not the calendar year', async () => {
    jest.setSystemTime(new Date('2027-01-02T12:00:00Z'))
    const seasonYear = 2026
    mockPrisma.user.findMany.mockResolvedValue([])
    mockPrisma.plexWrapped.findMany.mockResolvedValue([])

    await getAllUsersWithWrapped(seasonYear)

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      orderBy: [
        { isAdmin: 'desc' },
        { name: 'asc' },
      ],
      include: {
        plexWrapped: {
          where: {
            year: seasonYear,
          },
          take: 1,
          select: { id: true, status: true, generatedAt: true },
        },
        _count: {
          select: {
            plexWrapped: true,
          },
        },
      },
    })
  })

  it('should handle users without wrapped', async () => {
    const mockUsers = [
      makePrismaUser({
        id: 'user-1',
        name: 'User 1',
        email: 'user1@example.com',
        plexUserId: 'plex-1',
        plexWrapped: [],
        llmUsage: [],
        _count: {
          plexWrapped: 0,
        },
      }),
    ]

    mockPrisma.user.findMany.mockResolvedValue(mockUsers as any)
    mockPrisma.plexWrapped.findMany.mockResolvedValue([])

    const { users: result } = await getAllUsersWithWrapped(2024)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'user-1',
      wrappedStatus: null,
      totalWrappedCount: 0,
      totalShares: 0,
      totalVisits: 0,
      llmUsage: null,
      totalLlmUsage: null,
    })
  })

  it('should aggregate multiple LLM usage records', async () => {
    const mockUsers = [
      makePrismaUser({
        id: 'user-1',
        name: 'User 1',
        email: 'user1@example.com',
        plexUserId: 'plex-1',
        plexWrapped: [
          makePrismaWrapped({
            id: 'wrapped-1',
            year: 2024,
            status: 'completed',
            generatedAt: new Date(),
            llmUsage: [
              makePrismaLlmUsage({
                totalTokens: 1000,
                promptTokens: 500,
                completionTokens: 500,
                cost: 0.01,
              }),
              makePrismaLlmUsage({
                totalTokens: 2000,
                promptTokens: 1000,
                completionTokens: 1000,
                cost: 0.02,
              }),
            ],
          }),
        ],
        llmUsage: [
          makePrismaLlmUsage({
            totalTokens: 1000,
            promptTokens: 500,
            completionTokens: 500,
            cost: 0.01,
          }),
          makePrismaLlmUsage({
            totalTokens: 2000,
            promptTokens: 1000,
            completionTokens: 1000,
            cost: 0.02,
          }),
        ],
        _count: {
          plexWrapped: 1,
        },
      }),
    ]

    mockPrisma.user.findMany.mockResolvedValue(mockUsers as any)
    mockPrisma.plexWrapped.findMany.mockResolvedValue([])
    jest.mocked(usageTotalsForWrapped).mockResolvedValueOnce(
      new Map([['wrapped-1', { totalTokens: 3000, promptTokens: 1500, completionTokens: 1500, cost: 0.03, provider: 'openai', model: 'gpt-4', count: 2 }]])
    )

    const { users: result } = await getAllUsersWithWrapped(2024)

    expect(result[0].llmUsage).toMatchObject({
      totalTokens: 3000,
      promptTokens: 1500,
      completionTokens: 1500,
      cost: 0.03,
      count: 2,
    })
  })

  it('throws a database failure to the error boundary instead of listing nobody (P10.18)', async () => {
    mockPrisma.user.findMany.mockRejectedValue(new Error('Database error'))

    await expect(getAllUsersWithWrapped(2024)).rejects.toThrow('Database error')
  })

  describe('Plex access check (P10.18)', () => {
    const SERVER = buildPlexServer({ url: 'http://127.0.0.1:9', adminPlexUserId: 'plex-owner' })
    const member = (id: string, plexUserId: string | null, isAdmin = false) => ({
      ...buildUser({ id, plexUserId, isAdmin }),
      plexWrapped: [],
      _count: { plexWrapped: 0 },
    })

    beforeEach(() => {
      mockPrisma.plexWrapped.findMany.mockResolvedValue([])
      mockPrisma.user.findMany.mockResolvedValue([
        member('owner', 'plex-owner', true),
        member('shared', 'plex-shared'),
        member('gone', 'plex-gone'),
        member('local', null),
      ])
    })

    it('reports not-configured with no active server, and every access unknown', async () => {
      mockPrisma.plexServer.findFirst.mockResolvedValue(null)

      const { users, plexCheck } = await getAllUsersWithWrapped(2024)

      expect(plexCheck.status).toBe('not-configured')
      expect(users.map((u) => u.hasPlexAccess)).toEqual([null, null, null, null])
      expect(users.every((u) => !u.isOwner)).toBe(true)
    })

    it('keeps every member, unknown but the owner, when Plex does not answer', async () => {
      mockPrisma.plexServer.findFirst.mockResolvedValue(SERVER)
      jest.mocked(getPlexServerIdentity).mockResolvedValue({ success: false, error: 'ECONNREFUSED' })

      const { users, plexCheck } = await getAllUsersWithWrapped(2024)

      expect(plexCheck.status).toBe('unreachable')
      expect(plexCheck.checkedAt).toEqual(new Date('2024-06-01T12:00:00Z'))
      expect(users).toHaveLength(4)
      expect(users.map((u) => [u.id, u.isOwner, u.hasPlexAccess])).toEqual([
        ['owner', true, true],
        ['shared', false, null],
        ['gone', false, null],
        ['local', false, null],
      ])
    })

    it('reads each share from Plex when it answers', async () => {
      mockPrisma.plexServer.findFirst.mockResolvedValue(SERVER)
      jest.mocked(getPlexServerIdentity).mockResolvedValue({ success: true, machineIdentifier: 'machine-1' })
      jest.mocked(getPlexUsers).mockResolvedValue({
        success: true,
        data: [
          { id: 'plex-shared', username: 'shared', servers: [{ machineIdentifier: 'machine-1' }] },
          { id: 'plex-gone', username: 'gone', servers: [{ machineIdentifier: 'other' }] },
        ],
      })

      const { users, plexCheck } = await getAllUsersWithWrapped(2024)

      expect(plexCheck.status).toBe('ok')
      expect(users.map((u) => u.hasPlexAccess)).toEqual([true, true, false, null])
    })
  })

  it('should calculate share and visit counts correctly', async () => {
    const mockUsers = [
      makePrismaUser({
        id: 'user-1',
        name: 'User 1',
        email: 'user1@example.com',
        plexUserId: 'plex-1',
        plexWrapped: [],
        llmUsage: [],
        _count: {
          plexWrapped: 2,
        },
      }),
    ]

    mockPrisma.user.findMany.mockResolvedValue(mockUsers as any)
    mockPrisma.plexWrapped.findMany.mockResolvedValue([
      {
        userId: 'user-1',
        shareToken: 'token-1',
        _count: {
          shareVisits: 5,
        },
      },
      {
        userId: 'user-1',
        shareToken: 'token-2',
        _count: {
          shareVisits: 10,
        },
      },
      {
        userId: 'user-1',
        shareToken: null, // No share token
        _count: {
          shareVisits: 2,
        },
      },
    ] as any)

    const { users: result } = await getAllUsersWithWrapped(2024)

    expect(result[0].totalShares).toBe(2) // Only wraps with shareToken
    expect(result[0].totalVisits).toBe(17) // Sum of all visits
  })
})

describe('aggregateLlmUsage', () => {
  it('should return null for empty array', () => {
    const result = aggregateLlmUsage([])
    expect(result).toBeNull()
  })

  it('should correctly aggregate usage records', () => {
    const usageRecords = [
      {
        totalTokens: 100,
        promptTokens: 50,
        completionTokens: 50,
        cost: 0.01,
        provider: 'openai',
        model: 'gpt-3.5',
      },
      {
        totalTokens: 200,
        promptTokens: 100,
        completionTokens: 100,
        cost: 0.02,
        provider: 'anthropic',
        model: 'claude-3',
      },
    ]

    const result = aggregateLlmUsage(usageRecords)

    expect(result).toEqual({
      totalTokens: 300,
      promptTokens: 150,
      completionTokens: 150,
      cost: 0.03,
      provider: 'anthropic',
      model: 'claude-3',
      count: 2,
    })
  })
})

describe('unshareUserLibrary', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(requireAdmin as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', isAdmin: true } })
    mockPrisma.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', plexUserId: 'plex-member' }))
    mockPrisma.plexServer.findFirst.mockResolvedValue({
      id: 'ps-1',
      name: 'Plex',
      url: 'https://plex.example.com:32400',
      publicUrl: null,
      token: 'server-token',
      adminPlexUserId: 'plex-owner',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 })
  })

  it("ends the member's sessions after a successful unshare (SEC-10)", async () => {
    ;(unshareUserFromPlexServer as jest.Mock).mockResolvedValue({ success: true, status: 'removed' })

    await expect(unshareUserLibrary('member-1')).resolves.toEqual({ success: true, data: { status: 'removed' } })

    expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'member-1' },
      data: { sessionVersion: { increment: 1 } },
    })
  })

  it('reports a share that is already gone as success, and still ends the sessions', async () => {
    ;(unshareUserFromPlexServer as jest.Mock).mockResolvedValue({ success: true, status: 'already_removed' })

    await expect(unshareUserLibrary('member-1')).resolves.toEqual({
      success: true,
      data: { status: 'already_removed' },
    })
    expect(mockPrisma.user.updateMany).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['PLEX_AUTH', "Plex rejected Plex Manager's token. Reconnect Plex in settings."],
    ['PLEX_UNAVAILABLE', "Plex didn't respond. Try again in a few minutes."],
  ])('returns %s with admin copy and keeps the sessions', async (code, error) => {
    ;(unshareUserFromPlexServer as jest.Mock).mockResolvedValue({ success: false, code })

    await expect(unshareUserLibrary('member-1')).resolves.toEqual({ success: false, code, error })

    expect(mockPrisma.user.updateMany).not.toHaveBeenCalled()
  })

  it('never returns the text of a thrown error', async () => {
    ;(unshareUserFromPlexServer as jest.Mock).mockRejectedValue(new Error('plex.tv said: invalid token abc123'))

    const result = await unshareUserLibrary('member-1')

    expect(result).toEqual({ success: false, code: 'INTERNAL', error: 'Failed to unshare user library' })
  })

  it('refuses an admin with a code', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', plexUserId: 'plex-member', isAdmin: true }))

    await expect(unshareUserLibrary('member-1')).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
    expect(unshareUserFromPlexServer).not.toHaveBeenCalled()
  })
})
