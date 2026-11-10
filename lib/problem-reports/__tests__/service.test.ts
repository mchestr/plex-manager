/**
 * The problem report service's rules: the switch, entitlement, rate limits,
 * library access, the note for "Something else", one open report per title,
 * following, and cancelling only your own untouched report.
 */

import { mockReset } from 'jest-mock-extended'

import { prismaMock, asTransactionClient } from '@/__tests__/helpers/prisma-mock'
import type { PlexItemMetadata } from '@/lib/connections/plex'
import { hasEntitlement } from '@/lib/actions/entitlement'
import { Prisma } from '@/lib/generated/prisma/client'
import { readMemberItem } from '@/lib/problem-reports/access'
import { cancelProblemReport, followProblemReport, reportProblem } from '@/lib/problem-reports/service'
import { consume } from '@/lib/security/rate-limit'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/problem-reports/access', () => ({ readMemberItem: jest.fn() }))
jest.mock('@/lib/actions/entitlement', () => ({ hasEntitlement: jest.fn() }))
jest.mock('@/lib/security/rate-limit', () => ({ consume: jest.fn() }))

const SERVER = { name: 'Home', url: 'http://plex.local:32400', token: 'owner-token', adminPlexUserId: 'owner', machineIdentifier: 'm' }
const EPISODE: PlexItemMetadata = {
  ratingKey: '7001',
  type: 'episode',
  title: 'Pilot',
  year: 2005,
  guid: 'plex://episode/pilot',
  ids: {},
  librarySectionId: '2',
  grandparentRatingKey: '6999',
  showTitle: 'The Office',
  seasonNumber: 1,
  episodeNumber: 1,
  parts: [],
  locations: [],
}
const MOVIE: PlexItemMetadata = { ...EPISODE, ratingKey: '555', type: 'movie', title: 'Heat', year: 1995, guid: 'plex://movie/heat', showTitle: undefined, seasonNumber: undefined, episodeNumber: undefined }

const conflict = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '7', meta: { target: ['activeKey'] } })

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => Promise<unknown>) => fn(asTransactionClient(prismaMock))) as never)
  prismaMock.problemReportSettings.findUnique.mockResolvedValue({ id: 'problem-reports', enabled: true, updatedAt: new Date(), updatedBy: null })
  jest.mocked(hasEntitlement).mockResolvedValue(true)
  jest.mocked(consume).mockResolvedValue({ ok: true })
  jest.mocked(readMemberItem).mockResolvedValue({ ok: true, item: EPISODE, server: SERVER })
  prismaMock.problemReport.create.mockResolvedValue({ id: 'report-1' } as never)
})

describe('reportProblem', () => {
  const report = (overrides: Partial<Parameters<typeof reportProblem>[0]> = {}) =>
    reportProblem({ userId: 'member-1', ratingKey: '7001', problem: 'out_of_sync', note: null, ...overrides })

  it('saves a report from what Plex says about the title, with the server admin', async () => {
    expect(await report({ note: 'From the start' })).toEqual({ ok: true, outcome: 'reported', reportId: 'report-1' })

    expect(prismaMock.problemReport.create).toHaveBeenCalledWith({
      data: {
        reporterId: 'member-1',
        problem: 'out_of_sync',
        note: 'From the start',
        mediaType: 'EPISODE',
        plexRatingKey: '7001',
        titleKey: 'plex://episode/pilot',
        activeKey: 'plex://episode/pilot',
        title: 'Pilot',
        year: 2005,
        showTitle: 'The Office',
        seasonNumber: 1,
        episodeNumber: 1,
        status: 'WITH_ADMIN',
      },
      select: { id: true },
    })
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledWith({
      data: { reportId: 'report-1', kind: 'REPORTED', actorUserId: 'member-1', data: { problem: 'out_of_sync' } },
    })
    expect(consume).toHaveBeenCalledWith('problem-report:create', 'member-1')
    expect(consume).toHaveBeenCalledWith('problem-report:create:day', 'member-1')
  })

  it("keys a title without a guid by its rating key", async () => {
    jest.mocked(readMemberItem).mockResolvedValue({ ok: true, item: { ...MOVIE, guid: undefined }, server: SERVER })

    await report({ ratingKey: '555', problem: 'wont_start' })

    expect(prismaMock.problemReport.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mediaType: 'MOVIE', titleKey: 'plex-rating-key://555', activeKey: 'plex-rating-key://555' }) })
    )
  })

  it('joins the open report for the title, outside the failed transaction', async () => {
    prismaMock.problemReport.create.mockRejectedValue(conflict())
    prismaMock.problemReport.findUnique.mockResolvedValue({ id: 'report-open' } as never)

    expect(await report({ problem: 'no_sound', note: 'Cuts out at 10 min' })).toEqual({ ok: true, outcome: 'joined', reportId: 'report-open' })

    expect(prismaMock.problemReport.findUnique).toHaveBeenCalledWith({ where: { activeKey: 'plex://episode/pilot' }, select: { id: true } })
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledWith({
      data: { reportId: 'report-open', kind: 'ALSO_REPORTED', actorUserId: 'member-1', data: { problem: 'no_sound', note: 'Cuts out at 10 min' } },
    })
  })

  it('passes on any other database error', async () => {
    prismaMock.problemReport.create.mockRejectedValue(new Error('connection lost'))

    await expect(report()).rejects.toThrow('connection lost')
  })

  it.each([
    ['the switch is off', () => prismaMock.problemReportSettings.findUnique.mockResolvedValue(null), 'OFF'],
    ['the member is not entitled', () => jest.mocked(hasEntitlement).mockResolvedValue(false), 'NOT_ENTITLED'],
    ['the title is not in their libraries', () => jest.mocked(readMemberItem).mockResolvedValue({ ok: false, reason: 'NOT_FOUND' }), 'NOT_FOUND'],
    ['Plex cannot be read', () => jest.mocked(readMemberItem).mockResolvedValue({ ok: false, reason: 'UNAVAILABLE' }), 'UNAVAILABLE'],
  ])('refuses when %s, and writes nothing', async (_label, arrange, refusal) => {
    arrange()

    expect(await report()).toEqual({ ok: false, refusal })
    expect(prismaMock.problemReport.create).not.toHaveBeenCalled()
  })

  it('refuses a member over a rate limit, with the wait', async () => {
    jest.mocked(consume).mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, retryAfterSec: 3600 })

    expect(await report()).toEqual({ ok: false, refusal: 'RATE_LIMITED', retryAfterSec: 3600 })
    expect(readMemberItem).not.toHaveBeenCalled()
  })

  it('needs a note for something else', async () => {
    expect(await report({ problem: 'other', note: null })).toEqual({ ok: false, refusal: 'NOTE_REQUIRED' })
    expect(await report({ problem: 'other', note: 'The menus are in French' })).toMatchObject({ ok: true })
  })

  it('refuses episode problems for a movie', async () => {
    jest.mocked(readMemberItem).mockResolvedValue({ ok: true, item: MOVIE, server: SERVER })

    expect(await report({ ratingKey: '555', problem: 'missing_episodes' })).toEqual({ ok: false, refusal: 'WRONG_KIND' })
  })
})

describe('followProblemReport', () => {
  const OPEN = { id: 'report-open', reporterId: 'member-2', events: [] }

  it('follows an open report once, without a note', async () => {
    prismaMock.problemReport.findFirst.mockResolvedValue(OPEN as never)

    expect(await followProblemReport({ userId: 'member-1', reportId: 'report-open' })).toEqual({ ok: true })

    expect(prismaMock.problemReport.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'report-open', activeKey: { not: null } } })
    )
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledWith({
      data: { reportId: 'report-open', kind: 'ALSO_REPORTED', actorUserId: 'member-1', data: {} },
    })
  })

  it.each([
    ['the reporter', { ...OPEN, reporterId: 'member-1' }],
    ['a member already following it', { ...OPEN, events: [{ id: 'event-1' }] }],
  ])('writes nothing for %s', async (_label, report) => {
    prismaMock.problemReport.findFirst.mockResolvedValue(report as never)

    expect(await followProblemReport({ userId: 'member-1', reportId: 'report-open' })).toEqual({ ok: true })
    expect(prismaMock.problemReportEvent.create).not.toHaveBeenCalled()
  })

  it('refuses a report that is closed or unknown', async () => {
    prismaMock.problemReport.findFirst.mockResolvedValue(null)

    expect(await followProblemReport({ userId: 'member-1', reportId: 'report-gone' })).toEqual({ ok: false, refusal: 'NOT_FOUND' })
  })

  it('refuses while the switch is off', async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue(null)

    expect(await followProblemReport({ userId: 'member-1', reportId: 'report-open' })).toEqual({ ok: false, refusal: 'OFF' })
  })
})

describe('cancelProblemReport', () => {
  it("closes the member's own untouched report and frees the title", async () => {
    prismaMock.problemReport.updateMany.mockResolvedValue({ count: 1 })

    expect(await cancelProblemReport({ userId: 'member-1', reportId: 'report-1' })).toEqual({ ok: true })

    expect(prismaMock.problemReport.updateMany).toHaveBeenCalledWith({
      where: { id: 'report-1', reporterId: 'member-1', status: { in: ['SENT', 'WITH_ADMIN'] } },
      data: { status: 'CLOSED', activeKey: null, resolvedAt: expect.any(Date) },
    })
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledWith({
      data: { reportId: 'report-1', kind: 'CLOSED', actorUserId: 'member-1', data: { reason: 'cancelled' } },
    })
  })

  it("refuses someone else's report, or one already fixing or closed", async () => {
    prismaMock.problemReport.updateMany.mockResolvedValue({ count: 0 })

    expect(await cancelProblemReport({ userId: 'member-1', reportId: 'report-2' })).toEqual({ ok: false, refusal: 'NOT_FOUND' })
    expect(prismaMock.problemReportEvent.create).not.toHaveBeenCalled()
  })
})
