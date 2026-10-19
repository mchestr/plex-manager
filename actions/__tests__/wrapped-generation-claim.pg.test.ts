/**
 * @jest-environment node
 */

/**
 * The Rewind generation claim against a real PostgreSQL database (P0.12:
 * SEC-22, RWP-12): concurrent claims, the stale takeover and the
 * compare-and-set outcome writes that `generatePlexWrapped` relies on.
 *
 * Gated by `describePg` (test/helpers/integration.ts) and run only by
 * `npm run test:integration`. The database needs the app's migrations applied. The suite
 * only touches rows of a `User` whose id starts with its own run prefix, but
 * scripts/__tests__/rewind-strip-leaderboards.pg.test.ts empties PlexWrapped
 * and counts every row, so the two must not run at the same time on one
 * database; `npm run test:integration` runs the Postgres suites one at a time.
 *
 *   TEST_DATABASE_URL=postgresql://.../plex_manager_test npm run test:integration
 */

import { randomUUID } from 'node:crypto'

import { prisma } from '@/lib/prisma'
import { claimGeneration, type GenerationClaim, writeIfClaimed } from '@/lib/wrapped/generation-claim'
import { describePg } from '@/test/helpers/integration'

// The claim module uses the app's client; point it at the test database.
jest.mock('@/lib/prisma', () => {
  const url = process.env.TEST_DATABASE_URL
  if (url === undefined) {
    return { prisma: {} }
  }
  const { assertTestDatabaseUrl: assertUrl } = jest.requireActual('@/lib/security/test-mode')
  const { PrismaPg } = jest.requireActual('@prisma/adapter-pg')
  const { PrismaClient } = jest.requireActual('@/lib/generated/prisma/client')
  return { prisma: new PrismaClient({ adapter: new PrismaPg({ connectionString: assertUrl(url) }) }) }
})

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}))

const RUN = `p012-${randomUUID()}`
const MEMBER = `${RUN}-member`
const YEAR = 2026
const MINUTE = 60 * 1000

function tenClaims(regenerate: boolean): Promise<(GenerationClaim | null)[]> {
  return Promise.all(Array.from({ length: 10 }, () => claimGeneration(MEMBER, YEAR, { regenerate })))
}

function winners(claims: (GenerationClaim | null)[]): GenerationClaim[] {
  return claims.filter((claim): claim is GenerationClaim => claim !== null)
}

function row() {
  return prisma.plexWrapped.findUniqueOrThrow({ where: { userId_year: { userId: MEMBER, year: YEAR } } })
}

async function seedRow(status: string, updatedAt: Date, data = '{}') {
  return prisma.plexWrapped.create({ data: { userId: MEMBER, year: YEAR, status, data, updatedAt } })
}

describePg('the Rewind generation claim on PostgreSQL', () => {
  beforeAll(async () => {
    await prisma.user.create({ data: { id: MEMBER, name: 'Claim Test' } })
  })

  afterEach(async () => {
    await prisma.plexWrapped.deleteMany({ where: { userId: MEMBER } })
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { startsWith: RUN } } })
    await prisma.$disconnect()
  })

  it('lets exactly one of ten concurrent claims win when the row does not exist yet', async () => {
    const won = winners(await tenClaims(false))

    expect(won).toHaveLength(1)
    expect(await prisma.plexWrapped.count({ where: { userId: MEMBER } })).toBe(1)
    const claimed = await row()
    expect(claimed.id).toBe(won[0].wrappedId)
    expect(claimed.status).toBe('generating')
    // Prisma stored the explicit @updatedAt value: the run's identity.
    expect(claimed.updatedAt).toEqual(won[0].claimedAt)
  })

  it('lets exactly one of ten concurrent admin claims win on a completed row', async () => {
    await seedRow('completed', new Date(Date.now() - 60 * MINUTE), '{"version":2}')

    const won = winners(await tenClaims(true))

    expect(won).toHaveLength(1)
    expect((await row()).status).toBe('generating')
  })

  it('never lets a member claim a completed row', async () => {
    const completedAt = new Date(Date.now() - 60 * MINUTE)
    await seedRow('completed', completedAt, '{"version":2}')

    expect(winners(await tenClaims(false))).toHaveLength(0)
    const untouched = await row()
    expect(untouched.status).toBe('completed')
    expect(untouched.updatedAt).toEqual(completedAt)
  })

  it('does not take over a claim 14 minutes old, and lets one of ten take over at 16 minutes', async () => {
    await seedRow('generating', new Date(Date.now() - 14 * MINUTE))
    expect(winners(await tenClaims(false))).toHaveLength(0)

    await prisma.plexWrapped.updateMany({
      where: { userId: MEMBER },
      data: { updatedAt: new Date(Date.now() - 16 * MINUTE) },
    })
    const won = winners(await tenClaims(false))

    expect(won).toHaveLength(1)
    expect((await row()).updatedAt).toEqual(won[0].claimedAt)
  })

  it('writes the outcome only for the run that holds the claim', async () => {
    // A run that claimed 16 minutes ago and hung, then a newer run took over.
    const staleAt = new Date(Date.now() - 16 * MINUTE)
    const seeded = await seedRow('generating', staleAt)
    const staleRun: GenerationClaim = { wrappedId: seeded.id, claimedAt: staleAt }
    const newRun = await claimGeneration(MEMBER, YEAR, { regenerate: false })
    expect(newRun).not.toBeNull()

    expect(await writeIfClaimed(staleRun, { status: 'failed', error: 'late failure' })).toBe(false)
    expect(await writeIfClaimed(staleRun, { status: 'completed', data: '{"stale":true}' })).toBe(false)
    const untouched = await row()
    expect(untouched).toEqual(expect.objectContaining({ status: 'generating', data: '{}', error: null }))
    expect(untouched.updatedAt).toEqual(newRun?.claimedAt)

    expect(await writeIfClaimed(newRun as GenerationClaim, { status: 'completed', data: '{"fresh":true}' })).toBe(true)
    expect(await row()).toEqual(expect.objectContaining({ status: 'completed', data: '{"fresh":true}' }))
    // Once the outcome is stored, the claim is spent.
    expect(await writeIfClaimed(newRun as GenerationClaim, { status: 'failed', error: 'twice' })).toBe(false)
  })

  it('keeps the claim when the member stops sharing mid-run', async () => {
    const claim = await claimGeneration(MEMBER, YEAR, { regenerate: false })
    expect(claim).not.toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 5))

    // disableWrappedShareLink's write: Prisma moves updatedAt forward.
    await prisma.plexWrapped.update({ where: { id: claim?.wrappedId }, data: { shareToken: null } })
    expect((await row()).updatedAt.getTime()).toBeGreaterThan((claim as GenerationClaim).claimedAt.getTime())

    expect(await writeIfClaimed(claim as GenerationClaim, { status: 'completed', data: '{"kept":true}' })).toBe(true)
    expect((await row()).status).toBe('completed')
  })
})
