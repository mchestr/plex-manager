/**
 * Tests for lib/wrapped/generation-claim.ts (P0.12: SEC-22, RWP-12): the
 * queries behind the single-flight claim and the compare-and-set writes.
 * The Postgres behaviour itself is covered by
 * actions/__tests__/wrapped-generation-claim.pg.test.ts.
 */

import { prisma } from '@/lib/prisma'
import { claimGeneration, isLiveClaim, STALE_CLAIM_MS, writeIfClaimed } from '@/lib/wrapped/generation-claim'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    plexWrapped: {
      createMany: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  },
}))

const mockWarn = jest.fn()
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args), error: jest.fn(), debug: jest.fn() }),
}))

const NOW = new Date('2026-12-01T12:00:00.000Z')
const MINUTE = 60 * 1000

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers({ now: NOW })
  ;(prisma.plexWrapped.createMany as jest.Mock).mockResolvedValue({ count: 0 })
  ;(prisma.plexWrapped.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
  ;(prisma.plexWrapped.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'wrapped-1' })
})

afterEach(() => {
  jest.useRealTimers()
})

describe('isLiveClaim', () => {
  it('matches the documented examples', () => {
    const now = new Date('2026-12-01T12:00:00Z')
    expect(isLiveClaim({ status: 'generating', updatedAt: new Date('2026-12-01T11:50:00Z') }, now)).toBe(true)
    expect(isLiveClaim({ status: 'generating', updatedAt: new Date('2026-12-01T11:44:00Z') }, now)).toBe(false)
  })

  it('is false for any other status, however recent', () => {
    for (const status of ['pending', 'completed', 'failed']) {
      expect(isLiveClaim({ status, updatedAt: NOW }, NOW)).toBe(false)
    }
  })

  it('treats 15 minutes as the stale window', () => {
    expect(STALE_CLAIM_MS).toBe(15 * MINUTE)
  })
})

describe('claimGeneration', () => {
  it('makes sure the row exists, then claims it with an explicit updatedAt', async () => {
    const claim = await claimGeneration('user-1', 2026, { regenerate: false })

    expect(claim).toEqual({ wrappedId: 'wrapped-1', claimedAt: NOW })
    expect(prisma.plexWrapped.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'user-1', year: 2026, status: 'pending', data: '{}' }],
      skipDuplicates: true,
    })
    expect(prisma.plexWrapped.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        year: 2026,
        OR: [
          { status: { notIn: ['generating', 'completed'] } },
          { status: 'generating', updatedAt: { lt: new Date(NOW.getTime() - 15 * MINUTE) } },
        ],
      },
      data: { status: 'generating', error: null, updatedAt: NOW },
    })
    // The row is created before it is claimed.
    const createOrder = (prisma.plexWrapped.createMany as jest.Mock).mock.invocationCallOrder[0]
    const claimOrder = (prisma.plexWrapped.updateMany as jest.Mock).mock.invocationCallOrder[0]
    expect(createOrder).toBeLessThan(claimOrder)
  })

  it('lets an admin claim a completed row', async () => {
    await claimGeneration('user-1', 2026, { regenerate: true })

    const { where } = (prisma.plexWrapped.updateMany as jest.Mock).mock.calls[0][0]
    expect(where.OR[0]).toEqual({ status: { not: 'generating' } })
  })

  it('returns null without reading the row when another live run holds it', async () => {
    ;(prisma.plexWrapped.updateMany as jest.Mock).mockResolvedValue({ count: 0 })

    await expect(claimGeneration('user-1', 2026, { regenerate: true })).resolves.toBeNull()
    expect(prisma.plexWrapped.findUniqueOrThrow).not.toHaveBeenCalled()
  })
})

describe('writeIfClaimed', () => {
  const claim = { wrappedId: 'wrapped-1', claimedAt: NOW }

  it('writes only while the row is generating inside this claim window', async () => {
    await expect(writeIfClaimed(claim, { status: 'completed', data: '{"ok":true}' })).resolves.toBe(true)

    expect(prisma.plexWrapped.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'wrapped-1',
        status: 'generating',
        updatedAt: { gte: NOW, lt: new Date(NOW.getTime() + 15 * MINUTE) },
      },
      data: { status: 'completed', data: '{"ok":true}' },
    })
    expect(mockWarn).not.toHaveBeenCalled()
  })

  it('reports a lost claim and logs it when no row matches', async () => {
    ;(prisma.plexWrapped.updateMany as jest.Mock).mockResolvedValue({ count: 0 })

    await expect(writeIfClaimed(claim, { status: 'failed', error: 'boom' })).resolves.toBe(false)
    expect(mockWarn).toHaveBeenCalledWith('Rewind run lost its claim; discarding its outcome', {
      wrappedId: 'wrapped-1',
      claimedAt: NOW.toISOString(),
      outcome: 'failed',
    })
  })
})
