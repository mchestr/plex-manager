/**
 * @jest-environment node
 */

/**
 * The season open's audience switch (P8.2): 08:00 on the opening day in the
 * server zone, kept scheduled like the season-open Prepare; the readiness
 * check; and the switch itself, a compare-and-set that audits and fans out
 * the ready notifications.
 */

import { mockReset } from 'jest-mock-extended'

import { buildConfig } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { enqueueSeasonReadyNotifications } from '@/lib/queue/jobs/rewind-notify'
import { getRewindQueue } from '@/lib/queue/rewind-producers'
import { JOB_TYPES } from '@/lib/queue/types'
import {
  ensureSeasonAudienceSwitchScheduled,
  openRewindToEveryone,
  seasonAudienceSwitchAt,
  seasonAudienceSwitchGivesUpAt,
  seasonOpenReadiness,
} from '@/lib/rewind/season-open'
import { AuditEventType, logAuditEvent } from '@/lib/security/audit-log'
import { getSeasonCounts } from '@/lib/wrapped/admin/season'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/queue/rewind-producers', () => ({ getRewindQueue: jest.fn() }))
jest.mock('@/lib/queue/connection', () => ({ getRequestPathRedis: jest.fn(), readyWithin: jest.fn(async () => true) }))
jest.mock('@/lib/queue/jobs/rewind-notify', () => ({ enqueueSeasonReadyNotifications: jest.fn(async () => 12) }))
jest.mock('@/lib/wrapped/admin/season', () => ({ getSeasonCounts: jest.fn() }))
jest.mock('@/lib/security/audit-log', () => ({ ...jest.requireActual('@/lib/security/audit-log'), logAuditEvent: jest.fn() }))
jest.mock('@/lib/utils/server-zone', () => ({ serverZone: jest.fn(async () => 'America/Chicago') }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const SWITCH = Date.parse('2026-12-01T14:00:00Z') // 08:00 in Chicago
const NOW = Date.parse('2026-11-20T12:00:00Z')

let queue: { add: jest.Mock; getDeduplicationJobId: jest.Mock; getJob: jest.Mock }

const counts = (overrides: Partial<Awaited<ReturnType<typeof getSeasonCounts>>> = {}) => ({
  ready: 40, generating: 0, failed: 0, stuck: 0, notStarted: 3, byEdition: {}, byCopySource: {}, ...overrides,
})

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  queue = {
    add: jest.fn(async (_name: string, _data: unknown, opts: { jobId?: string }) => ({ id: opts.jobId ?? 'job-new' })),
    getDeduplicationJobId: jest.fn(async () => null),
    getJob: jest.fn(),
  }
  jest.mocked(getRewindQueue).mockReturnValue(queue as never)
  jest.mocked(getSeasonCounts).mockResolvedValue(counts())
})

describe('seasonAudienceSwitchAt', () => {
  it('is 08:00 on the opening day in the server zone, and gives up at 12:00', () => {
    expect(seasonAudienceSwitchAt(2026, '12-01', 'America/Chicago').getTime()).toBe(SWITCH)
    expect(seasonAudienceSwitchAt(2026, '12-01', 'Australia/Sydney').toISOString()).toBe('2026-11-30T21:00:00.000Z')
    expect(seasonAudienceSwitchGivesUpAt(2026, '12-01', 'America/Chicago').toISOString()).toBe('2026-12-01T18:00:00.000Z')
  })
})

describe('ensureSeasonAudienceSwitchScheduled', () => {
  it('keeps one delayed REWIND_SEASON_OPEN on rewind-aux for 08:00 on 1 December', async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindSeasonOpens: '12-01' }))

    expect((await ensureSeasonAudienceSwitchScheduled(2026, NOW))?.getTime()).toBe(SWITCH)
    expect(getRewindQueue).toHaveBeenCalledWith('rewind-aux')
    expect(queue.add).toHaveBeenCalledWith(
      JOB_TYPES.REWIND_SEASON_OPEN,
      { year: 2026, triggeredBy: 'scheduled' },
      expect.objectContaining({ jobId: `rewind-open-2026-${SWITCH}`, delay: SWITCH - NOW, deduplication: { id: 'rewind:open:2026' } })
    )
  })

  it('keeps the job while the instant holds, moves it with the season dates, and schedules nothing once it passed', async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindSeasonOpens: '12-01' }))
    queue.getDeduplicationJobId.mockResolvedValue(`rewind-open-2026-${SWITCH}`)
    await ensureSeasonAudienceSwitchScheduled(2026, NOW)
    expect(queue.add).not.toHaveBeenCalled()

    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindSeasonOpens: '12-02' }))
    const old = { isDelayed: jest.fn(async () => true), remove: jest.fn(async () => undefined) }
    queue.getJob.mockResolvedValue(old)
    expect((await ensureSeasonAudienceSwitchScheduled(2026, NOW))?.toISOString()).toBe('2026-12-02T14:00:00.000Z')
    expect(old.remove).toHaveBeenCalled()

    expect(await ensureSeasonAudienceSwitchScheduled(2026, Date.parse('2026-12-03T00:00:00Z'))).toBeNull()
  })
})

describe('seasonOpenReadiness', () => {
  it('waits while the season-open Prepare runs', async () => {
    queue.getDeduplicationJobId.mockResolvedValue('prep-1')
    queue.getJob.mockResolvedValue({ getState: jest.fn(async () => 'waiting-children') })

    expect(await seasonOpenReadiness(2026)).toEqual({ state: 'running', prepare: true, generating: 0 })
    expect(queue.getDeduplicationJobId).toHaveBeenCalledWith('rewind:prepare:2026:2026-11-30')
  })

  it('waits while generations are queued, running or stuck, then reports failures, then ready', async () => {
    queue.getDeduplicationJobId.mockResolvedValue('prep-1')
    queue.getJob.mockResolvedValue({ getState: jest.fn(async () => 'completed') })

    jest.mocked(getSeasonCounts).mockResolvedValueOnce(counts({ generating: 3, stuck: 1 }))
    expect(await seasonOpenReadiness(2026)).toEqual({ state: 'running', prepare: false, generating: 4 })

    jest.mocked(getSeasonCounts).mockResolvedValueOnce(counts({ failed: 2 }))
    expect(await seasonOpenReadiness(2026)).toEqual({ state: 'failures', failed: 2 })

    expect(await seasonOpenReadiness(2026)).toEqual({ state: 'ready', ready: 40 })
  })

  it('is not prepared when the season-open Prepare failed or never ran, unless the rehearsal ran its own', async () => {
    queue.getDeduplicationJobId.mockResolvedValue('prep-1')
    queue.getJob.mockResolvedValue({ getState: jest.fn(async () => 'failed') })
    expect(await seasonOpenReadiness(2026)).toEqual({ state: 'not-prepared', prepare: 'failed' })

    queue.getDeduplicationJobId.mockResolvedValue(null)
    expect(await seasonOpenReadiness(2026)).toEqual({ state: 'not-prepared', prepare: null })
    expect(await seasonOpenReadiness(2026, { requirePrepare: false })).toEqual({ state: 'ready', ready: 40 })
  })
})

describe('openRewindToEveryone', () => {
  it('switches admins to all while Rewind is on, audits it and fans out the notifications', async () => {
    prismaMock.config.updateMany.mockResolvedValue({ count: 1 })

    expect(await openRewindToEveryone(2026, 'system')).toEqual({ switched: true, notified: 12 })
    expect(prismaMock.config.updateMany).toHaveBeenCalledWith({
      where: { id: 'config', rewindEnabled: true, rewindAudience: 'admins' },
      data: { rewindAudience: 'all', updatedBy: 'system' },
    })
    expect(logAuditEvent).toHaveBeenCalledWith(
      AuditEventType.CONFIG_CHANGED,
      'system',
      expect.objectContaining({ section: 'rewind', source: 'season-open' })
    )
    expect(enqueueSeasonReadyNotifications).toHaveBeenCalledWith(2026)
  })

  it('does nothing when the audience is already everyone or Rewind is off', async () => {
    prismaMock.config.updateMany.mockResolvedValue({ count: 0 })

    expect(await openRewindToEveryone(2026, 'system')).toEqual({ switched: false, notified: 0 })
    expect(logAuditEvent).not.toHaveBeenCalled()
    expect(enqueueSeasonReadyNotifications).not.toHaveBeenCalled()
  })
})
