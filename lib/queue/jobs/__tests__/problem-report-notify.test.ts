/**
 * @jest-environment node
 *
 * PROBLEM_REPORT_NOTIFY: one DM per linked admin about a member's new
 * reports, at most one an hour per member (a later report waits for the hour,
 * then goes out with the rest), the alertedAt claim, no retry on closed DMs,
 * and a released claim when no admin could be told.
 */

import { DelayedError, type Job } from 'bullmq'
import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { DiscordApiError, DISCORD_DMS_CLOSED, sendDiscordDirectMessage } from '@/lib/discord/api'
import { isDiscordBotEnabled } from '@/lib/discord/config'
import { getProblemReportNotifyProcessor, processProblemReportNotify } from '@/lib/queue/jobs/problem-report-notify'
import { JOB_TYPES } from '@/lib/queue/types'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/db/serializable', () => ({
  inSerializable: (fn: (tx: unknown) => Promise<unknown>) => fn(require('@/__tests__/helpers/prisma-mock').prismaMock),
}))
jest.mock('@/lib/discord/config', () => ({ isDiscordBotEnabled: jest.fn() }))
jest.mock('@/lib/discord/api', () => ({ ...jest.requireActual('@/lib/discord/api'), sendDiscordDirectMessage: jest.fn() }))
jest.mock('@/lib/env', () => ({ getBaseUrl: () => 'https://plex.example.com' }))
const mockInfo = jest.fn()
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: (...args: unknown[]) => mockInfo(...args), warn: jest.fn(), error: jest.fn() }),
}))

const NOW = new Date('2026-11-09T20:00:00Z')
const moveToDelayed = jest.fn(async () => undefined)
const job = (): Job<{ reportId: string }> => ({ data: { reportId: 'r1' }, moveToDelayed }) as never
const ADMINS = [
  { id: 'admin-1', discordConnection: { discordUserId: 'discord-1' } },
  { id: 'admin-2', discordConnection: { discordUserId: 'discord-2' } },
]
const PENDING = [{ id: 'r1', problem: 'wont_start', title: 'Heat', year: 1995, showTitle: null, seasonNumber: null, episodeNumber: null }]

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.useFakeTimers({ now: NOW, doNotFake: ['setTimeout', 'clearTimeout', 'setImmediate', 'nextTick', 'queueMicrotask'] })
  prismaMock.problemReport.findUnique.mockResolvedValue({ status: 'WITH_ADMIN', alertedAt: null, reporterId: 'member-1' } as never)
  jest.mocked(isDiscordBotEnabled).mockResolvedValue(true)
  prismaMock.user.findMany.mockResolvedValue(ADMINS as never)
  prismaMock.user.findUnique.mockResolvedValue({ name: 'Jane' } as never)
  prismaMock.problemReport.findFirst.mockResolvedValue(null)
  prismaMock.problemReport.findMany.mockResolvedValue(PENDING as never)
  prismaMock.problemReport.updateMany.mockResolvedValue({ count: 1 })
  jest.mocked(sendDiscordDirectMessage).mockResolvedValue(undefined)
})

afterEach(() => jest.useRealTimers())

describe('processProblemReportNotify', () => {
  it("claims the member's waiting reports and tells every linked admin", async () => {
    await expect(processProblemReportNotify(job())).resolves.toEqual({ sent: 2 })

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: { isAdmin: true, disabledAt: null, discordConnection: { is: { revokedAt: null } } },
      select: { id: true, discordConnection: { select: { discordUserId: true } } },
    })
    expect(prismaMock.problemReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { reporterId: 'member-1', status: 'WITH_ADMIN', alertedAt: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    )
    expect(prismaMock.problemReport.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['r1'] }, alertedAt: null }, data: { alertedAt: NOW } })
    const content = "Jane reported a problem with Heat \\(1995\\): Won't start.\n<https://plex.example.com/admin/problem-reports/r1>"
    expect(sendDiscordDirectMessage).toHaveBeenCalledWith('discord-1', content, expect.any(AbortSignal))
    expect(sendDiscordDirectMessage).toHaveBeenCalledWith('discord-2', content, expect.any(AbortSignal))
  })

  it('waits until an hour after the member last alerted the admins, then sends the rest together', async () => {
    prismaMock.problemReport.findFirst.mockResolvedValue({ alertedAt: new Date('2026-11-09T19:30:00Z') } as never)

    await expect(processProblemReportNotify(job(), 'token')).rejects.toBeInstanceOf(DelayedError)

    expect(moveToDelayed).toHaveBeenCalledWith(new Date('2026-11-09T20:30:00Z').getTime(), 'token')
    expect(prismaMock.problemReport.updateMany).not.toHaveBeenCalled()
    expect(sendDiscordDirectMessage).not.toHaveBeenCalled()
  })

  it.each([
    ['closed or fixed', { status: 'CLOSED', alertedAt: null, reporterId: 'member-1' }, { skipped: 'NOT_WITH_ADMIN' }],
    ['alerted already', { status: 'WITH_ADMIN', alertedAt: NOW, reporterId: 'member-1' }, { skipped: 'ALREADY_SENT' }],
    ['gone', null, { skipped: 'NOT_WITH_ADMIN' }],
  ])('sends nothing for a report %s', async (_label, report, result) => {
    prismaMock.problemReport.findUnique.mockResolvedValue(report as never)

    await expect(processProblemReportNotify(job())).resolves.toEqual(result)
    expect(sendDiscordDirectMessage).not.toHaveBeenCalled()
  })

  it('sends nothing while the bot is off, or when no admin linked Discord, and logs why', async () => {
    jest.mocked(isDiscordBotEnabled).mockResolvedValue(false)
    await expect(processProblemReportNotify(job())).resolves.toEqual({ skipped: 'BOT_DISABLED' })
    expect(mockInfo).toHaveBeenLastCalledWith('Skipped a problem report alert', { reportId: 'r1', reason: 'BOT_DISABLED' })

    jest.mocked(isDiscordBotEnabled).mockResolvedValue(true)
    prismaMock.user.findMany.mockResolvedValue([{ id: 'admin-1', discordConnection: null }] as never)
    await expect(processProblemReportNotify(job())).resolves.toEqual({ skipped: 'NO_ADMINS' })
    expect(mockInfo).toHaveBeenLastCalledWith('Skipped a problem report alert', { reportId: 'r1', reason: 'NO_ADMINS' })
    expect(prismaMock.problemReport.updateMany).not.toHaveBeenCalled()
  })

  it("claims nothing when the member's name can't be read, so a retry can still send", async () => {
    const down = new Error('database is down')
    prismaMock.user.findUnique.mockRejectedValue(down)

    await expect(processProblemReportNotify(job())).rejects.toBe(down)

    expect(prismaMock.problemReport.updateMany).not.toHaveBeenCalled()
    expect(sendDiscordDirectMessage).not.toHaveBeenCalled()
  })

  it("lists the member's waiting reports in one DM per admin", async () => {
    prismaMock.problemReport.findMany.mockResolvedValue([
      ...PENDING,
      { id: 'r2', problem: 'blurry', title: 'Pilot', year: 2005, showTitle: 'The Office', seasonNumber: 1, episodeNumber: 1 },
    ] as never)

    await expect(processProblemReportNotify(job())).resolves.toEqual({ sent: 2 })

    expect(prismaMock.problemReport.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['r1', 'r2'] }, alertedAt: null }, data: { alertedAt: NOW } })
    expect(sendDiscordDirectMessage).toHaveBeenCalledTimes(2)
    const content = jest.mocked(sendDiscordDirectMessage).mock.calls[0][1]
    expect(content).toMatch(/^Jane reported 2 problems:\n/)
    expect(content).toContain('/admin/problem-reports/r1>')
    expect(content).toContain('/admin/problem-reports/r2>')
  })

  it('sends nothing when another job claimed the reports first', async () => {
    prismaMock.problemReport.findMany.mockResolvedValue([])

    await expect(processProblemReportNotify(job())).resolves.toEqual({ skipped: 'ALREADY_SENT' })
    expect(sendDiscordDirectMessage).not.toHaveBeenCalled()
  })

  it("skips an admin whose DMs are closed, without a retry", async () => {
    jest.mocked(sendDiscordDirectMessage).mockRejectedValueOnce(new DiscordApiError(403, DISCORD_DMS_CLOSED))

    await expect(processProblemReportNotify(job())).resolves.toEqual({ sent: 1 })

    jest.mocked(sendDiscordDirectMessage).mockRejectedValue(new DiscordApiError(403, DISCORD_DMS_CLOSED))
    await expect(processProblemReportNotify(job())).resolves.toEqual({ skipped: 'DMS_CLOSED' })
    expect(prismaMock.problemReport.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: { alertedAt: null } }))
  })

  it('releases the claim and throws for a retry when no admin could be told', async () => {
    const down = new Error('Discord is down')
    jest.mocked(sendDiscordDirectMessage).mockRejectedValue(down)

    await expect(processProblemReportNotify(job())).rejects.toBe(down)

    expect(prismaMock.problemReport.updateMany).toHaveBeenLastCalledWith({ where: { id: { in: ['r1'] }, alertedAt: NOW }, data: { alertedAt: null } })
  })

  it('keeps the claim when one admin was told and another failed', async () => {
    jest.mocked(sendDiscordDirectMessage).mockRejectedValueOnce(new Error('Discord is down'))

    await expect(processProblemReportNotify(job())).resolves.toEqual({ sent: 1 })
    expect(prismaMock.problemReport.updateMany).toHaveBeenCalledTimes(1)
  })
})

describe('getProblemReportNotifyProcessor', () => {
  it('handles only the alert job', () => {
    expect(getProblemReportNotifyProcessor(JOB_TYPES.PROBLEM_REPORT_NOTIFY)).toBe(processProblemReportNotify)
    expect(getProblemReportNotifyProcessor(JOB_TYPES.INACTIVITY_NOTICE)).toBeNull()
  })
})
