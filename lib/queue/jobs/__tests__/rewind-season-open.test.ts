/**
 * @jest-environment node
 */

/**
 * `REWIND_SEASON_OPEN` (P8.2): the 08:00 audience switch opens Rewind to
 * everyone only with the owner's opt-in and a clean season-open generation,
 * re-checks every 10 minutes while it runs, and gives up at 12:00.
 */

import { DelayedError, type Job } from 'bullmq'
import { mockReset } from 'jest-mock-extended'

import { buildConfig } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { processRewindSeasonOpen } from '@/lib/queue/jobs/rewind-season-open'
import type { RewindSeasonOpenPayload } from '@/lib/queue/types'
import { openRewindToEveryone, seasonOpenReadiness } from '@/lib/rewind/season-open'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/rewind/season-open', () => ({
  ...jest.requireActual('@/lib/rewind/season-open'),
  openRewindToEveryone: jest.fn(async () => ({ switched: true, notified: 5 })),
  seasonOpenReadiness: jest.fn(async () => ({ state: 'ready', ready: 40 })),
}))
jest.mock('@/lib/utils/server-zone', () => ({ serverZone: jest.fn(async () => 'America/Chicago') }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const AT_EIGHT = Date.parse('2026-12-01T14:00:00Z') // 08:00 in Chicago

function job(data: Partial<RewindSeasonOpenPayload> = {}) {
  return {
    data: { year: 2026, triggeredBy: 'scheduled', ...data },
    timestamp: AT_EIGHT,
    moveToDelayed: jest.fn(async () => undefined),
  } as unknown as Job<RewindSeasonOpenPayload> & { moveToDelayed: jest.Mock }
}

function config(overrides: { rewindEnabled?: boolean; rewindAudience?: string; rewindDisabledPages?: string[] } = {}) {
  prismaMock.config.findUnique.mockResolvedValue(
    buildConfig({ rewindEnabled: true, rewindAudience: 'admins', rewindDisabledPages: ['+season.auto-open'], rewindSeasonOpens: '12-01', ...overrides })
  )
}

function at(ms: number) {
  jest.useFakeTimers({ now: ms, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'queueMicrotask'] })
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  at(AT_EIGHT)
})

afterEach(() => jest.useRealTimers())

describe('processRewindSeasonOpen', () => {
  it('opens Rewind to everyone after a clean season-open generation', async () => {
    config()
    expect(await processRewindSeasonOpen(job(), 'token')).toEqual({ outcome: 'SWITCHED', notified: 5 })
    expect(openRewindToEveryone).toHaveBeenCalledWith(2026, 'system')
  })

  it.each([
    ['ALREADY_OPEN', { rewindAudience: 'all' }],
    ['REWIND_OFF', { rewindEnabled: false }],
    ['NOT_ENABLED', { rewindDisabledPages: [] }],
    ['NOT_ENABLED', { rewindDisabledPages: ['+season.auto-open', 'season.auto-open'] }],
  ])('leaves the audience alone: %s', async (outcome, overrides) => {
    config(overrides)
    expect(await processRewindSeasonOpen(job(), 'token')).toEqual({ outcome })
    expect(openRewindToEveryone).not.toHaveBeenCalled()
  })

  it('leaves it to the owner when the season-open Prepare did not complete', async () => {
    config()
    jest.mocked(seasonOpenReadiness).mockResolvedValue({ state: 'not-prepared', prepare: 'failed' })

    expect(await processRewindSeasonOpen(job(), 'token')).toEqual({ outcome: 'NOT_PREPARED' })
    expect(openRewindToEveryone).not.toHaveBeenCalled()
  })

  it('checks again in 10 minutes while the generation runs', async () => {
    config()
    jest.mocked(seasonOpenReadiness).mockResolvedValue({ state: 'running', prepare: false, generating: 7 })
    const j = job()

    await expect(processRewindSeasonOpen(j, 'token')).rejects.toBeInstanceOf(DelayedError)
    expect(j.moveToDelayed).toHaveBeenCalledWith(AT_EIGHT + 10 * 60_000, 'token')
    expect(openRewindToEveryone).not.toHaveBeenCalled()
  })

  it('gives up at 12:00 when the generation still runs', async () => {
    config()
    at(Date.parse('2026-12-01T17:55:00Z')) // 11:55 in Chicago
    jest.mocked(seasonOpenReadiness).mockResolvedValue({ state: 'running', prepare: true, generating: 0 })

    expect(await processRewindSeasonOpen(job(), 'token')).toEqual({ outcome: 'STILL_GENERATING' })
    expect(openRewindToEveryone).not.toHaveBeenCalled()
  })

  it('leaves a run with failed members to the owner', async () => {
    config()
    jest.mocked(seasonOpenReadiness).mockResolvedValue({ state: 'failures', failed: 2 })

    expect(await processRewindSeasonOpen(job(), 'token')).toEqual({ outcome: 'FAILURES', failed: 2 })
    expect(openRewindToEveryone).not.toHaveBeenCalled()
  })
})
