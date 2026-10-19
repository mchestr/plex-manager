/**
 * @jest-environment node
 */

/**
 * The `REWIND_GENERATE_USER` processor (P2.17): the per-member lock, the
 * atomic final write that keeps `previousData` (RWP-14, FR-40), typed
 * failures, the 5-minute limit and shutdown retries.
 */

import { UnrecoverableError, type Job } from 'bullmq'
import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { processRewindGenerateUser } from '@/lib/queue/jobs/rewind'
import { acquireGenerationLock } from '@/lib/queue/redis-lock'
import type { RewindGenerateUserPayload } from '@/lib/queue/types'
import { generateRewindV2 } from '@/lib/wrapped/pipeline/generate-v2'
import { RewindGenerationError } from '@/lib/wrapped/pipeline/generation-error'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/queue/connection', () => ({ getRedisConnection: jest.fn(() => ({ fake: 'redis' })) }))
jest.mock('@/lib/queue/redis-lock', () => ({ acquireGenerationLock: jest.fn() }))
jest.mock('@/lib/wrapped/pipeline/generate-v2', () => ({ generateRewindV2: jest.fn() }))

let mockShutdown = new AbortController()
jest.mock('@/lib/instrumentation/shutdown', () => ({
  get shutdownSignal() {
    return mockShutdown.signal
  },
}))

const generate = jest.mocked(generateRewindV2)
const acquire = jest.mocked(acquireGenerationLock)
const release = jest.fn(async () => true)

const NEW_DATA = { summary: 'New summary', archetype: { name: 'The Binger' }, metadata: {} }

function job(overrides: { id?: string; attemptsMade?: number; attempts?: number } = {}): Job<RewindGenerateUserPayload> {
  return {
    id: overrides.id ?? 'gen-1',
    data: { generationId: overrides.id ?? 'gen-1', userId: 'user-1', year: 2026 },
    attemptsMade: overrides.attemptsMade ?? 0,
    opts: { attempts: overrides.attempts ?? 3 },
  } as unknown as Job<RewindGenerateUserPayload>
}

function generationUpdates() {
  return prismaMock.rewindGeneration.update.mock.calls.map(([args]) => args.data)
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  mockShutdown = new AbortController()
  prismaMock.rewindGeneration.findUnique.mockResolvedValue({ wrappedId: 'wrapped-1', status: 'queued' } as never)
  prismaMock.lLMUsage.aggregate.mockResolvedValue({ _count: { _all: 2 }, _sum: { cost: 0.0123 } } as never)
  prismaMock.$transaction.mockImplementation((async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock)) as never)
  acquire.mockResolvedValue({ release })
})

describe('processRewindGenerateUser', () => {
  it('runs one of two jobs for one member; the second is skipped as LOCKED', async () => {
    let finishFirst!: () => void
    generate.mockImplementation(
      () => new Promise((resolve) => (finishFirst = () => resolve(NEW_DATA as never)))
    )
    prismaMock.plexWrapped.findUniqueOrThrow.mockResolvedValue({ status: 'pending', data: '{}' } as never)
    acquire.mockResolvedValueOnce({ release }).mockResolvedValueOnce(null)

    const first = processRewindGenerateUser(job({ id: 'gen-1' }))
    const second = await processRewindGenerateUser(job({ id: 'gen-2' }))
    finishFirst()

    expect(second).toEqual({ status: 'skipped' })
    expect(await first).toEqual({ status: 'completed' })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(prismaMock.rewindGeneration.update).toHaveBeenCalledWith({
      where: { id: 'gen-2' },
      data: expect.objectContaining({ status: 'skipped', error: { code: 'LOCKED' } }),
    })
    expect(acquire).toHaveBeenCalledWith({ fake: 'redis' }, { year: 2026, userId: 'user-1', owner: 'gen-1' })
  })

  it('copies the replaced data into previousData, and the Rewind stays completed throughout', async () => {
    generate.mockResolvedValue(NEW_DATA as never)
    prismaMock.plexWrapped.findUniqueOrThrow.mockResolvedValue({ status: 'completed', data: '{"old":true}' } as never)

    await expect(processRewindGenerateUser(job())).resolves.toEqual({ status: 'completed' })

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(generationUpdates()).toContainEqual(
      expect.objectContaining({ status: 'completed', previousData: '{"old":true}', llmCalls: 2, costUsd: 0.0123 })
    )
    expect(prismaMock.plexWrapped.update).toHaveBeenCalledWith({
      where: { id: 'wrapped-1' },
      data: expect.objectContaining({
        data: JSON.stringify(NEW_DATA),
        status: 'completed',
        dataVersion: 2,
        summary: 'New summary',
        archetype: 'The Binger',
      }),
    })
    // Never set back to generating, so the viewer and its share links keep working.
    expect(prismaMock.plexWrapped.updateMany).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('keeps no previousData for a first Rewind', async () => {
    generate.mockResolvedValue(NEW_DATA as never)
    prismaMock.plexWrapped.findUniqueOrThrow.mockResolvedValue({ status: 'generating', data: '{}' } as never)

    await processRewindGenerateUser(job())

    expect(generationUpdates()).toContainEqual(expect.objectContaining({ status: 'completed', previousData: null }))
  })

  it('leaves the data untouched on a failure, marking only the generation and a Rewind not yet completed', async () => {
    generate.mockRejectedValue(new RewindGenerationError('TAUTULLI_USER_NOT_FOUND', { retryable: false }))

    await expect(processRewindGenerateUser(job())).rejects.toBeInstanceOf(UnrecoverableError)

    expect(prismaMock.plexWrapped.update).not.toHaveBeenCalled()
    expect(generationUpdates()).toContainEqual(
      expect.objectContaining({ status: 'failed', error: { code: 'TAUTULLI_USER_NOT_FOUND' } })
    )
    expect(prismaMock.plexWrapped.updateMany).toHaveBeenCalledWith({
      where: { id: 'wrapped-1', status: { not: 'completed' } },
      data: { status: 'failed', error: '{"code":"TAUTULLI_USER_NOT_FOUND"}' },
    })
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('records TIMEOUT when the 5-minute limit passes, and does not retry', async () => {
    const limit = new AbortController()
    const timeout = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(limit.signal)
    generate.mockImplementation(async ({ signal }) => {
      limit.abort()
      expect(signal.aborted).toBe(true)
      throw new RewindGenerationError('UPSTREAM_ERROR', { retryable: true })
    })

    try {
      await expect(processRewindGenerateUser(job())).rejects.toThrow(new UnrecoverableError('TIMEOUT'))
      expect(timeout).toHaveBeenCalledWith(300_000)
    } finally {
      timeout.mockRestore()
    }
    expect(generationUpdates()).toContainEqual(expect.objectContaining({ status: 'failed', error: { code: 'TIMEOUT' } }))
  })

  it('puts a run cut off by shutdown back in the queue for BullMQ to retry', async () => {
    generate.mockImplementation(async ({ signal }) => {
      mockShutdown.abort()
      expect(signal.aborted).toBe(true)
      throw new RewindGenerationError('UPSTREAM_ERROR', { retryable: true })
    })

    const error = await processRewindGenerateUser(job()).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(UnrecoverableError)
    expect(generationUpdates().at(-1)).toEqual({ status: 'queued', error: { code: 'WORKER_LOST' } })
    expect(prismaMock.plexWrapped.updateMany).not.toHaveBeenCalled()
  })

  it('retries an upstream failure while attempts remain, then fails it', async () => {
    generate.mockRejectedValue(new RewindGenerationError('UPSTREAM_ERROR', { retryable: true }))

    const retried = await processRewindGenerateUser(job({ attemptsMade: 0 })).catch((e: unknown) => e)
    expect(retried).not.toBeInstanceOf(UnrecoverableError)
    expect(generationUpdates().at(-1)).toEqual({ status: 'queued', error: { code: 'UPSTREAM_ERROR' } })

    prismaMock.rewindGeneration.findUnique.mockResolvedValue({ wrappedId: 'wrapped-1', status: 'queued' } as never)
    await expect(processRewindGenerateUser(job({ attemptsMade: 2 }))).rejects.toThrow(
      new UnrecoverableError('UPSTREAM_ERROR')
    )
    expect(generationUpdates()).toContainEqual(
      expect.objectContaining({ status: 'failed', error: { code: 'UPSTREAM_ERROR' } })
    )
  })

  it('stops at once on a configuration error', async () => {
    generate.mockRejectedValue(new RewindGenerationError('NOT_CONFIGURED', { retryable: false }))

    await expect(processRewindGenerateUser(job())).rejects.toThrow(new UnrecoverableError('NOT_CONFIGURED'))
  })

  it('ignores a run the stale sweep already closed', async () => {
    prismaMock.rewindGeneration.findUnique.mockResolvedValue({ wrappedId: 'wrapped-1', status: 'failed' } as never)

    await expect(processRewindGenerateUser(job())).resolves.toEqual({ status: 'ignored' })
    expect(acquire).not.toHaveBeenCalled()
    expect(generate).not.toHaveBeenCalled()
  })

  it('passes the run its signal, ids and year', async () => {
    generate.mockResolvedValue(NEW_DATA as never)
    prismaMock.plexWrapped.findUniqueOrThrow.mockResolvedValue({ status: 'pending', data: '{}' } as never)

    await processRewindGenerateUser(job())

    expect(generate).toHaveBeenCalledWith({
      userId: 'user-1',
      year: 2026,
      wrappedId: 'wrapped-1',
      generationId: 'gen-1',
      signal: expect.any(AbortSignal),
    })
  })
})
