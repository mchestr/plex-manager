/**
 * @jest-environment node
 */

/**
 * `REWIND_SEASON_PREPARE` (P7.8): the steps run in order on BullMQ's step-job
 * pattern, a retry resumes at the stored step, the scheduled run carries
 * audience `all`, and `ensureSeasonPrepareScheduled` targets 00:15 on the
 * opening day in the westernmost zone, moving when a member's zone changes.
 */

import { WaitingChildrenError, type Job } from 'bullmq'
import { mockReset } from 'jest-mock-extended'

import { buildConfig } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { processRewindSeasonPrepare } from '@/lib/queue/jobs/rewind-season'
import { getRewindQueue } from '@/lib/queue/rewind-producers'
import { JOB_TYPES, type RewindSeasonPreparePayload } from '@/lib/queue/types'
import { enqueueFinalCut, ensureFinalCutScheduled, ensureSeasonPrepareScheduled } from '@/lib/rewind/season-runs'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/queue/rewind-producers', () => ({ getRewindQueue: jest.fn() }))
jest.mock('@/lib/queue/connection', () => ({ getRequestPathRedis: jest.fn(), readyWithin: jest.fn(async () => true) }))
jest.mock('@/lib/utils/server-zone', () => ({ serverZone: jest.fn(async () => 'America/Chicago') }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

interface FakeQueue {
  add: jest.Mock
  addBulk: jest.Mock
  getDeduplicationJobId: jest.Mock
  getJob: jest.Mock
}

let queue: FakeQueue

beforeEach(() => {
  mockReset(prismaMock)
  queue = {
    add: jest.fn(async (_name: string, _data: unknown, opts: { jobId?: string }) => ({ id: opts.jobId ?? 'job-new' })),
    addBulk: jest.fn(async () => []),
    getDeduplicationJobId: jest.fn(async () => null),
    getJob: jest.fn(),
  }
  jest.mocked(getRewindQueue).mockReturnValue(queue as never)
})

/** A parent job that is parked while children run, the way the Worker sees it. */
function prepareJob(data: RewindSeasonPreparePayload, children: Record<string, unknown> = {}) {
  const job = {
    id: 'prep-1',
    queueQualifiedName: 'bull:rewind-batch',
    data: { ...data },
    updateData: jest.fn(async (next: RewindSeasonPreparePayload) => {
      job.data = next
    }),
    moveToWaitingChildren: jest.fn(async () => true),
    getChildrenValues: jest.fn(async () => children),
  }
  return job
}

const asJob = (job: ReturnType<typeof prepareJob>) => job as unknown as Job<RewindSeasonPreparePayload>
const BASE: RewindSeasonPreparePayload = { year: 2026, through: '2026-11-30', audience: 'all', triggeredBy: 'scheduled' }

describe('processRewindSeasonPrepare', () => {
  it('runs the aggregate, then the warm batches, then Generate all, waiting for children between steps', async () => {
    const batch = { batch: '2026:0', keys: ['1', '2'], topSeries: [] }
    const job = prepareJob(BASE, { 'bull:rewind-batch:agg': { warmBatches: [batch] } })

    await expect(processRewindSeasonPrepare(asJob(job), 'token')).rejects.toBeInstanceOf(WaitingChildrenError)
    expect(queue.add).toHaveBeenCalledWith(
      JOB_TYPES.REWIND_SERVER_AGGREGATE,
      { year: 2026, through: '2026-11-30', warm: 'return' },
      expect.objectContaining({ jobId: 'prep-1-aggregate', parent: { id: 'prep-1', queue: 'bull:rewind-batch' }, failParentOnFailure: true })
    )
    expect(job.data.step).toBe('warm')

    await expect(processRewindSeasonPrepare(asJob(job), 'token')).rejects.toBeInstanceOf(WaitingChildrenError)
    expect(queue.addBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        name: JOB_TYPES.REWIND_METADATA_WARM,
        data: batch,
        opts: expect.objectContaining({ jobId: 'prep-1-warm-2026-0', ignoreDependencyOnFailure: true }),
      }),
    ])
    expect(job.data.step).toBe('generate')

    await expect(processRewindSeasonPrepare(asJob(job), 'token')).resolves.toEqual({ year: 2026, through: '2026-11-30', audience: 'all' })
    expect(queue.add).toHaveBeenLastCalledWith(
      JOB_TYPES.REWIND_GENERATE_ALL,
      { year: 2026, through: '2026-11-30', audience: 'all', scope: 'all' },
      expect.objectContaining({ jobId: 'prep-1-generate-all' })
    )
    expect(job.data.step).toBe('done')
    expect(queue.add).toHaveBeenCalledTimes(2)
  })

  it('resumes a retried job at its stored step', async () => {
    const job = prepareJob({ ...BASE, step: 'warm' }, {})

    await expect(processRewindSeasonPrepare(asJob(job), 'token')).rejects.toBeInstanceOf(WaitingChildrenError)
    expect(queue.add).not.toHaveBeenCalledWith(JOB_TYPES.REWIND_SERVER_AGGREGATE, expect.anything(), expect.anything())
    expect(job.data.step).toBe('generate')
  })

  it('passes the buttons’ config audience on to Generate all', async () => {
    const job = prepareJob({ ...BASE, audience: 'config', triggeredBy: 'admin', step: 'generate' })

    await processRewindSeasonPrepare(asJob(job), 'token')
    expect(queue.add).toHaveBeenCalledWith(JOB_TYPES.REWIND_GENERATE_ALL, expect.objectContaining({ audience: 'config' }), expect.anything())
  })
})

describe('ensureSeasonPrepareScheduled', () => {
  const NOW = Date.parse('2026-11-20T12:00:00Z')

  function members(zones: string[]) {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindSeasonOpens: '12-01' }))
    prismaMock.user.findMany.mockResolvedValue(zones.map((timezone) => ({ timezone })) as never)
  }

  it('schedules 02:15 Chicago time for a Chicago server with one Los Angeles member, with audience all', async () => {
    members(['America/Los_Angeles'])

    const at = await ensureSeasonPrepareScheduled(2026, NOW)

    expect(at?.toISOString()).toBe('2026-12-01T08:15:00.000Z')
    const at0215Chicago = Date.parse('2026-12-01T08:15:00Z')
    expect(queue.add).toHaveBeenCalledWith(
      JOB_TYPES.REWIND_SEASON_PREPARE,
      { year: 2026, through: '2026-11-30', audience: 'all', triggeredBy: 'scheduled' },
      expect.objectContaining({
        jobId: `rewind-prepare-2026-${at0215Chicago}`,
        delay: at0215Chicago - NOW,
        deduplication: { id: 'rewind:prepare:2026:2026-11-30' },
      })
    )
  })

  it('keeps the delayed job while the instant holds', async () => {
    members(['America/Los_Angeles'])
    queue.getDeduplicationJobId.mockResolvedValue(`rewind-prepare-2026-${Date.parse('2026-12-01T08:15:00Z')}`)

    await ensureSeasonPrepareScheduled(2026, NOW)
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('replaces the delayed job when the member moves to a later zone', async () => {
    members(['Pacific/Honolulu'])
    const old = { isDelayed: jest.fn(async () => true), remove: jest.fn(async () => undefined) }
    queue.getDeduplicationJobId.mockResolvedValue(`rewind-prepare-2026-${Date.parse('2026-12-01T08:15:00Z')}`)
    queue.getJob.mockResolvedValue(old)

    const at = await ensureSeasonPrepareScheduled(2026, NOW)

    expect(at?.toISOString()).toBe('2026-12-01T10:15:00.000Z')
    expect(old.remove).toHaveBeenCalled()
    expect(queue.add).toHaveBeenCalledWith(
      JOB_TYPES.REWIND_SEASON_PREPARE,
      expect.objectContaining({ audience: 'all' }),
      expect.objectContaining({ delay: Date.parse('2026-12-01T10:15:00Z') - NOW })
    )
  })

  it('leaves a run that has started alone, and schedules nothing once the instant has passed', async () => {
    members([])
    queue.getDeduplicationJobId.mockResolvedValue('rewind-prepare-2026-1')
    queue.getJob.mockResolvedValue({ isDelayed: jest.fn(async () => false), remove: jest.fn() })
    await ensureSeasonPrepareScheduled(2026, NOW)
    expect(queue.add).not.toHaveBeenCalled()

    expect(await ensureSeasonPrepareScheduled(2026, Date.parse('2026-12-02T00:00:00Z'))).toBeNull()
  })
})

describe('ensureFinalCutScheduled (P8.5)', () => {
  const NOW = Date.parse('2026-12-20T12:00:00Z')
  const AT = Date.parse('2027-01-01T08:30:00Z') // 00:30 in Los Angeles

  it('keeps one delayed REWIND_FINAL_CUT for 00:30 on 1 January in the westernmost zone, never retried', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ timezone: 'America/Los_Angeles' }] as never)

    expect((await ensureFinalCutScheduled(2026, NOW))?.toISOString()).toBe('2027-01-01T08:30:00.000Z')
    expect(queue.add).toHaveBeenCalledWith(
      JOB_TYPES.REWIND_FINAL_CUT,
      { year: 2026, through: '2026-12-31', triggeredBy: 'scheduled' },
      expect.objectContaining({ attempts: 1, jobId: `rewind-final-2026-${AT}`, delay: AT - NOW, deduplication: { id: 'rewind:final:2026' } })
    )
  })

  it('keeps the delayed job while the instant holds, and schedules nothing once it has passed', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ timezone: 'America/Los_Angeles' }] as never)
    queue.getDeduplicationJobId.mockResolvedValue(`rewind-final-2026-${AT}`)

    await ensureFinalCutScheduled(2026, NOW)
    expect(queue.add).not.toHaveBeenCalled()
    expect(await ensureFinalCutScheduled(2026, AT)).toBeNull()
  })
})

describe('enqueueFinalCut (P8.5, P8.10)', () => {
  it('joins the year run for the real final cut', async () => {
    await enqueueFinalCut({ year: 2026, through: '2026-12-31', triggeredBy: 'admin' })
    expect(queue.add).toHaveBeenCalledWith(
      JOB_TYPES.REWIND_FINAL_CUT,
      { year: 2026, through: '2026-12-31', triggeredBy: 'admin' },
      expect.objectContaining({ attempts: 1, deduplication: { id: 'rewind:final:2026' } })
    )
  })

  it('gives a staging rehearsal its own id, so it never joins the delayed 1 January run', async () => {
    queue.getDeduplicationJobId.mockResolvedValue('rewind-final-2026-1798792200000')
    const run = await enqueueFinalCut({ year: 2026, through: '2026-12-10', triggeredBy: 'script' })
    expect(queue.add).toHaveBeenCalledWith(
      JOB_TYPES.REWIND_FINAL_CUT,
      { year: 2026, through: '2026-12-10', triggeredBy: 'script' },
      expect.objectContaining({ deduplication: { id: 'rewind:final:2026:2026-12-10' } })
    )
    expect(run.alreadyQueued).toBe(false)
  })
})
