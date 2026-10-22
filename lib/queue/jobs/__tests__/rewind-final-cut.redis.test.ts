/**
 * @jest-environment node
 */

/**
 * `REWIND_FINAL_CUT` against the server in TEST_REDIS_URL (P8.5): a real
 * parent on a batch queue runs the full-year aggregate, the warm batches and
 * the `final-cut` fan-out as real child jobs, and the fan-out's
 * `REWIND_GENERATE_USER` children run on a generation queue. Postgres, the
 * aggregate, the warm and the pipeline are mocked; BullMQ's flow is real.
 */

import { randomUUID } from 'node:crypto'
import { Queue, QueueEvents, Worker, type Job } from 'bullmq'
import Redis from 'ioredis'
import { mockReset } from 'jest-mock-extended'

import { buildConfig } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { processRewindGenerateUser } from '@/lib/queue/jobs/rewind'
import { processRewindFinalCut } from '@/lib/queue/jobs/rewind-final-cut'
import { processRewindGenerateAll } from '@/lib/queue/jobs/rewind-season'
import { JOB_TYPES, type RewindFinalCutPayload, type RewindGenerateUserPayload } from '@/lib/queue/types'
import { finalCutOpensAt } from '@/lib/rewind/season-runs'
import { generateUserRewind } from '@/lib/wrapped/pipeline/generate-user'
import { describeRedis } from '@/test/helpers/integration'

const mockQueues: { gen: Queue | null; batch: Queue | null; redis: Redis | null } = { gen: null, batch: null, redis: null }

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/queue/rewind-producers', () => ({
  getRewindQueue: (name: string) => (name === 'rewind-gen' ? mockQueues.gen : mockQueues.batch),
}))
jest.mock('@/lib/queue/connection', () => ({
  ...jest.requireActual('@/lib/queue/connection'),
  getRedisConnection: () => mockQueues.redis,
}))
jest.mock('@/lib/rewind/season-runs', () => ({
  finalCutOpensAt: jest.fn(() => new Date('2026-01-01T08:30:00Z')),
  seasonZones: jest.fn(async () => ['America/Chicago', 'America/Los_Angeles']),
}))
jest.mock('@/lib/env', () => ({ getEnv: () => ({ REWIND_STAGING: undefined }) }))
jest.mock('@/lib/wrapped/pipeline/generate-user', () => ({ generateUserRewind: jest.fn() }))
jest.mock('@/lib/instrumentation/shutdown', () => ({ shutdownSignal: new AbortController().signal, onShutdown: jest.fn() }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

jest.setTimeout(30_000)

describeRedis('REWIND_FINAL_CUT', (redisUrl) => {
  const run = randomUUID()
  let redis: Redis
  let batch: Queue
  let gen: Queue
  let events: QueueEvents
  let workers: Worker[]
  /** What ran, in order: job names with the payload fields the test checks. */
  let steps: string[]
  let rows: Map<string, { userId: string; wrappedId: string; kind: string; copyPolicy?: string }>

  const connections: Redis[] = []
  const connect = () => {
    const client = new Redis(redisUrl, { maxRetriesPerRequest: null })
    connections.push(client)
    return client
  }

  async function batchProcessor(job: Job, token?: string) {
    if (job.name === JOB_TYPES.REWIND_FINAL_CUT) return processRewindFinalCut(job as Job<RewindFinalCutPayload>, token)
    if (job.name === JOB_TYPES.REWIND_SERVER_AGGREGATE) {
      steps.push(`aggregate ${job.data.through} finalCut=${job.data.finalCut}`)
      return { warmBatches: [{ batch: '2026:0', keys: ['501'], topSeries: [] }] }
    }
    if (job.name === JOB_TYPES.REWIND_METADATA_WARM) {
      steps.push(`warm ${job.data.batch}`)
      return { fetched: 1 }
    }
    if (job.name === JOB_TYPES.REWIND_GENERATE_ALL) {
      if (!job.data.step) steps.push(`generate-all ${job.data.kind} ${job.data.through}`)
      return processRewindGenerateAll(job, token)
    }
    throw new Error(`unexpected ${job.name}`)
  }

  beforeAll(async () => {
    redis = connect()
    batch = new Queue(`rewind-batch-final-${run}`, { connection: redis })
    gen = new Queue(`rewind-gen-final-${run}`, { connection: redis })
    Object.assign(mockQueues, { gen, batch, redis })
    events = new QueueEvents(batch.name, { connection: connect() })
    await events.waitUntilReady()
    workers = [
      new Worker(batch.name, batchProcessor, { connection: connect() }),
      new Worker(gen.name, (job: Job) => processRewindGenerateUser(job as Job<RewindGenerateUserPayload>), { connection: connect(), concurrency: 4 }),
    ]
  })

  afterAll(async () => {
    await Promise.all(workers.map((worker) => worker.close()))
    await events.close()
    await batch.obliterate({ force: true })
    await gen.obliterate({ force: true })
    await batch.close()
    await gen.close()
    await Promise.all(connections.map((client) => client.quit()))
  })

  beforeEach(() => {
    mockReset(prismaMock)
    steps = []
    rows = new Map()
    jest.mocked(finalCutOpensAt).mockReturnValue(new Date('2026-01-01T08:30:00Z'))
    jest.mocked(generateUserRewind).mockClear()
    jest.mocked(generateUserRewind).mockImplementation((async (options: { userId: string }) => {
      steps.push(`generate ${options.userId}`)
      return { status: 'completed' }
    }) as never)
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindAudience: 'all' }))
    prismaMock.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }] as never)
    prismaMock.plexWrapped.createMany.mockResolvedValue({ count: 0 })
    prismaMock.plexWrapped.findMany.mockImplementation((async (args: { where: { userId: { in: string[] } } }) =>
      args.where.userId.in.map((userId) => ({ id: `w-${userId}`, userId }))) as never)
    prismaMock.rewindGeneration.createMany.mockImplementation((async (args: { data: Array<{ id: string; userId: string; wrappedId: string; kind: string; copyPolicy?: string }> }) => {
      for (const row of args.data) rows.set(row.id, row)
      return { count: args.data.length }
    }) as never)
    prismaMock.plexWrapped.updateMany.mockResolvedValue({ count: 0 })
    prismaMock.rewindGeneration.findUnique.mockImplementation((async (args: { where: { id: string } }) => {
      const row = rows.get(args.where.id)
      return row ? { wrappedId: row.wrappedId, status: 'queued', kind: row.kind, copyPolicy: row.copyPolicy ?? 'default' } : null
    }) as never)
    prismaMock.rewindGeneration.update.mockResolvedValue({} as never)
    prismaMock.lLMUsage.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { cost: null } } as never)
  })

  async function finalCut(data: Omit<RewindFinalCutPayload, 'step'>) {
    const job = await batch.add(JOB_TYPES.REWIND_FINAL_CUT, data, { jobId: `final-${randomUUID()}` })
    await job.waitUntilFinished(events, 15_000).catch(() => undefined)
    return job
  }

  /** Waits for the fan-out the final cut queued, which it does not wait for. */
  async function fanOutDone() {
    for (let i = 0; i < 100; i++) {
      const jobs = await batch.getJobs(['completed'])
      const all = jobs.find((job) => job.name === JOB_TYPES.REWIND_GENERATE_ALL && job.data.step === 'done')
      if (all && (await all.getState()) === 'completed') return
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    const all = await batch.getJobs(['completed', 'failed', 'waiting', 'active', 'delayed', 'waiting-children'])
    throw new Error(`the fan-out did not finish: ${JSON.stringify(steps)} ${JSON.stringify(await Promise.all(all.map(async (j) => [j.name, j.id, await j.getState(), j.data.step, j.failedReason])))}`)
  }

  it('runs the full-year aggregate, then the warm, then a final-cut fan-out with changed slots', async () => {
    const job = await finalCut({ year: 2026, through: '2026-12-31', triggeredBy: 'admin' })
    await fanOutDone()

    expect(await job.getState()).toBe('completed')
    expect(steps.slice(0, 3)).toEqual(['aggregate 2026-12-31 finalCut=true', 'warm 2026:0', 'generate-all final-cut 2026-12-31'])
    expect(steps.slice(3).sort()).toEqual(['generate u1', 'generate u2'])
    expect([...rows.values()].map((row) => [row.kind, row.copyPolicy])).toEqual([
      ['final-cut', 'changed-slots'],
      ['final-cut', 'changed-slots'],
    ])
    expect(jest.mocked(generateUserRewind).mock.calls[0][0]).toMatchObject({
      kind: 'final-cut',
      copyPolicy: 'changed-slots',
      through: '2026-12-31',
      finalCut: true,
      audience: 'all',
    })
  })

  it('refuses before 00:30 on 1 January in the westernmost zone, queueing nothing', async () => {
    jest.mocked(finalCutOpensAt).mockReturnValue(new Date(Date.now() + 60_000))

    const job = await finalCut({ year: 2026, through: '2026-12-31', triggeredBy: 'scheduled' })

    expect(await job.getState()).toBe('failed')
    expect(job.failedReason ?? (await batch.getJob(job.id!))?.failedReason).toBe('NOT_YET')
    expect(steps).toEqual([])
  })

  it('refuses an early through outside staging', async () => {
    const job = await finalCut({ year: 2026, through: '2026-12-10', triggeredBy: 'script' })

    expect((await batch.getJob(job.id!))?.failedReason).toBe('EARLY_THROUGH')
    expect(steps).toEqual([])
  })

  it('leaves out the members it already finished, so a re-run is a no-op', async () => {
    prismaMock.user.findMany.mockResolvedValue([])

    await finalCut({ year: 2026, through: '2026-12-31', triggeredBy: 'admin' })
    await fanOutDone()

    expect(prismaMock.user.findMany.mock.calls[0][0]?.where).toMatchObject({
      plexWrapped: { none: { year: 2026, status: 'completed', finalCutAt: { not: null }, dataThrough: { gte: new Date('2026-12-31T00:00:00.000Z') } } },
    })
    expect(generateUserRewind).not.toHaveBeenCalled()
  })
})
