/**
 * @jest-environment node
 *
 * REWIND_NOTIFY (P7.14): one DM per member in their daytime, the re-checks
 * at send time, the notifiedAt claim, the completion hook and the
 * season-open fan-out.
 */

import { DelayedError, type Job } from 'bullmq'
import { mockReset } from 'jest-mock-extended'

import { buildConfig, buildPlexWrapped } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { getAccessLevel } from '@/lib/access'
import { DiscordApiError, DISCORD_DMS_CLOSED, sendDiscordDirectMessage } from '@/lib/discord/api'
import { isDiscordBotEnabled } from '@/lib/discord/lock'
import { enqueueSeasonReadyNotifications, processRewindNotify, registerNotifyJobs } from '@/lib/queue/jobs/rewind-notify'
import type { RewindNotifyPayload } from '@/lib/queue/types'
import { afterRewindCompleted, type CompletedRewind } from '@/lib/wrapped/pipeline/after-complete'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/access', () => ({ getAccessLevel: jest.fn() }))
jest.mock('@/lib/discord/lock', () => ({ isDiscordBotEnabled: jest.fn() }))
jest.mock('@/lib/discord/api', () => ({
  ...jest.requireActual('@/lib/discord/api'),
  sendDiscordDirectMessage: jest.fn(),
}))
jest.mock('@/lib/utils/server-zone', () => ({ serverZone: jest.fn(async () => 'America/Chicago') }))
jest.mock('@/lib/brand', () => ({ rewindName: jest.fn(async (year: number) => `Chester Family Plex Rewind ${year}`) }))
jest.mock('@/lib/env', () => ({ getBaseUrl: () => 'https://plex.example.com' }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))
const mockAdd = jest.fn(async () => ({}))
const mockAddBulk = jest.fn(async () => [])
jest.mock('@/lib/queue/rewind-producers', () => ({
  getRewindQueue: jest.fn(() => ({ add: mockAdd, addBulk: mockAddBulk })),
}))

const PAYLOAD: RewindNotifyPayload = { wrappedId: 'wrapped-1', userId: 'member-1', year: 2026, kind: 'season' }
/** 13:00 in Berlin, 06:00 in Chicago. */
const BERLIN_AFTERNOON = new Date('2026-12-01T12:00:00Z')

const moveToDelayed = jest.fn(async () => undefined)
const job = (): Job<RewindNotifyPayload> => ({ data: PAYLOAD, moveToDelayed }) as never

let notifiedAt: Date | null

function member(overrides: { timezone?: string | null; discordUserId?: string | null } = {}) {
  const discordUserId = overrides.discordUserId === undefined ? 'discord-1' : overrides.discordUserId
  prismaMock.plexWrapped.findUnique.mockImplementation(
    (async () => ({
      ...buildPlexWrapped({ id: 'wrapped-1', userId: 'member-1', year: 2026, status: 'completed', notifiedAt }),
      user: {
        timezone: overrides.timezone === undefined ? 'Europe/Berlin' : overrides.timezone,
        isAdmin: false,
        discordConnection: discordUserId ? { discordUserId } : null,
      },
    })) as never
  )
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.useFakeTimers({ now: BERLIN_AFTERNOON, doNotFake: ['setTimeout', 'clearTimeout', 'setImmediate', 'nextTick', 'queueMicrotask'] })
  notifiedAt = null
  member()
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindEnabled: true, rewindAudience: 'all', rewindNotifyChannels: ['discord', 'banner'] }))
  prismaMock.rewindPrefs.findUnique.mockResolvedValue(null)
  prismaMock.plexWrapped.updateMany.mockImplementation((async (args: { data: { notifiedAt: Date | null }; where: { notifiedAt?: unknown } }) => {
    // The claim only updates a row nobody has claimed yet
    if (args.where.notifiedAt === null && notifiedAt !== null) return { count: 0 }
    notifiedAt = args.data.notifiedAt
    return { count: 1 }
  }) as never)
  jest.mocked(getAccessLevel).mockResolvedValue('full')
  jest.mocked(isDiscordBotEnabled).mockResolvedValue(true)
  jest.mocked(sendDiscordDirectMessage).mockResolvedValue(undefined)
})

afterEach(() => {
  jest.useRealTimers()
})

describe('processRewindNotify', () => {
  it('sends one DM with the ready line and a link to /rewind', async () => {
    expect(await processRewindNotify(job())).toEqual({ sent: true })

    expect(sendDiscordDirectMessage).toHaveBeenCalledTimes(1)
    expect(sendDiscordDirectMessage).toHaveBeenCalledWith(
      'discord-1',
      'Your Chester Family Plex Rewind 2026 is ready.\nhttps://plex.example.com/rewind',
      expect.any(AbortSignal)
    )
    expect(notifiedAt).toEqual(BERLIN_AFTERNOON)
  })

  it('sends one DM when two jobs run', async () => {
    const results = [await processRewindNotify(job()), await processRewindNotify(job())]

    expect(results).toEqual([{ sent: true }, { sent: false, skipped: 'ALREADY_SENT' }])
    expect(sendDiscordDirectMessage).toHaveBeenCalledTimes(1)
  })

  it('loses the claim to a job that ran in between', async () => {
    prismaMock.plexWrapped.updateMany.mockResolvedValue({ count: 0 })

    expect(await processRewindNotify(job())).toEqual({ sent: false, skipped: 'ALREADY_SENT' })
    expect(sendDiscordDirectMessage).not.toHaveBeenCalled()
  })

  it('delays itself to 09:00 in the member zone outside the window', async () => {
    // 21:30 in Berlin
    jest.setSystemTime(new Date('2026-12-01T20:30:00Z'))

    await expect(processRewindNotify(job(), 'lock-token')).rejects.toBeInstanceOf(DelayedError)

    expect(moveToDelayed).toHaveBeenCalledWith(Date.parse('2026-12-02T08:00:00Z'), 'lock-token')
    expect(sendDiscordDirectMessage).not.toHaveBeenCalled()
  })

  it('uses the server zone when the member chose none', async () => {
    member({ timezone: null })

    // 06:00 in Chicago: too early there
    await expect(processRewindNotify(job())).rejects.toBeInstanceOf(DelayedError)
    expect(moveToDelayed).toHaveBeenCalledWith(Date.parse('2026-12-01T15:00:00Z'), undefined)
  })

  describe('skips the DM', () => {
    it.each([
      ['notify is off', 'NOTIFY_OFF', () => prismaMock.rewindPrefs.findUnique.mockResolvedValue({ notify: false } as never)],
      ['the subscriber lapsed', 'NOT_ENTITLED', () => jest.mocked(getAccessLevel).mockResolvedValue('lapsed')],
      ['the member is not linked', 'NOT_LINKED', () => member({ discordUserId: null })],
      ['the bot is disabled', 'BOT_DISABLED', () => jest.mocked(isDiscordBotEnabled).mockResolvedValue(false)],
      [
        'the channels leave out discord',
        'CHANNEL_OFF',
        () => prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindEnabled: true, rewindAudience: 'all', rewindNotifyChannels: ['banner'] })),
      ],
      [
        'the audience is admins again',
        'NOT_IN_AUDIENCE',
        () => prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindEnabled: true, rewindAudience: 'admins' })),
      ],
    ])('when %s', async (_case, reason, arrange) => {
      arrange()

      expect(await processRewindNotify(job())).toEqual({ sent: false, skipped: reason })
      expect(sendDiscordDirectMessage).not.toHaveBeenCalled()
      expect(notifiedAt).toBeNull()
    })
  })

  it('does not retry when the member closed their DMs (50007)', async () => {
    jest.mocked(sendDiscordDirectMessage).mockRejectedValue(new DiscordApiError(403, DISCORD_DMS_CLOSED))

    expect(await processRewindNotify(job())).toEqual({ sent: false, skipped: 'DMS_CLOSED' })
    // The claim stands, so no later job tries again
    expect(notifiedAt).toEqual(BERLIN_AFTERNOON)
  })

  it('releases the claim and throws for a retry on any other failure', async () => {
    jest.mocked(sendDiscordDirectMessage).mockRejectedValue(new DiscordApiError(500, null))

    await expect(processRewindNotify(job())).rejects.toBeInstanceOf(DiscordApiError)
    expect(notifiedAt).toBeNull()
  })
})

describe('the completion hook', () => {
  const completed: CompletedRewind = {
    userId: 'member-1',
    year: 2026,
    wrappedId: 'wrapped-1',
    generationId: 'gen-1',
    factsHash: 'f'.repeat(64),
    edition: 'full',
    first: true,
  }

  beforeAll(() => registerNotifyJobs())

  function generation(kind: string) {
    prismaMock.rewindGeneration.findUnique.mockResolvedValue({ kind } as never)
  }

  it('enqueues a season notification for a member in the live audience', async () => {
    generation('season')
    prismaMock.user.findUnique.mockResolvedValue({ isAdmin: false } as never)

    await afterRewindCompleted(completed)

    expect(mockAdd).toHaveBeenCalledWith('rewind:notify', { wrappedId: 'wrapped-1', userId: 'member-1', year: 2026, kind: 'season' }, expect.objectContaining({
      attempts: 3,
      deduplication: { id: 'rewind:notify:2026:member-1:season' },
    }))
  })

  it('enqueues nothing for a completion outside the live audience', async () => {
    generation('season')
    prismaMock.user.findUnique.mockResolvedValue({ isAdmin: false } as never)
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindEnabled: true, rewindAudience: 'admins' }))

    await afterRewindCompleted(completed)

    expect(mockAdd).not.toHaveBeenCalled()
  })

  it('never notifies for an admin regeneration', async () => {
    generation('admin')
    prismaMock.user.findUnique.mockResolvedValue({ isAdmin: true } as never)

    await afterRewindCompleted(completed)

    expect(mockAdd).not.toHaveBeenCalled()
  })
})

describe('the season-open fan-out', () => {
  it('gives a Berlin member of a Chicago server one DM after the switch', async () => {
    prismaMock.plexWrapped.findMany.mockResolvedValue([{ id: 'wrapped-1', userId: 'member-1' }] as never)

    expect(await enqueueSeasonReadyNotifications(2026)).toBe(1)
    expect(prismaMock.plexWrapped.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { year: 2026, status: 'completed', notifiedAt: null } }))
    expect(mockAddBulk).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'rewind:notify', data: PAYLOAD, opts: expect.objectContaining({ deduplication: { id: 'rewind:notify:2026:member-1:season' } }) }),
    ])

    // 02:00 in Chicago is 09:00 in Berlin: the member's window is open
    jest.setSystemTime(new Date('2026-12-01T08:00:00Z'))
    expect(await processRewindNotify(job())).toEqual({ sent: true })
    expect(await processRewindNotify(job())).toEqual({ sent: false, skipped: 'ALREADY_SENT' })
    expect(sendDiscordDirectMessage).toHaveBeenCalledTimes(1)
  })

  it('enqueues nothing when everyone was told', async () => {
    prismaMock.plexWrapped.findMany.mockResolvedValue([])

    expect(await enqueueSeasonReadyNotifications(2026)).toBe(0)
    expect(mockAddBulk).not.toHaveBeenCalled()
  })
})

describe('the final-cut notification (P8.5)', () => {
  const FINAL: RewindNotifyPayload = { ...PAYLOAD, kind: 'final-cut' }
  const finalJob = (): Job<RewindNotifyPayload> => ({ data: FINAL, moveToDelayed }) as never
  const SEASON_SENT = new Date('2026-12-01T12:00:00Z')
  const FINAL_CUT_AT = new Date('2027-01-01T08:40:00Z')
  let finalCutAt: Date | null

  beforeEach(() => {
    notifiedAt = SEASON_SENT
    finalCutAt = FINAL_CUT_AT
    prismaMock.plexWrapped.findUnique.mockImplementation(
      (async () => ({
        ...buildPlexWrapped({ id: 'wrapped-1', userId: 'member-1', year: 2026, status: 'completed', notifiedAt, finalCutAt }),
        user: { timezone: 'Europe/Berlin', isAdmin: false, discordConnection: { discordUserId: 'discord-1' } },
      })) as never
    )
    // The claim: unclaimed, or claimed before the final cut (the field reference).
    prismaMock.plexWrapped.updateMany.mockImplementation((async (args: { data: { notifiedAt: Date | null }; where: { OR?: unknown } }) => {
      if (args.where.OR && notifiedAt !== null && finalCutAt !== null && notifiedAt >= finalCutAt) return { count: 0 }
      notifiedAt = args.data.notifiedAt
      return { count: 1 }
    }) as never)
  })

  it('tells a December reader once, from 09:00 on 2 January in their zone, that December is in', async () => {
    jest.setSystemTime(new Date('2027-01-02T08:30:00Z')) // 09:30 in Berlin

    expect(await processRewindNotify(finalJob())).toEqual({ sent: true })
    expect(await processRewindNotify(finalJob())).toEqual({ sent: false, skipped: 'ALREADY_SENT' })
    expect(sendDiscordDirectMessage).toHaveBeenCalledTimes(1)
    expect(sendDiscordDirectMessage).toHaveBeenCalledWith(
      'discord-1',
      'Your Chester Family Plex Rewind 2026 now includes December.\nhttps://plex.example.com/rewind',
      expect.any(AbortSignal)
    )
    expect(prismaMock.plexWrapped.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'wrapped-1', OR: [{ notifiedAt: null }, { notifiedAt: { lt: prismaMock.plexWrapped.fields.finalCutAt } }] }) })
    )
  })

  it('never sends before 09:00 on 2 January, even in daytime on 1 January', async () => {
    jest.setSystemTime(new Date('2027-01-01T12:00:00Z')) // 13:00 on 1 January in Berlin

    await expect(processRewindNotify(finalJob(), 'lock-token')).rejects.toBeInstanceOf(DelayedError)
    expect(moveToDelayed).toHaveBeenCalledWith(Date.parse('2027-01-02T08:00:00Z'), 'lock-token')
    expect(sendDiscordDirectMessage).not.toHaveBeenCalled()
  })

  it('restores the season claim when the send fails, for a retry', async () => {
    jest.setSystemTime(new Date('2027-01-02T10:00:00Z'))
    jest.mocked(sendDiscordDirectMessage).mockRejectedValue(new DiscordApiError(500, null))

    await expect(processRewindNotify(finalJob())).rejects.toBeInstanceOf(DiscordApiError)
    expect(notifiedAt).toEqual(SEASON_SENT)
  })

  it('skips a Rewind that has no final cut', async () => {
    finalCutAt = null
    jest.setSystemTime(new Date('2027-01-02T10:00:00Z'))

    expect(await processRewindNotify(finalJob())).toEqual({ sent: false, skipped: 'NOT_READY' })
  })

  describe('the completion hook', () => {
    const completed: CompletedRewind = {
      userId: 'member-1',
      year: 2026,
      wrappedId: 'wrapped-1',
      generationId: 'gen-final',
      factsHash: 'f'.repeat(64),
      edition: 'full',
      first: false,
    }

    beforeAll(() => registerNotifyJobs())

    beforeEach(() => {
      prismaMock.rewindGeneration.findUnique.mockResolvedValue({ kind: 'final-cut' } as never)
      prismaMock.user.findUnique.mockResolvedValue({ isAdmin: false } as never)
    })

    it('enqueues the final-cut kind for a member who read the season issue', async () => {
      prismaMock.rewindView.count.mockResolvedValue(2)

      await afterRewindCompleted(completed)

      expect(prismaMock.rewindView.count).toHaveBeenCalledWith({ where: { wrappedId: 'wrapped-1', createdAt: { lt: FINAL_CUT_AT } } })
      expect(mockAdd).toHaveBeenCalledWith('rewind:notify', FINAL, expect.objectContaining({ deduplication: { id: 'rewind:notify:2026:member-1:final-cut' } }))
    })

    it('enqueues nothing for a member who never opened it before the final cut', async () => {
      prismaMock.rewindView.count.mockResolvedValue(0)

      await afterRewindCompleted(completed)

      expect(mockAdd).not.toHaveBeenCalled()
    })
  })
})
