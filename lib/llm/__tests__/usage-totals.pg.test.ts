/**
 * @jest-environment node
 */

/**
 * The aggregate usage totals on PostgreSQL (P7.8, BP-28): they equal the
 * in-memory sums the admin pages used to compute from every `LLMUsage` row,
 * and no query selects `prompt` or `response`.
 *
 * Gated by `describePg` and run only by `npm run test:integration`. The suite
 * touches only rows whose user id starts with its own run prefix.
 */

import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/lib/generated/prisma/client'
import { getRewindSeasonSpend, latestModelByUser, usageTotalsByUser, usageTotalsForWrapped } from '@/lib/llm/usage-totals'
import { describePg } from '@/__tests__/helpers/integration'

let mockDb: PrismaClient
jest.mock('@/lib/prisma', () => ({
  get prisma() {
    return mockDb
  },
}))

const RUN = `p78-${randomUUID()}`

/** The old in-memory sum (`aggregateLlmUsage`), over rows in insertion order. */
function inMemory(rows: Array<{ totalTokens: number; promptTokens: number; completionTokens: number; cost: number; provider: string; model: string | null }>) {
  return {
    totalTokens: rows.reduce((s, r) => s + r.totalTokens, 0),
    promptTokens: rows.reduce((s, r) => s + r.promptTokens, 0),
    completionTokens: rows.reduce((s, r) => s + r.completionTokens, 0),
    cost: rows.reduce((s, r) => s + r.cost, 0),
    provider: rows[rows.length - 1].provider,
    model: rows[rows.length - 1].model,
    count: rows.length,
  }
}

describePg('usage totals on PostgreSQL', (databaseUrl) => {
  const users = [`${RUN}-a`, `${RUN}-b`]
  let wrappedA: string
  let wrappedB: string
  const queries: string[] = []

  beforeAll(async () => {
    const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    // Records every model operation's arguments, so the test can see what was selected.
    mockDb = base.$extends({
      query: {
        lLMUsage: {
          async $allOperations({ operation, args, query }) {
            queries.push(`${operation} ${JSON.stringify(args)}`)
            return query(args)
          },
        },
      },
    }) as unknown as PrismaClient
    for (const id of users) await base.user.create({ data: { id } })
    wrappedA = (await base.plexWrapped.create({ data: { userId: users[0], year: 2026, data: '{}' } })).id
    wrappedB = (await base.plexWrapped.create({ data: { userId: users[1], year: 2026, data: '{}' } })).id
    const generation = await base.rewindGeneration.create({
      data: { wrappedId: wrappedA, userId: users[0], year: 2026, kind: 'season' },
    })
    let minute = 0
    const row = (userId: string, wrappedId: string | null, cost: number, model: string, generationId: string | null = null) =>
      base.lLMUsage.create({
        data: {
          userId,
          wrappedId,
          generationId,
          provider: 'openai',
          model,
          prompt: 'secret prompt',
          response: 'secret response',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost,
          createdAt: new Date(Date.UTC(2026, 10, 20, 12, minute++)),
        },
      })
    await row(users[0], wrappedA, 0.01, 'gpt-6-luna', generation.id)
    await row(users[0], wrappedA, 0.02, 'gpt-6-sol', generation.id)
    await row(users[0], null, 0.5, 'gpt-6-sol')
    await row(users[1], wrappedB, 0.03, 'gpt-6-luna')
    ;(globalThis as { __p78base?: PrismaClient }).__p78base = base
  })

  afterAll(async () => {
    const base = (globalThis as { __p78base?: PrismaClient }).__p78base!
    await base.user.deleteMany({ where: { id: { startsWith: RUN } } })
    await base.$disconnect()
  })

  it('equals the old in-memory sums per member and per Rewind', async () => {
    const base = (globalThis as { __p78base?: PrismaClient }).__p78base!
    const rowsOf = (where: object) => base.lLMUsage.findMany({ where, orderBy: { createdAt: 'asc' } })

    const byUser = await usageTotalsByUser(users)
    for (const userId of users) {
      const expected = inMemory(await rowsOf({ userId }))
      expect(byUser.get(userId)).toEqual({ ...expected, cost: expect.closeTo(expected.cost, 10) })
    }

    const byWrapped = await usageTotalsForWrapped([wrappedA, wrappedB])
    const expectedA = inMemory(await rowsOf({ wrappedId: wrappedA }))
    expect(byWrapped.get(wrappedA)).toEqual({ ...expectedA, cost: expect.closeTo(expectedA.cost, 10) })
    expect(byWrapped.get(wrappedB)?.count).toBe(1)

    expect((await latestModelByUser(users)).get(users[0])).toEqual({ provider: 'openai', model: 'gpt-6-sol' })
  })

  it("sums only this year's Rewind generations for the season spend", async () => {
    // Other suites' rows may share the year, so compare against the same query's own rows.
    const base = (globalThis as { __p78base?: PrismaClient }).__p78base!
    const rows = await base.lLMUsage.findMany({ where: { generation: { year: 2026 } }, select: { cost: true } })
    expect(await getRewindSeasonSpend(2026)).toBeCloseTo(rows.reduce((s, r) => s + r.cost, 0), 8)
  })

  it('never selects prompt or response', () => {
    expect(queries.length).toBeGreaterThan(0)
    for (const query of queries) {
      expect(query).not.toMatch(/prompt"|response"/)
      // A row read without `select` would load every column, the text included.
      if (query.startsWith('findMany')) expect(query).toMatch(/"select"/)
    }
  })
})
