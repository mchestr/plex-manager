/**
 * @jest-environment node
 */

/**
 * `REWIND_STALE_SWEEP` (P2.17, design 9.3): a run lost with its worker is
 * failed as `WORKER_LOST` and re-enqueued once; a queued run whose job
 * vanished is `JOB_LOST`; a run still inside 15 minutes is left alone.
 */

import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { processRewindStaleSweep } from '@/lib/queue/jobs/rewind-stale-sweep'
import { getRewindQueue } from '@/lib/queue/rewind-producers'
import { enqueueRewindGeneration } from '@/lib/rewind/enqueue-generation'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/queue/rewind-producers', () => ({ getRewindQueue: jest.fn() }))
jest.mock('@/lib/rewind/enqueue-generation', () => ({ enqueueRewindGeneration: jest.fn() }))
jest.mock('@/lib/rewind/season-runs', () => ({ scheduleSeasonOpenRun: jest.fn(async () => null) }))

const NOW = new Date('2026-12-05T12:00:00Z')
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000)

const jobStates = new Map<string, string>()
const queue = {
  getJob: jest.fn(async (id: string) =>
    jobStates.has(id) ? { getState: async () => jobStates.get(id) } : undefined
  ),
}
const enqueue = jest.mocked(enqueueRewindGeneration)

interface Row {
  id: string
  status: string
  startedAt: Date | null
  createdAt: Date
  error?: { code: string; requeuedAs?: string } | null
}

/**
 * An in-memory `RewindGeneration` table behind the Prisma calls the sweep
 * makes, so a second sweep sees what the first one wrote.
 */
function table(rows: Row[]) {
  const all = rows.map((row) => ({ userId: 'user-1', year: 2026, kind: 'member', wrappedId: 'wrapped-1', jobId: row.id, ...row }))
  type Where = { status?: string; startedAt?: { lt: Date }; createdAt?: { lt?: Date; gt?: Date }; id?: string }
  const matches = (row: (typeof all)[number], where: Where) =>
    (!where.id || row.id === where.id) &&
    (!where.status || row.status === where.status) &&
    (!where.startedAt || (row.startedAt !== null && row.startedAt < where.startedAt.lt)) &&
    (!where.createdAt?.lt || row.createdAt < where.createdAt.lt) &&
    (!where.createdAt?.gt || row.createdAt > where.createdAt.gt)

  prismaMock.rewindGeneration.findMany.mockImplementation((async ({ where }: { where: Where }) =>
    all.filter((row) => matches(row, where))) as never)
  prismaMock.rewindGeneration.updateMany.mockImplementation((async ({ where, data }: { where: Where; data: Partial<Row> }) => {
    const hit = all.filter((row) => matches(row, where))
    hit.forEach((row) => Object.assign(row, data))
    return { count: hit.length }
  }) as never)
  prismaMock.rewindGeneration.update.mockImplementation((async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
    const row = all.find((r) => r.id === where.id)!
    Object.assign(row, data)
    return row
  }) as never)
  prismaMock.rewindGeneration.count.mockImplementation((async ({ where }: { where: Where & { error?: { equals: string } } }) => {
    if (where.error) return all.filter((row) => row.error?.requeuedAs === where.error!.equals).length
    return all.filter((row) => matches(row, where)).length
  }) as never)
  enqueue.mockImplementation(async () => {
    const id = `gen-retry-${all.length}`
    all.push({ userId: 'user-1', year: 2026, kind: 'member', wrappedId: 'wrapped-1', jobId: id, id, status: 'queued', startedAt: null, createdAt: NOW, error: null })
    jobStates.set(id, 'waiting')
    return { alreadyQueued: false, generationId: id }
  })
  return all
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.useFakeTimers().setSystemTime(NOW)
  jobStates.clear()
  jest.mocked(getRewindQueue).mockReturnValue(queue as never)
  prismaMock.plexWrapped.updateMany.mockResolvedValue({ count: 0 })
})

afterEach(() => {
  jest.useRealTimers()
})

describe('processRewindStaleSweep', () => {
  it('fails a run stale for 16 minutes as WORKER_LOST and re-enqueues it once', async () => {
    const rows = table([{ id: 'gen-1', status: 'running', startedAt: minutesAgo(16), createdAt: minutesAgo(17) }])

    const result = await processRewindStaleSweep()

    expect(result).toMatchObject({ workerLost: 1, requeued: 1 })
    expect(rows[0]).toMatchObject({ status: 'failed', error: { code: 'WORKER_LOST', requeuedAs: 'gen-retry-1' } })
    expect(enqueue).toHaveBeenCalledWith({ userId: 'user-1', year: 2026, kind: 'member' })
  })

  it('does not re-enqueue a re-run that is lost again', async () => {
    const rows = table([{ id: 'gen-1', status: 'running', startedAt: minutesAgo(16), createdAt: minutesAgo(17) }])
    await processRewindStaleSweep()

    // The re-run starts and is lost with its worker too.
    Object.assign(rows[1], { status: 'running', startedAt: minutesAgo(16) })
    jobStates.delete('gen-retry-1')
    const result = await processRewindStaleSweep()

    expect(result).toMatchObject({ workerLost: 1, requeued: 0 })
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(rows[1]).toMatchObject({ status: 'failed', error: { code: 'WORKER_LOST' } })
    expect(prismaMock.plexWrapped.updateMany).toHaveBeenCalledWith({
      where: { id: 'wrapped-1', status: { not: 'completed' } },
      data: { status: 'failed', error: '{"code":"WORKER_LOST"}' },
    })
  })

  it('does not re-enqueue when a newer generation exists', async () => {
    table([
      { id: 'gen-1', status: 'running', startedAt: minutesAgo(16), createdAt: minutesAgo(17) },
      { id: 'gen-2', status: 'completed', startedAt: minutesAgo(5), createdAt: minutesAgo(6) },
    ])

    const result = await processRewindStaleSweep()

    expect(result).toMatchObject({ workerLost: 1, requeued: 0 })
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('leaves a run that started 10 minutes ago alone', async () => {
    const rows = table([{ id: 'gen-1', status: 'running', startedAt: minutesAgo(10), createdAt: minutesAgo(11) }])

    const result = await processRewindStaleSweep()

    expect(result).toMatchObject({ workerLost: 0, requeued: 0, jobLost: 0 })
    expect(rows[0].status).toBe('running')
  })

  it('leaves a stale-looking run whose job is still active alone', async () => {
    const rows = table([{ id: 'gen-1', status: 'running', startedAt: minutesAgo(16), createdAt: minutesAgo(17) }])
    jobStates.set('gen-1', 'active')

    await processRewindStaleSweep()

    expect(rows[0].status).toBe('running')
  })

  it('fails a queued run whose job vanished as JOB_LOST, but not one still waiting', async () => {
    const rows = table([
      { id: 'gen-lost', status: 'queued', startedAt: null, createdAt: minutesAgo(5) },
      { id: 'gen-waiting', status: 'queued', startedAt: null, createdAt: minutesAgo(5) },
      { id: 'gen-new', status: 'queued', startedAt: null, createdAt: minutesAgo(1) },
    ])
    jobStates.set('gen-waiting', 'waiting')

    const result = await processRewindStaleSweep()

    expect(result.jobLost).toBe(1)
    expect(rows.map((row) => row.status)).toEqual(['failed', 'queued', 'queued'])
    expect(rows[0].error).toEqual({ code: 'JOB_LOST' })
  })

  it('closes a Rewind left generating by the old in-request generation', async () => {
    table([])
    prismaMock.plexWrapped.updateMany.mockResolvedValue({ count: 2 })

    const result = await processRewindStaleSweep()

    expect(result.abandoned).toBe(2)
    expect(prismaMock.plexWrapped.updateMany).toHaveBeenCalledWith({
      where: {
        status: 'generating',
        updatedAt: { lt: minutesAgo(15) },
        generations: { none: { status: { in: ['queued', 'running'] } } },
      },
      data: { status: 'failed', error: '{"code":"WORKER_LOST"}' },
    })
  })
})
