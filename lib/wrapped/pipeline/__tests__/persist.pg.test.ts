/**
 * @jest-environment node
 */

/**
 * The v3 pipeline's final write on PostgreSQL (P5.9, FR-40, RWP-14): a
 * success copies the replaced data into `previousData` in one transaction; a
 * failure leaves the member's Rewind and its share links as they were.
 *
 * Gated by `describePg` and run only by `npm run test:integration`. The suite
 * touches only rows whose user id starts with its own run prefix.
 */

import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/lib/generated/prisma/client'
import type { RewindDataV3 } from '@/lib/wrapped/data/schema-v3'
import { persistRewind } from '@/lib/wrapped/pipeline/persist'
import { describePg } from '@/test/helpers/integration'

let mockDb: PrismaClient
jest.mock('@/lib/prisma', () => ({
  get prisma() {
    return mockDb
  },
}))

const RUN = `p59-${randomUUID()}`
const OLD_DATA = JSON.stringify({ version: 2, summary: 'The old Rewind' })

const DATA: RewindDataV3 = {
  version: 3,
  year: 2026,
  statsVersion: 'stats-2026.1',
  generatedAt: '2026-11-20T10:00:00.000Z',
  window: { from: '2026-01-01', through: '2026-11-30', zone: 'UTC', finalCut: false },
  edition: 'postcard',
  facts: {},
  pages: [{ type: 'cover', data: null }],
  archetype: null,
  copy: null,
  copySource: 'template',
  copyMeta: { model: null, promptVersion: 'rewind-2026.1', slotHashes: {} },
  factsHash: 'a'.repeat(64),
}

describePg('persistRewind on PostgreSQL', (databaseUrl) => {
  let n = 0

  /** A member with a completed v2 Rewind, a share link and a running generation. */
  async function seed() {
    const userId = `${RUN}-${++n}`
    await mockDb.user.create({ data: { id: userId } })
    const wrapped = await mockDb.plexWrapped.create({
      data: { userId, year: 2026, status: 'completed', data: OLD_DATA, shareToken: `token-${userId}` },
    })
    await mockDb.rewindShare.create({
      data: { wrappedId: wrapped.id, tokenHash: `hash-${userId}`, assetKey: `asset-${userId}`, pages: ['cover'], cardFacts: [] },
    })
    const generation = await mockDb.rewindGeneration.create({
      data: { wrappedId: wrapped.id, userId, year: 2026, kind: 'admin', status: 'running' },
    })
    const run = {
      generationId: generation.id,
      wrappedId: wrapped.id,
      userId,
      year: 2026,
      inputFactsHash: 'b'.repeat(64),
      copySource: 'template' as const,
      copyPolicy: 'default' as const,
      dataThrough: new Date('2026-11-30T00:00:00.000Z'),
    }
    return { userId, wrappedId: wrapped.id, generationId: generation.id, run }
  }

  beforeAll(() => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
  })

  afterAll(async () => {
    await mockDb.user.deleteMany({ where: { id: { startsWith: RUN } } })
    await mockDb.$disconnect()
  })

  it('writes v3 data in one transaction and keeps the replaced data in previousData', async () => {
    const { wrappedId, generationId, run } = await seed()

    await persistRewind(DATA, run)

    const wrapped = await mockDb.plexWrapped.findUniqueOrThrow({ where: { id: wrappedId } })
    expect(wrapped).toMatchObject({ status: 'completed', dataVersion: 3, edition: 'postcard', factsHash: DATA.factsHash })
    expect(JSON.parse(wrapped.data)).toMatchObject({ version: 3, factsHash: DATA.factsHash })
    expect(wrapped.shareToken).toBe(`token-${run.userId}`)
    const generation = await mockDb.rewindGeneration.findUniqueOrThrow({ where: { id: generationId } })
    expect(generation).toMatchObject({ status: 'completed', previousData: OLD_DATA, factsHash: run.inputFactsHash, copySource: 'template', llmCalls: 0 })
  })

  it('writes a whole-year issue over the season one, keeping the season version in previousData', async () => {
    const { wrappedId, run } = await seed()
    await persistRewind(DATA, run)
    const season = (await mockDb.plexWrapped.findUniqueOrThrow({ where: { id: wrappedId } })).data
    const yearRun = await mockDb.rewindGeneration.create({
      data: { wrappedId, userId: run.userId, year: 2026, kind: 'admin', status: 'running' },
    })
    const wholeYear: RewindDataV3 = { ...DATA, generatedAt: '2027-01-03T18:00:00.000Z', window: { ...DATA.window, through: '2026-12-31', finalCut: true } }

    await persistRewind(wholeYear, { ...run, generationId: yearRun.id, dataThrough: new Date('2026-12-31T00:00:00.000Z') })

    const wrapped = await mockDb.plexWrapped.findUniqueOrThrow({ where: { id: wrappedId } })
    expect(JSON.parse(wrapped.data)).toMatchObject({ window: { through: '2026-12-31', finalCut: true } })
    expect(wrapped.dataThrough).toEqual(new Date('2026-12-31T00:00:00.000Z'))
    expect(await mockDb.rewindGeneration.findUniqueOrThrow({ where: { id: yearRun.id } })).toMatchObject({
      status: 'completed',
      copyPolicy: 'default',
      previousData: season,
    })
  })

  it('leaves the old data and its share links untouched when the write fails', async () => {
    const { wrappedId, run } = await seed()

    await expect(persistRewind({ ...DATA, edition: 'giant' } as unknown as RewindDataV3, run)).rejects.toThrow()
    await expect(persistRewind(DATA, { ...run, generationId: 'missing-generation' })).rejects.toThrow()

    const wrapped = await mockDb.plexWrapped.findUniqueOrThrow({ where: { id: wrappedId }, include: { shares: true } })
    expect(wrapped).toMatchObject({ status: 'completed', data: OLD_DATA, dataVersion: 2, shareToken: `token-${run.userId}` })
    expect(wrapped.shares).toHaveLength(1)
  })
})
