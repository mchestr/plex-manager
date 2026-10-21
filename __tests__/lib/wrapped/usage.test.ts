/**
 * Tests for lib/wrapped/usage.ts: LLM usage statistics from aggregate queries
 * (BP-28). The Prisma mock answers `groupBy` and the date series from a small
 * set of rows, the way Postgres would.
 */

import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { getLLMUsageStats } from '@/lib/wrapped/usage'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

interface Row {
  userId: string
  provider: string
  model: string | null
  totalTokens: number
  cost: number
  createdAt: Date
}

const ROWS: Row[] = [
  { userId: 'user-1', provider: 'openai', model: 'gpt-4', totalTokens: 150, cost: 0.001, createdAt: new Date('2024-01-15') },
  { userId: 'user-1', provider: 'openai', model: 'gpt-3.5-turbo', totalTokens: 120, cost: 0.0005, createdAt: new Date('2024-01-16') },
  { userId: 'user-2', provider: 'openai', model: 'gpt-4', totalTokens: 300, cost: 0.002, createdAt: new Date('2024-01-17') },
]

const USERS = [
  { id: 'user-1', name: 'User 1', email: 'user1@example.com' },
  { id: 'user-2', name: 'User 2', email: 'user2@example.com' },
]

/** What `groupBy(['provider', 'model', 'userId'])` returns for `rows`. */
function grouped(rows: Row[]) {
  const groups = new Map<string, { provider: string; model: string | null; userId: string; _sum: { totalTokens: number; cost: number }; _count: { _all: number } }>()
  for (const row of rows) {
    const key = `${row.provider}|${row.model}|${row.userId}`
    const group = groups.get(key) ?? { provider: row.provider, model: row.model, userId: row.userId, _sum: { totalTokens: 0, cost: 0 }, _count: { _all: 0 } }
    group._sum.totalTokens += row.totalTokens
    group._sum.cost += row.cost
    group._count._all += 1
    groups.set(key, group)
  }
  return [...groups.values()]
}

function seed(rows: Row[] = ROWS, users: Array<{ id: string; name: string | null; email: string }> = USERS) {
  ;(prismaMock.lLMUsage.groupBy as jest.Mock).mockResolvedValue(grouped(rows))
  prismaMock.lLMUsage.findMany.mockResolvedValue(rows.map(({ createdAt, cost, totalTokens }) => ({ createdAt, cost, totalTokens })) as never)
  prismaMock.user.findMany.mockResolvedValue(users as never)
}

describe('getLLMUsageStats', () => {
  it('totals the calls', async () => {
    seed()
    const result = await getLLMUsageStats()

    expect(result.totalRequests).toBe(3)
    expect(result.totalTokens).toBe(570)
    expect(result.totalCost).toBeCloseTo(0.0035)
    expect(result.averageCostPerRequest).toBeCloseTo(0.00116667, 5)
    expect(result.averageTokensPerRequest).toBe(190)
  })

  it('groups by provider, model and member, most expensive first', async () => {
    seed()
    const result = await getLLMUsageStats()

    expect(result.byProvider).toEqual([{ provider: 'openai', requests: 3, tokens: 570, cost: expect.closeTo(0.0035) }])
    expect(result.byModel[0]).toEqual({ model: 'gpt-4', requests: 2, tokens: 450, cost: expect.closeTo(0.003) })
    expect(result.byUser.map((u) => [u.userId, u.userName, u.requests, u.tokens])).toEqual([
      ['user-2', 'User 2', 1, 300],
      ['user-1', 'User 1', 2, 270],
    ])
  })

  it('builds the date series newest first', async () => {
    seed()
    const result = await getLLMUsageStats()

    expect(result.byDate.map((d) => d.date)).toEqual(['2024-01-17', '2024-01-16', '2024-01-15'])
  })

  it('filters by date range and member, and never selects prompt or response', async () => {
    seed()
    const start = new Date('2024-01-16')
    const end = new Date('2024-01-18')
    await getLLMUsageStats(start, end, 'user-1')

    const where = { createdAt: { gte: start, lt: end }, userId: 'user-1' }
    expect(prismaMock.lLMUsage.groupBy).toHaveBeenCalledWith(expect.objectContaining({ by: ['provider', 'model', 'userId'], where }))
    expect(prismaMock.lLMUsage.findMany).toHaveBeenCalledWith({ where, select: { createdAt: true, cost: true, totalTokens: true } })
  })

  it('returns zeros and empty lists without calls', async () => {
    seed([], [])
    const result = await getLLMUsageStats()

    expect(result).toEqual({
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      averageCostPerRequest: 0,
      averageTokensPerRequest: 0,
      byProvider: [],
      byModel: [],
      byUser: [],
      byDate: [],
    })
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()
  })

  it('names a member without a name by email, and a missing model "unknown"', async () => {
    seed([{ ...ROWS[0], model: null }], [{ id: 'user-1', name: null, email: 'user1@example.com' }])
    const result = await getLLMUsageStats()

    expect(result.byUser[0].userName).toBe('user1@example.com')
    expect(result.byModel[0].model).toBe('unknown')
  })
})
