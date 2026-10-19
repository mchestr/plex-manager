/**
 * @jest-environment node
 */

/**
 * Tests for prepareRewindSeasonData (P2.6): admin only, Zod-validated,
 * audit-logged, FR-50 when Redis is missing, and single-flight per batch.
 */

import { getServerSession } from 'next-auth'

import { getRewindSeasonDataPreparedAt, prepareRewindSeasonData } from '@/actions/admin/rewind-season'
import { prisma } from '@/lib/prisma'
import { enqueueServerAggregate } from '@/lib/queue/rewind-batch-queue'
import { checkRewindInfra } from '@/lib/queue/rewind-infra'
import { AuditEventType, logAuditEvent } from '@/lib/security/audit-log'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({ prisma: { rewindServerAggregate: { findFirst: jest.fn() } } }))
jest.mock('@/lib/queue/rewind-batch-queue', () => ({ enqueueServerAggregate: jest.fn() }))
jest.mock('@/lib/queue/rewind-infra', () => ({ checkRewindInfra: jest.fn() }))
jest.mock('@/lib/security/audit-log', () => ({
  ...jest.requireActual('@/lib/security/audit-log'),
  logAuditEvent: jest.fn(),
}))
jest.mock('@/lib/utils/server-zone', () => ({ serverZone: jest.fn(async () => 'America/Chicago') }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const admin = { user: { id: 'admin-1', isAdmin: true } }

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers({ now: new Date('2026-11-20T12:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] })
  jest.mocked(getServerSession).mockResolvedValue(admin)
  jest.mocked(checkRewindInfra).mockResolvedValue({ ok: true })
  jest.mocked(enqueueServerAggregate).mockResolvedValue({ jobId: 'job-1', alreadyQueued: false })
})

afterEach(() => jest.useRealTimers())

describe('prepareRewindSeasonData', () => {
  it('queues the season batch and writes an audit entry', async () => {
    const result = await prepareRewindSeasonData({ year: 2026 })

    expect(result).toEqual({ success: true, alreadyQueued: false, through: '2026-11-30' })
    expect(enqueueServerAggregate).toHaveBeenCalledWith({ year: 2026, through: '2026-11-30' })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.REWIND_SEASON_DATA_PREPARED, 'admin-1', {
      year: 2026,
      through: '2026-11-30',
      jobId: 'job-1',
      alreadyQueued: false,
    })
  })

  it('prepares the full year once it has ended in the server zone', async () => {
    jest.setSystemTime(new Date('2027-01-01T06:30:00Z')) // 00:30 on 1 January in Chicago

    await prepareRewindSeasonData({ year: 2026 })

    expect(enqueueServerAggregate).toHaveBeenCalledWith({ year: 2026, through: '2026-12-31' })
  })

  it('reports a run already in progress', async () => {
    jest.mocked(enqueueServerAggregate).mockResolvedValue({ jobId: 'job-1', alreadyQueued: true })

    expect(await prepareRewindSeasonData({ year: 2026 })).toEqual({ success: true, alreadyQueued: true, through: '2026-11-30' })
  })

  it('returns the FR-50 message and queues nothing without Redis', async () => {
    jest.mocked(checkRewindInfra).mockResolvedValue({ ok: false, code: 'REDIS_NOT_CONFIGURED' })

    expect(await prepareRewindSeasonData({ year: 2026 })).toEqual({ success: false, error: 'Rewind needs Redis (REDIS_URL)' })
    expect(enqueueServerAggregate).not.toHaveBeenCalled()
  })

  it('rejects an invalid year', async () => {
    expect(await prepareRewindSeasonData({ year: 26.5 })).toEqual({ success: false, error: 'Invalid year' })
    expect(enqueueServerAggregate).not.toHaveBeenCalled()
  })

  it('refuses a non-admin before doing anything', async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'member-1', isAdmin: false } })

    await expect(prepareRewindSeasonData({ year: 2026 })).rejects.toThrow('UNAUTHORIZED')
    expect(checkRewindInfra).not.toHaveBeenCalled()
    expect(enqueueServerAggregate).not.toHaveBeenCalled()
  })

  it('returns an error when the enqueue fails', async () => {
    jest.mocked(enqueueServerAggregate).mockRejectedValue(new Error('Connection is closed.'))

    expect(await prepareRewindSeasonData({ year: 2026 })).toEqual({
      success: false,
      error: 'Rewind is temporarily unavailable. Try again in a few minutes.',
    })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})

describe('getRewindSeasonDataPreparedAt', () => {
  it('returns the newest computedAt for the year', async () => {
    jest.mocked(prisma.rewindServerAggregate.findFirst).mockResolvedValue({ computedAt: new Date('2026-11-02T20:05:00Z') } as never)

    expect(await getRewindSeasonDataPreparedAt(2026)).toBe('2026-11-02T20:05:00.000Z')
    expect(prisma.rewindServerAggregate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { year: 2026 }, orderBy: { computedAt: 'desc' } })
    )
  })

  it('returns null before the first run', async () => {
    jest.mocked(prisma.rewindServerAggregate.findFirst).mockResolvedValue(null)

    expect(await getRewindSeasonDataPreparedAt(2026)).toBeNull()
  })
})
