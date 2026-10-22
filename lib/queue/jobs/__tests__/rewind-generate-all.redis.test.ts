/**
 * @jest-environment node
 */

/**
 * `REWIND_GENERATE_ALL` against the server in TEST_REDIS_URL (P7.8, BP-22):
 * a real parent on a batch queue fans out real `REWIND_GENERATE_USER`
 * children on a generation queue, and waits for them. Postgres and the
 * pipeline are mocked; BullMQ, the parent/child flow and the per-member lock
 * are real.
 *
 * - members with a queued or running generation are left out;
 * - a child that finds the member's lock taken completes as `skipped`, and
 *   the parent still completes;
 * - the buttons' `config` audience fans out only admins while
 *   `rewindAudience` is `admins`, and the season-open `all` audience everyone;
 * - Retry failed picks only members whose latest run failed.
 */

import { randomUUID } from 'node:crypto'
import { Queue, QueueEvents, Worker, type Job } from 'bullmq'
import Redis from 'ioredis'
import { mockReset } from 'jest-mock-extended'

import { buildConfig } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { processRewindGenerateUser } from '@/lib/queue/jobs/rewind'
import { processRewindGenerateAll } from '@/lib/queue/jobs/rewind-season'
import { acquireGenerationLock } from '@/lib/queue/redis-lock'
import { JOB_TYPES, type RewindGenerateAllPayload, type RewindGenerateUserPayload } from '@/lib/queue/types'
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
jest.mock('@/lib/wrapped/pipeline/generate-user', () => ({ generateUserRewind: jest.fn() }))
jest.mock('@/lib/instrumentation/shutdown', () => ({ shutdownSignal: new AbortController().signal, onShutdown: jest.fn() }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

describeRedis('REWIND_GENERATE_ALL fan-out', (redisUrl) => {
  const run = randomUUID()
  let redis: Redis
  let batch: Queue
  let gen: Queue
  let events: QueueEvents
  let workers: Worker[]
  /** The generation rows the fan-out created, by id. */
  let rows: Map<string, { userId: string; wrappedId: string }>

  /** Every client the suite opens; BullMQ never closes a connection it was handed. */
  const connections: Redis[] = []
  const connect = () => {
    const client = new Redis(redisUrl, { maxRetriesPerRequest: null })
    connections.push(client)
    return client
  }

  beforeAll(async () => {
    redis = connect()
    batch = new Queue(`rewind-batch-test-${run}`, { connection: redis })
    gen = new Queue(`rewind-gen-test-${run}`, { connection: redis })
    Object.assign(mockQueues, { gen, batch, redis })
    events = new QueueEvents(batch.name, { connection: connect() })
    await events.waitUntilReady()
    workers = [
      new Worker(batch.name, (job: Job, token?: string) => processRewindGenerateAll(job, token), { connection: connect() }),
      new Worker(gen.name, (job: Job) => processRewindGenerateUser(job as Job<RewindGenerateUserPayload>), {
        connection: connect(),
        concurrency: 4,
      }),
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
    rows = new Map()
    jest.mocked(generateUserRewind).mockClear()
    jest.mocked(generateUserRewind).mockResolvedValue({ status: 'completed' } as never)
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindAudience: 'admins' }))
    prismaMock.plexWrapped.createMany.mockResolvedValue({ count: 0 })
    prismaMock.plexWrapped.findMany.mockImplementation((async (args: { where: { userId: { in: string[] } } }) =>
      args.where.userId.in.map((userId) => ({ id: `w-${userId}`, userId }))) as never)
    prismaMock.rewindGeneration.createMany.mockImplementation((async (args: { data: Array<{ id: string; userId: string; wrappedId: string }> }) => {
      for (const row of args.data) rows.set(row.id, row)
      return { count: args.data.length }
    }) as never)
    prismaMock.plexWrapped.updateMany.mockResolvedValue({ count: 0 })
    prismaMock.rewindGeneration.findUnique.mockImplementation((async (args: { where: { id: string } }) => {
      const row = rows.get(args.where.id)
      return row ? { wrappedId: row.wrappedId, status: 'queued', kind: 'season', copyPolicy: 'default' } : null
    }) as never)
    prismaMock.rewindGeneration.update.mockResolvedValue({} as never)
    prismaMock.lLMUsage.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { cost: null } } as never)
  })

  async function fanOut(data: Omit<RewindGenerateAllPayload, 'step'>) {
    const job = await batch.add(JOB_TYPES.REWIND_GENERATE_ALL, data)
    await job.waitUntilFinished(events, 15_000)
    return job
  }

  const generatedUsers = () => jest.mocked(generateUserRewind).mock.calls.map(([options]) => options.userId).sort()

  it('leaves out members whose generation is queued or running, and generates the rest with the payload audience', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }] as never)

    await fanOut({ year: 2026, through: '2026-11-30', audience: 'all', scope: 'all' })

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ rewindGenerations: { none: { year: 2026, status: { in: ['queued', 'running'] } } } }),
      })
    )
    expect(generatedUsers()).toEqual(['u1', 'u2'])
    expect(jest.mocked(generateUserRewind).mock.calls[0][0]).toMatchObject({ kind: 'season', audience: 'all', through: '2026-11-30' })
  })

  it('completes a child that loses the member lock as skipped, and the parent still completes', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'locked' }, { id: 'free' }] as never)
    const held = await acquireGenerationLock(redis, { year: 2026, userId: 'locked', owner: 'someone-else' })
    expect(held).not.toBeNull()

    const job = await fanOut({ year: 2026, through: '2026-11-30', audience: 'all', scope: 'all' })
    await held?.release()

    expect(await job.getState()).toBe('completed')
    expect(generatedUsers()).toEqual(['free'])
    expect(prismaMock.rewindGeneration.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'skipped', error: { code: 'LOCKED' } }) })
    )
  })

  it('fans out only admins under the config audience while rewindAudience is admins', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'admin-1' }] as never)

    await fanOut({ year: 2026, through: '2026-11-30', audience: 'config', scope: 'all' })
    expect(prismaMock.user.findMany.mock.calls[0][0]?.where).toMatchObject({ isAdmin: true })

    prismaMock.user.findMany.mockClear()
    await fanOut({ year: 2026, through: '2026-11-30', audience: 'all', scope: 'all' })
    expect(prismaMock.user.findMany.mock.calls[0][0]?.where).not.toHaveProperty('isAdmin')
  })

  it('Retry failed picks only the members whose latest run failed', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'ok' }, { id: 'lost' }, { id: 'broken' }] as never)
    prismaMock.rewindGeneration.findMany.mockResolvedValue([
      { userId: 'ok', status: 'completed' },
      { userId: 'lost', status: 'failed' },
      { userId: 'broken', status: 'failed' },
    ] as never)

    await fanOut({ year: 2026, through: '2026-11-30', audience: 'config', scope: 'failed' })

    expect(generatedUsers()).toEqual(['broken', 'lost'])
  })
})
