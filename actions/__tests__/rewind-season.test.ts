/**
 * @jest-environment node
 */

/**
 * The season console's actions (P7.8): admin only, FR-50 without Redis, the
 * buttons' runs carry the configured audience, and every started run is
 * audited with its estimate.
 */

import { getServerSession } from 'next-auth'

import {
  generateAllRewinds,
  getRewindSeasonStatus,
  prepareRewindSeason,
  retryFailedRewinds,
} from '@/actions/admin/rewind-season'
import { checkRewindInfra } from '@/lib/queue/rewind-infra'
import { enqueueGenerateAll, enqueueSeasonPrepare } from '@/lib/rewind/season-runs'
import { AuditEventType, logAuditEvent } from '@/lib/security/audit-log'
import { getSeasonCounts } from '@/lib/wrapped/admin/season'
import { loadSeasonEstimate } from '@/lib/wrapped/admin/season-estimate'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({ prisma: {} }))
jest.mock('@/lib/queue/rewind-infra', () => ({ checkRewindInfra: jest.fn() }))
jest.mock('@/lib/rewind/season-runs', () => ({
  ...jest.requireActual('@/lib/rewind/season-runs'),
  enqueueSeasonPrepare: jest.fn(),
  enqueueGenerateAll: jest.fn(),
  seasonThrough: jest.fn(async () => '2026-11-30'),
}))
jest.mock('@/lib/wrapped/admin/season', () => ({ getSeasonCounts: jest.fn() }))
jest.mock('@/lib/wrapped/admin/season-estimate', () => ({ loadSeasonEstimate: jest.fn() }))
jest.mock('@/lib/security/audit-log', () => ({
  ...jest.requireActual('@/lib/security/audit-log'),
  logAuditEvent: jest.fn(),
}))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const ESTIMATE = { members: 12, llmMembers: 10, perMemberUsd: 0.01, costUsd: 0.1, pastCap: 0 }

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers({ now: new Date('2026-11-20T12:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] })
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'admin-1', isAdmin: true } })
  jest.mocked(checkRewindInfra).mockResolvedValue({ ok: true })
  jest.mocked(loadSeasonEstimate).mockResolvedValue(ESTIMATE)
  jest.mocked(enqueueSeasonPrepare).mockResolvedValue({ jobId: 'prep-1', alreadyQueued: false })
  jest.mocked(enqueueGenerateAll).mockResolvedValue({ jobId: 'all-1', alreadyQueued: false })
})

afterEach(() => jest.useRealTimers())

describe('bulk actions', () => {
  it('refuses non-admins before doing anything', async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'member-1', isAdmin: false } })

    for (const action of [prepareRewindSeason, generateAllRewinds, retryFailedRewinds, getRewindSeasonStatus]) {
      expect(await action({ year: 2026 })).toMatchObject({ success: false, code: 'FORBIDDEN' })
    }
    expect(enqueueSeasonPrepare).not.toHaveBeenCalled()
    expect(enqueueGenerateAll).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it('Prepare season queues the configured audience and audits it with the estimate', async () => {
    expect(await prepareRewindSeason({ year: 2026 })).toEqual({ success: true, data: { jobId: 'prep-1', alreadyQueued: false } })
    expect(enqueueSeasonPrepare).toHaveBeenCalledWith({ year: 2026, through: '2026-11-30', audience: 'config', triggeredBy: 'admin' })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.REWIND_SEASON_PREPARED, 'admin-1', expect.objectContaining({
      year: 2026,
      audience: 'config',
      members: 12,
      estimatedCostUsd: 0.1,
    }))
  })

  it('Generate all and Retry failed fan out with the configured audience, each audited', async () => {
    await generateAllRewinds({ year: 2026 })
    expect(enqueueGenerateAll).toHaveBeenLastCalledWith({ year: 2026, through: '2026-11-30', audience: 'config', scope: 'all' })
    expect(logAuditEvent).toHaveBeenLastCalledWith(AuditEventType.REWIND_GENERATE_ALL_STARTED, 'admin-1', expect.objectContaining({ jobId: 'all-1' }))

    await retryFailedRewinds({ year: 2026 })
    expect(enqueueGenerateAll).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'failed', audience: 'config' }))
    expect(loadSeasonEstimate).toHaveBeenLastCalledWith(2026, '2026-11-30', 'failed')
    expect(logAuditEvent).toHaveBeenLastCalledWith(AuditEventType.REWIND_RETRY_FAILED, 'admin-1', expect.objectContaining({ year: 2026 }))
  })

  it('returns the FR-50 message and queues nothing without Redis', async () => {
    jest.mocked(checkRewindInfra).mockResolvedValue({ ok: false, code: 'REDIS_NOT_CONFIGURED' })

    expect(await generateAllRewinds({ year: 2026 })).toMatchObject({ success: false, error: 'Rewind needs Redis (REDIS_URL)' })
    expect(enqueueGenerateAll).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it('rejects an invalid year', async () => {
    expect(await prepareRewindSeason({ year: 26.5 })).toMatchObject({ success: false, code: 'VALIDATION' })
  })

  it('maps a failed enqueue to a safe error, without an audit entry', async () => {
    jest.mocked(enqueueSeasonPrepare).mockRejectedValue(new Error('Connection is closed.'))

    expect(await prepareRewindSeason({ year: 2026 })).toMatchObject({ success: false, code: 'INTERNAL', error: 'Could not start Prepare season' })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})

describe('getRewindSeasonStatus', () => {
  it('returns the counts only', async () => {
    const counts = { ready: 3, generating: 1, failed: 0, stuck: 0, notStarted: 2, byEdition: { full: 3 }, byCopySource: { llm: 3 } }
    jest.mocked(getSeasonCounts).mockResolvedValue(counts)

    expect(await getRewindSeasonStatus({ year: 2026 })).toEqual({ success: true, data: counts })
  })
})
