import { getUserPlexWrapped, getAllUsersWithWrapped } from '@/actions/user-queries'
import { prisma } from '@/lib/prisma'
import { aggregateLlmUsage } from '@/lib/utils'
import { makePrismaUser, makePrismaWrapped, makePrismaLlmUsage } from '../utils/test-builders'

jest.mock('@/lib/admin', () => ({
  requireAdmin: jest.fn(),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    plexWrapped: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
  },
}))

jest.mock('@/lib/services/service-helpers', () => ({
  getActivePlexService: jest.fn(),
}))

jest.mock('@/lib/connections/plex', () => ({
  checkUserServerAccess: jest.fn(),
  getPlexServerIdentity: jest.fn(),
  getPlexUsers: jest.fn(),
  unshareUserFromPlexServer: jest.fn(),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('getUserPlexWrapped', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2024-06-01T12:00:00Z'))
    jest.clearAllMocks()
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

    const result = await getUserPlexWrapped('user-1', 2024)

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

  it('should use current year as default', async () => {
    const currentYear = 2024
    mockPrisma.plexWrapped.findUnique.mockResolvedValue(null)

    await getUserPlexWrapped('user-1')

    expect(mockPrisma.plexWrapped.findUnique).toHaveBeenCalledWith({
      where: {
        userId_year: {
          userId: 'user-1',
          year: currentYear,
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

    const result = await getUserPlexWrapped('user-1', 2024)

    expect(result).toBeNull()
  })

  it('should return null on error', async () => {
    mockPrisma.plexWrapped.findUnique.mockRejectedValue(new Error('Database error'))

    const result = await getUserPlexWrapped('user-1', 2024)

    expect(result).toBeNull()
  })
})

describe('getAllUsersWithWrapped', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2024-06-01T12:00:00Z'))
    jest.clearAllMocks()
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

    const result = await getAllUsersWithWrapped(2024)

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

  it('should use current year as default', async () => {
    const currentYear = 2024
    mockPrisma.user.findMany.mockResolvedValue([])
    mockPrisma.plexWrapped.findMany.mockResolvedValue([])

    await getAllUsersWithWrapped()

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      orderBy: [
        { isAdmin: 'desc' },
        { name: 'asc' },
      ],
      include: {
        plexWrapped: {
          where: {
            year: currentYear,
          },
          take: 1,
          include: {
            llmUsage: true,
          },
        },
        llmUsage: true,
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

    const result = await getAllUsersWithWrapped(2024)

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

    const result = await getAllUsersWithWrapped(2024)

    expect(result[0].llmUsage).toMatchObject({
      totalTokens: 3000,
      promptTokens: 1500,
      completionTokens: 1500,
      cost: 0.03,
      count: 2,
    })
  })

  it('should return empty array on error', async () => {
    mockPrisma.user.findMany.mockRejectedValue(new Error('Database error'))

    const result = await getAllUsersWithWrapped(2024)

    expect(result).toEqual([])
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

    const result = await getAllUsersWithWrapped(2024)

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
