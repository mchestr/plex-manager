/**
 * @jest-environment node
 */

/**
 * The generation actions (P2.17): requests only check and enqueue, with
 * deduplication, the FR-50 Redis check, P0.12's guardrails and P0.17's
 * eligibility; the status read never selects `data` (BP-22).
 */

import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'

import { getWrappedSettings } from '@/lib/wrapped/generation-settings'
import { adminRegenerateRewind, getRewindStatus, requestRewindGeneration } from '@/actions/rewind-generation'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { hasEntitlement } from '@/lib/actions/entitlement'
import { getRewindQueue } from '@/lib/queue/rewind-producers'
import { checkRewindInfra } from '@/lib/queue/rewind-infra'
import { consume, reward } from '@/lib/security/rate-limit'
import { logAuditEvent } from '@/lib/security/audit-log'
import { checkRewindEligibility } from '@/lib/wrapped/eligibility'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('next/cache', () => ({ refresh: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/wrapped/generation-settings', () => ({ getWrappedSettings: jest.fn() }))
jest.mock('@/lib/actions/entitlement', () => ({
  ...jest.requireActual('@/lib/actions/entitlement'),
  hasEntitlement: jest.fn(),
}))
jest.mock('@/lib/queue/rewind-producers', () => ({ getRewindQueue: jest.fn() }))
jest.mock('@/lib/queue/rewind-infra', () => ({ checkRewindInfra: jest.fn() }))
jest.mock('@/lib/security/rate-limit', () => ({ consume: jest.fn(), reward: jest.fn() }))
jest.mock('@/lib/wrapped/eligibility', () => ({ checkRewindEligibility: jest.fn() }))
jest.mock('@/lib/security/audit-log', () => ({
  ...jest.requireActual('@/lib/security/audit-log'),
  logAuditEvent: jest.fn(),
}))

const add = jest.fn()
const session = jest.mocked(getServerSession)
const settings = jest.mocked(getWrappedSettings)
const infra = jest.mocked(checkRewindInfra)

function signIn(id: string, isAdmin = false) {
  session.mockResolvedValue({ user: { id, isAdmin } } as never)
}

/** The writes a request makes; none may happen before every check passes. */
function writes() {
  return [
    prismaMock.plexWrapped.createMany,
    prismaMock.plexWrapped.updateMany,
    prismaMock.rewindGeneration.create,
    prismaMock.rewindGeneration.update,
    add,
  ].reduce((sum, fn) => sum + fn.mock.calls.length, 0)
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  signIn('user-1')
  settings.mockResolvedValue({ featureEnabled: true, seasonOpen: true, wrappedEnabled: true, wrappedYear: 2026 })
  jest.mocked(hasEntitlement).mockResolvedValue(true)
  jest.mocked(checkRewindEligibility).mockResolvedValue({ eligible: true, tautulliUser: null })
  jest.mocked(consume).mockResolvedValue({ ok: true } as never)
  infra.mockResolvedValue({ ok: true })
  jest.mocked(getRewindQueue).mockReturnValue({ add } as never)
  // The job keeps the id it was given unless BullMQ deduplicates it.
  add.mockImplementation(async (_name: string, _data: unknown, opts: { jobId: string }) => ({ id: opts.jobId }))

  prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', plexUserId: 'plex-1' } as never)
  prismaMock.plexServer.findFirst.mockResolvedValue({ id: 'plex' } as never)
  prismaMock.tautulli.findFirst.mockResolvedValue({ id: 'tautulli' } as never)
  prismaMock.plexWrapped.findUnique.mockResolvedValue(null)
  prismaMock.plexWrapped.findUniqueOrThrow.mockResolvedValue({ id: 'wrapped-1' } as never)
  prismaMock.rewindGeneration.count.mockResolvedValue(0)
})

describe('requestRewindGeneration', () => {
  it('creates a queued generation and enqueues it with the per-member deduplication id', async () => {
    await expect(requestRewindGeneration({ year: 2026 })).resolves.toEqual({ success: true, data: { alreadyQueued: false } })

    const created = prismaMock.rewindGeneration.create.mock.calls[0][0].data
    expect(created).toMatchObject({ wrappedId: 'wrapped-1', userId: 'user-1', year: 2026, kind: 'member', status: 'queued' })
    expect(created.jobId).toBe(created.id)
    expect(add).toHaveBeenCalledWith(
      'rewind:generate:user',
      { generationId: created.id, userId: 'user-1', year: 2026 },
      expect.objectContaining({
        jobId: created.id,
        deduplication: { id: 'rewind:gen:2026:user-1' },
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
      })
    )
    // A Rewind that has not completed shows the run; a completed one is never touched.
    expect(prismaMock.plexWrapped.updateMany).toHaveBeenCalledWith({
      where: { id: 'wrapped-1', status: { not: 'completed' } },
      data: { status: 'generating', error: null },
    })
  })

  it('returns REDIS_NOT_CONFIGURED without REDIS_URL, and writes nothing', async () => {
    infra.mockImplementation(jest.requireActual('@/lib/queue/rewind-infra').checkRewindInfra)
    const url = process.env.REDIS_URL
    delete process.env.REDIS_URL
    try {
      await expect(requestRewindGeneration({ year: 2026 })).resolves.toEqual({
        success: false,
        code: 'REDIS_NOT_CONFIGURED',
        error: "Rewind is not available on this server",
      })
    } finally {
      if (url !== undefined) process.env.REDIS_URL = url
    }
    expect(writes()).toBe(0)
    expect(consume).not.toHaveBeenCalled()
  })

  it('tells an admin what to configure, and a member when Redis is down', async () => {
    infra.mockResolvedValue({ ok: false, code: 'REDIS_NOT_CONFIGURED' })
    signIn('user-1', true)
    expect(await requestRewindGeneration({ year: 2026 })).toMatchObject({ error: 'Rewind needs Redis (REDIS_URL)' })

    infra.mockResolvedValue({ ok: false, code: 'REDIS_UNAVAILABLE' })
    signIn('user-1')
    expect(await requestRewindGeneration({ year: 2026 })).toMatchObject({
      code: 'REDIS_UNAVAILABLE',
      error: 'Rewind is temporarily unavailable. Try again in a few minutes.',
    })
    expect(writes()).toBe(0)
  })

  it('answers alreadyQueued for a duplicate BullMQ deduplicated, skipping its row and refunding the points', async () => {
    add.mockResolvedValue({ id: 'gen-running' })

    await expect(requestRewindGeneration({ year: 2026 })).resolves.toEqual({ success: true, data: { alreadyQueued: true } })

    expect(prismaMock.rewindGeneration.update).toHaveBeenCalledWith({
      where: { id: expect.any(String) },
      data: expect.objectContaining({ status: 'skipped', jobId: 'gen-running', error: { code: 'ALREADY_QUEUED' } }),
    })
    expect(reward).toHaveBeenCalledWith('rw:gen:burst', 'user-1')
    expect(reward).toHaveBeenCalledWith('rw:gen:daily', 'user-1')
  })

  it('answers alreadyQueued before spending a point while a run is queued or running', async () => {
    prismaMock.rewindGeneration.count.mockResolvedValue(1)

    await expect(requestRewindGeneration({ year: 2026 })).resolves.toEqual({ success: true, data: { alreadyQueued: true } })
    expect(consume).not.toHaveBeenCalled()
    expect(writes()).toBe(0)
  })

  it('gates members by the season window, not admins', async () => {
    settings.mockResolvedValue({ featureEnabled: true, seasonOpen: false, wrappedEnabled: false, wrappedYear: 2026 })

    expect(await requestRewindGeneration({ year: 2026 })).toEqual({
      success: false,
      code: 'CONFLICT',
      error: 'Rewind generation is currently off',
    })
    expect(writes()).toBe(0)

    signIn('user-1', true)
    expect(await requestRewindGeneration({ year: 2026 })).toEqual({ success: true, data: { alreadyQueued: false } })
    expect(await adminRegenerateRewind({ userId: 'user-1', year: 2026 })).toEqual({ success: true, data: { alreadyQueued: false } })
  })

  it('refuses everyone while the feature is off', async () => {
    settings.mockResolvedValue({ featureEnabled: false, seasonOpen: true, wrappedEnabled: false, wrappedYear: 2026 })
    signIn('admin-1', true)

    expect(await requestRewindGeneration({ year: 2026 })).toMatchObject({ success: false })
    expect(await adminRegenerateRewind({ userId: 'user-1', year: 2026 })).toMatchObject({ success: false })
    expect(writes()).toBe(0)
  })

  it('accepts only the season year', async () => {
    const result = await requestRewindGeneration({ year: 2025 })

    expect(result).toEqual({ success: false, code: 'VALIDATION', error: 'Rewind is only available for 2026' })
    expect(writes()).toBe(0)
  })

  it('refuses a year that is not a number', async () => {
    const result = await requestRewindGeneration(JSON.parse('{"year":"2026"}'))

    expect(result).toMatchObject({ success: false, code: 'VALIDATION' })
    expect(writes()).toBe(0)
  })

  it('refuses without a session', async () => {
    session.mockResolvedValue(null)

    expect(await requestRewindGeneration({ year: 2026 })).toMatchObject({ success: false, code: 'UNAUTHENTICATED' })
  })

  it('refuses a member who is not entitled, through the helper\'s full entitlement', async () => {
    jest.mocked(hasEntitlement).mockResolvedValue(false)

    expect(await requestRewindGeneration({ year: 2026 })).toMatchObject({ success: false, code: 'NOT_ENTITLED' })
    expect(hasEntitlement).toHaveBeenCalledWith('user-1', 'full')
    expect(writes()).toBe(0)
  })

  it('lets only admins regenerate a completed Rewind', async () => {
    prismaMock.plexWrapped.findUnique.mockResolvedValue({ status: 'completed' } as never)

    expect(await requestRewindGeneration({ year: 2026 })).toEqual({
      success: false,
      code: 'FORBIDDEN',
      error: 'Only admins can regenerate a finished Rewind',
    })
    expect(writes()).toBe(0)
  })

  it.each([
    ['no Plex identity', { id: 'user-1', plexUserId: null }, { eligible: true, tautulliUser: null }],
    ['no Tautulli match', { id: 'user-1', plexUserId: 'plex-1' }, { eligible: false, reason: 'NO_TAUTULLI_MATCH' }],
  ] as const)('refuses a member with %s before any point or row', async (_case, user, eligibility) => {
    prismaMock.user.findUnique.mockResolvedValue(user as never)
    jest.mocked(checkRewindEligibility).mockResolvedValue(eligibility)

    expect(await requestRewindGeneration({ year: 2026 })).toMatchObject({ success: false, code: 'REWIND_NOT_ELIGIBLE' })
    expect(consume).not.toHaveBeenCalled()
    expect(writes()).toBe(0)
  })

  it('reports missing configuration before spending a point', async () => {
    prismaMock.tautulli.findFirst.mockResolvedValue(null)

    expect(await requestRewindGeneration({ year: 2026 })).toEqual({
      success: false,
      code: 'NOT_FOUND',
      error: 'No active Tautulli server configured',
    })
    expect(consume).not.toHaveBeenCalled()
  })

  it('applies the member limits, not to admins', async () => {
    jest.mocked(consume).mockResolvedValue({ ok: false, retryAfterSec: 540 } as never)

    expect(await requestRewindGeneration({ year: 2026 })).toEqual({
      success: false,
      code: 'RATE_LIMITED',
      retryAfterSec: 540,
      error: 'You can try again in 9 minutes.',
    })
    expect(writes()).toBe(0)

    signIn('user-1', true)
    expect(await requestRewindGeneration({ year: 2026 })).toEqual({ success: true, data: { alreadyQueued: false } })
  })

  it('reports Redis as down and refunds the points when the add fails', async () => {
    add.mockRejectedValue(new Error('Stream isn\'t writeable'))

    expect(await requestRewindGeneration({ year: 2026 })).toMatchObject({ code: 'REDIS_UNAVAILABLE' })
    expect(prismaMock.rewindGeneration.update).toHaveBeenCalledWith({
      where: { id: expect.any(String) },
      data: expect.objectContaining({ status: 'failed', error: { code: 'JOB_LOST' } }),
    })
    expect(reward).toHaveBeenCalledWith('rw:gen:burst', 'user-1')
  })
})

describe('adminRegenerateRewind', () => {
  beforeEach(() => signIn('admin-1', true))

  it('requires an admin', async () => {
    signIn('user-1')

    expect(await adminRegenerateRewind({ userId: 'user-2', year: 2026 })).toMatchObject({ success: false, code: 'FORBIDDEN' })
    expect(writes()).toBe(0)
  })

  it('enqueues an admin run for the member, spends no points and writes an audit entry', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-2', plexUserId: 'plex-2' } as never)
    prismaMock.plexWrapped.findUnique.mockResolvedValue({ status: 'completed' } as never)

    expect(await adminRegenerateRewind({ userId: 'user-2', year: 2026 })).toEqual({ success: true, data: { alreadyQueued: false } })

    expect(prismaMock.rewindGeneration.create.mock.calls[0][0].data).toMatchObject({ userId: 'user-2', kind: 'admin' })
    expect(consume).not.toHaveBeenCalled()
    expect(logAuditEvent).toHaveBeenCalledWith('REWIND_REGENERATE_REQUESTED', 'admin-1', {
      targetUserId: 'user-2',
      year: 2026,
      alreadyQueued: false,
    })
  })

  it('holds admins to the season year', async () => {
    expect(await adminRegenerateRewind({ userId: 'user-2', year: 2025 })).toMatchObject({ success: false })
    expect(writes()).toBe(0)
  })
})

/** The status a permitted caller reads. */
function unwrapStatus(result: Awaited<ReturnType<typeof getRewindStatus>>) {
  if (!result.success) throw new Error(result.error)
  return result.data
}

describe('getRewindStatus', () => {
  it('selects status columns only, never data', async () => {
    prismaMock.plexWrapped.findUnique.mockResolvedValue({ status: 'completed', error: null } as never)
    prismaMock.rewindGeneration.findFirst.mockResolvedValue(null)

    await expect(getRewindStatus({ year: 2026 }).then(unwrapStatus)).resolves.toEqual({
      state: 'completed',
      errorCode: null,
      startedAt: null,
      hasCompleted: true,
    })

    const wrappedSelect = prismaMock.plexWrapped.findUnique.mock.calls[0][0].select
    const generationSelect = prismaMock.rewindGeneration.findFirst.mock.calls[0][0]?.select
    expect(wrappedSelect).toEqual({ status: true, error: true })
    expect(generationSelect).toEqual({ status: true, error: true, startedAt: true })
    expect(infra).not.toHaveBeenCalled()
  })

  it('reports a running regeneration while the completed Rewind stays viewable', async () => {
    prismaMock.plexWrapped.findUnique.mockResolvedValue({ status: 'completed', error: null } as never)
    prismaMock.rewindGeneration.findFirst.mockResolvedValue({
      status: 'running',
      error: null,
      startedAt: new Date('2026-12-05T12:00:00Z'),
    } as never)

    await expect(getRewindStatus({ year: 2026 }).then(unwrapStatus)).resolves.toEqual({
      state: 'running',
      errorCode: null,
      startedAt: '2026-12-05T12:00:00.000Z',
      hasCompleted: true,
    })
  })

  it('reports the FR-50 state when nothing is completed and Redis is missing', async () => {
    infra.mockResolvedValue({ ok: false, code: 'REDIS_NOT_CONFIGURED' })
    prismaMock.rewindGeneration.findFirst.mockResolvedValue(null)

    await expect(getRewindStatus({ year: 2026 }).then(unwrapStatus)).resolves.toMatchObject({
      state: 'unavailable',
      errorCode: 'REDIS_NOT_CONFIGURED',
    })
  })

  it("lets an admin read a member's status, and nobody else", async () => {
    prismaMock.rewindGeneration.findFirst.mockResolvedValue(null)

    expect(await getRewindStatus({ year: 2026, userId: 'user-2' })).toMatchObject({ success: false, code: 'FORBIDDEN' })
    expect(prismaMock.plexWrapped.findUnique).not.toHaveBeenCalled()

    signIn('admin-1', true)
    await expect(getRewindStatus({ year: 2026, userId: 'user-2' }).then(unwrapStatus)).resolves.toMatchObject({ state: 'none' })
    expect(prismaMock.plexWrapped.findUnique.mock.calls[0][0].where).toEqual({
      userId_year: { userId: 'user-2', year: 2026 },
    })
  })
})
