/**
 * @jest-environment node
 */

/**
 * The `REWIND_GENERATE_USER` processor (P2.17, P5.9): the per-member lock,
 * the v3 pipeline in persist mode (its final write is tested in
 * `lib/wrapped/pipeline/__tests__/persist.test.ts`), skipped members, typed
 * failures, the 5-minute limit and shutdown retries.
 */

import { UnrecoverableError, type Job } from 'bullmq'
import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { processRewindGenerateUser } from '@/lib/queue/jobs/rewind'
import { acquireGenerationLock } from '@/lib/locks/generation-lock'
import type { RewindGenerateUserPayload } from '@/lib/queue/types'
import { generateUserRewind } from '@/lib/wrapped/pipeline/generate-user'
import { RewindGenerationError } from '@/lib/wrapped/pipeline/generation-error'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/queue/connection', () => ({ getRedisConnection: jest.fn(() => ({ fake: 'redis' })) }))
jest.mock('@/lib/locks/generation-lock', () => ({ acquireGenerationLock: jest.fn() }))
jest.mock('@/lib/wrapped/pipeline/generate-user', () => ({ generateUserRewind: jest.fn() }))

let mockShutdown = new AbortController()
jest.mock('@/lib/instrumentation/shutdown', () => ({
  get shutdownSignal() {
    return mockShutdown.signal
  },
}))

const generate = jest.mocked(generateUserRewind)
const acquire = jest.mocked(acquireGenerationLock)
const release = jest.fn(async () => true)

const COMPLETED = { status: 'completed', data: { version: 3 }, trail: {} }

function job(overrides: { id?: string; attemptsMade?: number; attempts?: number; exclusion?: true } = {}): Job<RewindGenerateUserPayload> {
  return {
    id: overrides.id ?? 'gen-1',
    data: { generationId: overrides.id ?? 'gen-1', userId: 'user-1', year: 2026, ...(overrides.exclusion && { exclusion: true }) },
    attemptsMade: overrides.attemptsMade ?? 0,
    opts: { attempts: overrides.attempts ?? 3 },
  } as unknown as Job<RewindGenerateUserPayload>
}

const QUEUED = { wrappedId: 'wrapped-1', status: 'queued', kind: 'member', copyPolicy: 'default' }

function generationUpdates() {
  return prismaMock.rewindGeneration.update.mock.calls.map(([args]) => args.data)
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  mockShutdown = new AbortController()
  prismaMock.rewindGeneration.findUnique.mockResolvedValue(QUEUED as never)
  prismaMock.lLMUsage.aggregate.mockResolvedValue({ _count: { _all: 2 }, _sum: { cost: 0.0123 } } as never)
  prismaMock.$transaction.mockImplementation((async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock)) as never)
  acquire.mockResolvedValue({ release })
})

describe('processRewindGenerateUser', () => {
  it('runs one of two jobs for one member; the second is skipped as LOCKED', async () => {
    let finishFirst!: () => void
    generate.mockImplementation(
      () => new Promise((resolve) => (finishFirst = () => resolve(COMPLETED as never)))
    )
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

  it('completes when the pipeline has written the Rewind, and releases the lock', async () => {
    generate.mockResolvedValue(COMPLETED as never)

    await expect(processRewindGenerateUser(job())).resolves.toEqual({ status: 'completed' })

    expect(generationUpdates()).toContainEqual(expect.objectContaining({ status: 'running' }))
    // The pipeline's own transaction writes the data; the job never sets a Rewind back to generating.
    expect(prismaMock.plexWrapped.updateMany).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('marks a member who is not eligible as skipped with the typed reason', async () => {
    generate.mockResolvedValue({ status: 'skipped', reason: 'NOT_IN_AUDIENCE' } as never)

    await expect(processRewindGenerateUser(job())).resolves.toEqual({ status: 'skipped' })

    expect(generationUpdates()).toContainEqual(
      expect.objectContaining({ status: 'skipped', error: { code: 'NOT_IN_AUDIENCE' } })
    )
    expect(prismaMock.plexWrapped.updateMany).toHaveBeenCalledWith({
      where: { id: 'wrapped-1', status: { not: 'completed' } },
      data: { status: 'failed', error: '{"code":"NOT_IN_AUDIENCE"}' },
    })
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

    prismaMock.rewindGeneration.findUnique.mockResolvedValue(QUEUED as never)
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
    prismaMock.rewindGeneration.findUnique.mockResolvedValue({ ...QUEUED, status: 'failed' } as never)

    await expect(processRewindGenerateUser(job())).resolves.toEqual({ status: 'ignored' })
    expect(acquire).not.toHaveBeenCalled()
    expect(generate).not.toHaveBeenCalled()
  })

  it('runs the pipeline in persist mode with the run kind, copy policy, ids and signal', async () => {
    generate.mockResolvedValue(COMPLETED as never)
    prismaMock.rewindGeneration.findUnique.mockResolvedValue({ ...QUEUED, kind: 'admin', copyPolicy: 'no-llm' } as never)

    await processRewindGenerateUser(job())

    expect(generate).toHaveBeenCalledWith({
      userId: 'user-1',
      year: 2026,
      kind: 'admin',
      mode: 'persist',
      copyPolicy: 'no-llm',
      generationId: 'gen-1',
      signal: expect.any(AbortSignal),
    })
  })

  it('keeps the stored data window for a hide or unhide (P7.7), and only for one', async () => {
    generate.mockResolvedValue(COMPLETED as never)
    prismaMock.rewindGeneration.findUnique.mockResolvedValue({ ...QUEUED, copyPolicy: 'no-llm' } as never)

    await processRewindGenerateUser(job({ exclusion: true }))
    await processRewindGenerateUser(job())

    expect(generate.mock.calls.map(([options]) => options.keepWindow)).toEqual([true, undefined])
    expect(generate).toHaveBeenNthCalledWith(1, expect.objectContaining({ copyPolicy: 'no-llm' }))
  })
})
