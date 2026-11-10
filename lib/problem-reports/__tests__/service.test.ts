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
import { queueReportAlert } from '@/lib/problem-reports/alerts'
import { readEvidence } from '@/lib/problem-reports/evidence'
import { decideBetterCopyForMember } from '@/lib/problem-reports/report-better-copy'
import { decideDetailsForMember } from '@/lib/problem-reports/report-details'
import { decideMissingForMember } from '@/lib/problem-reports/report-missing'
import { startFix } from '@/lib/problem-reports/run'
import { cancelProblemReport, followProblemReport, reportProblem } from '@/lib/problem-reports/service'
import { queueMemberUpdates } from '@/lib/problem-reports/updates'
import { consume } from '@/lib/security/rate-limit'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/problem-reports/access', () => ({ readMemberItem: jest.fn() }))
jest.mock('@/lib/problem-reports/evidence', () => ({ readEvidence: jest.fn() }))
jest.mock('@/lib/problem-reports/alerts', () => ({ queueReportAlert: jest.fn() }))
jest.mock('@/lib/problem-reports/report-better-copy', () => ({ decideBetterCopyForMember: jest.fn() }))
jest.mock('@/lib/problem-reports/report-details', () => ({ decideDetailsForMember: jest.fn() }))
jest.mock('@/lib/problem-reports/report-missing', () => ({ decideMissingForMember: jest.fn() }))
jest.mock('@/lib/problem-reports/run', () => ({ startFix: jest.fn() }))
jest.mock('@/lib/problem-reports/updates', () => ({ queueMemberUpdates: jest.fn() }))
jest.mock('@/lib/actions/entitlement', () => ({ hasEntitlement: jest.fn() }))
jest.mock('@/lib/security/rate-limit', () => ({ consume: jest.fn() }))
jest.mock('@/lib/db/serializable', () => ({
  inSerializable: (fn: (tx: unknown) => Promise<unknown>) => fn(require('@/__tests__/helpers/prisma-mock').prismaMock),
}))

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
  media: [],
  locations: [],
}
const MOVIE: PlexItemMetadata = { ...EPISODE, ratingKey: '555', type: 'movie', title: 'Heat', year: 1995, guid: 'plex://movie/heat', showTitle: undefined, seasonNumber: undefined, episodeNumber: undefined }

const EVIDENCE = { lastPlay: { player: 'Living Room', transcoded: false, at: '2026-11-08T20:00:00.000Z' }, playedToEnd: true }

const conflict = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '7', meta: { target: ['activeKey'] } })

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => Promise<unknown>) => fn(asTransactionClient(prismaMock))) as never)
  prismaMock.problemReportSettings.findUnique.mockResolvedValue({ id: 'problem-reports', breakerTrippedAt: null, enabled: true, updatedAt: new Date(), updatedBy: null })
  jest.mocked(hasEntitlement).mockResolvedValue(true)
  jest.mocked(consume).mockResolvedValue({ ok: true })
  jest.mocked(readMemberItem).mockResolvedValue({ ok: true, item: EPISODE, server: SERVER })
  prismaMock.problemReport.create.mockResolvedValue({ id: 'report-1' } as never)
  jest.mocked(readEvidence).mockResolvedValue(EVIDENCE)
  jest.mocked(decideBetterCopyForMember).mockResolvedValue({ startsFix: false, reason: 'NO_RADARR' })
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
      data: { reportId: 'report-1', kind: 'REPORTED', actorUserId: 'member-1', data: { problem: 'out_of_sync', evidence: EVIDENCE } },
    })
    expect(consume).toHaveBeenCalledWith('problem-report:create', 'member-1')
    expect(consume).toHaveBeenCalledWith('problem-report:create:day', 'member-1')
    expect(queueReportAlert).toHaveBeenCalledWith('report-1')
  })

  it("keeps the player answer only for a problem that asks it", async () => {
    await report({ problem: 'no_sound', device: 'nothing_plays' })
    await report({ problem: 'blurry', device: 'nothing_plays' })

    expect(prismaMock.problemReportEvent.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ data: { problem: 'no_sound', device: 'nothing_plays', evidence: EVIDENCE } }),
    })
    expect(prismaMock.problemReportEvent.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ data: { problem: 'blurry', evidence: EVIDENCE } }),
    })
  })

  it("keeps the player answer only when the evidence names the player it was about", async () => {
    jest.mocked(readEvidence).mockResolvedValueOnce({ lastPlay: null, playedToEnd: null })
    jest.mocked(readEvidence).mockResolvedValueOnce({ lastPlay: { ...EVIDENCE.lastPlay, player: null }, playedToEnd: true })

    await report({ problem: 'no_sound', device: 'nothing_plays' })
    await report({ problem: 'no_sound', device: 'nothing_plays' })

    expect(prismaMock.problemReportEvent.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ data: { problem: 'no_sound', evidence: { lastPlay: null, playedToEnd: null } } }),
    })
    expect(prismaMock.problemReportEvent.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ data: { problem: 'no_sound', evidence: { lastPlay: { ...EVIDENCE.lastPlay, player: null }, playedToEnd: true } } }),
    })
  })

  it("keys a title without a guid by its rating key", async () => {
    jest.mocked(readMemberItem).mockResolvedValue({ ok: true, item: { ...MOVIE, guid: undefined }, server: SERVER })

    await report({ ratingKey: '555', problem: 'wont_start' })

    expect(prismaMock.problemReport.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mediaType: 'MOVIE', titleKey: 'plex-rating-key://555', activeKey: 'plex-rating-key://555' }) })
    )
  })

  const OPEN = { id: 'report-open', reporterId: 'member-2', problem: 'out_of_sync', note: null, events: [] }

  it('joins the open report for the title, outside the failed transaction', async () => {
    prismaMock.problemReport.create.mockRejectedValue(conflict())
    prismaMock.problemReport.findFirst.mockResolvedValue(OPEN as never)

    expect(await report({ problem: 'no_sound', note: 'Cuts out at 10 min', device: 'others_play' })).toEqual({
      ok: true,
      outcome: 'joined',
      reportId: 'report-open',
    })

    expect(prismaMock.problemReport.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { activeKey: 'plex://episode/pilot' } }))
    expect(queueReportAlert).not.toHaveBeenCalled()
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledWith({
      data: {
        reportId: 'report-open',
        kind: 'ALSO_REPORTED',
        actorUserId: 'member-1',
        data: { problem: 'no_sound', note: 'Cuts out at 10 min', device: 'others_play', evidence: EVIDENCE },
      },
    })
  })

  it.each([
    ['the reporter sending their own report again', { ...OPEN, reporterId: 'member-1', problem: 'no_sound', note: 'Cuts out' }],
    ['a member sending the same problem and note again', { ...OPEN, events: [{ data: { problem: 'no_sound', note: 'Cuts out' } }] }],
  ])('writes nothing for %s', async (_label, open) => {
    prismaMock.problemReport.create.mockRejectedValue(conflict())
    prismaMock.problemReport.findFirst.mockResolvedValue(open as never)

    expect(await report({ problem: 'no_sound', note: 'Cuts out' })).toEqual({ ok: true, outcome: 'joined', reportId: 'report-open' })
    expect(prismaMock.problemReportEvent.create).not.toHaveBeenCalled()
  })

  it('adds a different problem from the reporter', async () => {
    prismaMock.problemReport.create.mockRejectedValue(conflict())
    prismaMock.problemReport.findFirst.mockResolvedValue({ ...OPEN, reporterId: 'member-1' } as never)

    await report({ problem: 'no_sound', note: null })

    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledTimes(1)
  })

  it('reports again as new when the open report closes before the join', async () => {
    prismaMock.problemReport.create.mockRejectedValueOnce(conflict()).mockResolvedValueOnce({ id: 'report-2' } as never)
    prismaMock.problemReport.findFirst.mockResolvedValue(null)

    expect(await report()).toEqual({ ok: true, outcome: 'reported', reportId: 'report-2' })
  })

  it('gives up after a second race', async () => {
    prismaMock.problemReport.create.mockRejectedValue(conflict())
    prismaMock.problemReport.findFirst.mockResolvedValue(null)

    expect(await report()).toEqual({ ok: false, refusal: 'UNAVAILABLE' })
    expect(prismaMock.problemReport.create).toHaveBeenCalledTimes(2)
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

  it('needs a note for something else, without spending the rate limits', async () => {
    expect(await report({ problem: 'other', note: null })).toEqual({ ok: false, refusal: 'NOTE_REQUIRED' })
    expect(consume).not.toHaveBeenCalled()
    expect(await report({ problem: 'other', note: 'The menus are in French' })).toMatchObject({ ok: true })
  })

  it('refuses episode problems for a movie', async () => {
    jest.mocked(readMemberItem).mockResolvedValue({ ok: true, item: MOVIE, server: SERVER })

    expect(await report({ ratingKey: '555', problem: 'missing_episodes' })).toEqual({ ok: false, refusal: 'WRONG_KIND' })
  })
})

describe('followProblemReport', () => {
  const OPEN = { id: 'report-open', reporterId: 'member-2', problem: 'out_of_sync', note: null, events: [] }

  beforeEach(() => {
    prismaMock.problemReport.findFirst.mockResolvedValueOnce({ plexRatingKey: '7001' } as never)
  })

  it('follows an open report on a title in the member libraries, once, without a note', async () => {
    prismaMock.problemReport.findFirst.mockResolvedValueOnce(OPEN as never)

    expect(await followProblemReport({ userId: 'member-1', reportId: 'report-open' })).toEqual({ ok: true })

    expect(readMemberItem).toHaveBeenCalledWith('member-1', '7001')
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledWith({
      data: { reportId: 'report-open', kind: 'ALSO_REPORTED', actorUserId: 'member-1', data: {} },
    })
  })

  it.each([
    ['the reporter', { ...OPEN, reporterId: 'member-1' }],
    ['a member already following it', { ...OPEN, events: [{ data: {} }] }],
  ])('writes nothing for %s', async (_label, report) => {
    prismaMock.problemReport.findFirst.mockResolvedValueOnce(report as never)

    expect(await followProblemReport({ userId: 'member-1', reportId: 'report-open' })).toEqual({ ok: true })
    expect(prismaMock.problemReportEvent.create).not.toHaveBeenCalled()
  })

  it("refuses a report on a title outside the member's libraries", async () => {
    jest.mocked(readMemberItem).mockResolvedValue({ ok: false, reason: 'NOT_FOUND' })

    expect(await followProblemReport({ userId: 'member-1', reportId: 'report-open' })).toEqual({ ok: false, refusal: 'NOT_FOUND' })
    expect(prismaMock.problemReportEvent.create).not.toHaveBeenCalled()
  })

  it('refuses a report that is closed or unknown', async () => {
    prismaMock.problemReport.findFirst.mockReset()
    prismaMock.problemReport.findFirst.mockResolvedValue(null)

    expect(await followProblemReport({ userId: 'member-1', reportId: 'report-gone' })).toEqual({ ok: false, refusal: 'NOT_FOUND' })
  })

  it('refuses while the switch is off', async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue(null)

    expect(await followProblemReport({ userId: 'member-1', reportId: 'report-open' })).toEqual({ ok: false, refusal: 'OFF' })
  })
})

describe('reportProblem for missing episodes', () => {
  const SHOW: PlexItemMetadata = { ...EPISODE, ratingKey: '6999', type: 'show', title: 'The Office', guid: 'plex://show/office', grandparentRatingKey: undefined, showTitle: undefined, seasonNumber: undefined, episodeNumber: undefined }
  const missing = () => reportProblem({ userId: 'member-1', ratingKey: '7001', problem: 'missing_episodes', note: null })

  beforeEach(() => {
    jest.mocked(readMemberItem).mockImplementation(async (_userId, ratingKey) => ({ ok: true, item: ratingKey === '6999' ? SHOW : EPISODE, server: SERVER }))
    jest.mocked(startFix).mockResolvedValue({ ok: true, runToken: 1 })
  })

  it("answers instead of filing a report when the episodes haven't aired", async () => {
    const answer = { kind: 'NOT_AIRED' as const, season: 1, episode: 6, airsAt: '2026-11-14T02:00:00Z' }
    jest.mocked(decideMissingForMember).mockResolvedValue({ answer })

    expect(await missing()).toEqual({ ok: true, outcome: 'answered', reportId: null, answer })
    expect(prismaMock.problemReport.create).not.toHaveBeenCalled()
    expect(consume).toHaveBeenCalledTimes(2)
  })

  it("files an episode's report on its show and starts Look for the episodes instead of alerting the admins", async () => {
    jest.mocked(decideMissingForMember).mockResolvedValue({ startsFix: true })

    expect(await missing()).toEqual({ ok: true, outcome: 'fixing', reportId: 'report-1', action: 'LOOK_FOR_MISSING' })
    expect(readMemberItem).toHaveBeenLastCalledWith('member-1', '6999')
    expect(decideMissingForMember).toHaveBeenCalledWith(SERVER, SHOW, expect.any(Date))
    expect(prismaMock.problemReport.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ plexRatingKey: '6999', titleKey: 'plex://show/office' }) }))
    expect(startFix).toHaveBeenCalledWith({ reportId: 'report-1', action: 'LOOK_FOR_MISSING', trigger: 'automatic', actorUserId: 'member-1' })
    expect(queueReportAlert).not.toHaveBeenCalled()
  })

  it("alerts the admins when the fix couldn't start", async () => {
    jest.mocked(decideMissingForMember).mockResolvedValue({ startsFix: true })
    jest.mocked(startFix).mockResolvedValue({ ok: false, reason: 'QUEUE_DOWN' })

    expect(await missing()).toEqual({ ok: true, outcome: 'reported', reportId: 'report-1' })
    expect(queueReportAlert).toHaveBeenCalledWith('report-1')
  })

  it("sends the report to the admins with why, when nothing can look for the episodes", async () => {
    jest.mocked(decideMissingForMember).mockResolvedValue({ startsFix: false, reason: 'NOT_IN_SONARR' })

    expect(await missing()).toEqual({ ok: true, outcome: 'reported', reportId: 'report-1' })
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledWith({ data: { reportId: 'report-1', kind: 'TO_ADMIN', data: { reason: 'NOT_IN_SONARR' } } })
    expect(startFix).not.toHaveBeenCalled()
  })

  it('files it for the admins without reading Sonarr when the member sends it anyway', async () => {
    expect(await reportProblem({ userId: 'member-1', ratingKey: '7001', problem: 'missing_episodes', note: null, toAdmin: true })).toEqual({ ok: true, outcome: 'reported', reportId: 'report-1' })
    expect(decideMissingForMember).not.toHaveBeenCalled()
    expect(queueReportAlert).toHaveBeenCalledWith('report-1')
  })

  it("refuses an episode whose show it can't find", async () => {
    jest.mocked(readMemberItem).mockResolvedValue({ ok: true, item: { ...EPISODE, grandparentRatingKey: undefined }, server: SERVER })

    expect(await missing()).toEqual({ ok: false, refusal: 'NOT_FOUND' })
    expect(decideMissingForMember).not.toHaveBeenCalled()
  })
})

describe('reportProblem for a blurry title', () => {
  const SHOW: PlexItemMetadata = { ...EPISODE, ratingKey: '6999', type: 'show', title: 'The Office', guid: 'plex://show/office' }
  const blurry = (overrides: Partial<Parameters<typeof reportProblem>[0]> = {}) => reportProblem({ userId: 'member-1', ratingKey: '555', problem: 'blurry', note: null, ...overrides })

  beforeEach(() => {
    jest.mocked(readMemberItem).mockImplementation(async (_userId, ratingKey) => ({ ok: true, item: ratingKey === '6999' ? SHOW : MOVIE, server: SERVER }))
    jest.mocked(startFix).mockResolvedValue({ ok: true, runToken: 1 })
  })

  it('starts Look for a better copy when the profile wants one, instead of alerting the admins', async () => {
    jest.mocked(decideBetterCopyForMember).mockResolvedValue({ startsFix: true })

    expect(await blurry()).toEqual({ ok: true, outcome: 'fixing', reportId: 'report-1', action: 'BETTER_COPY' })
    expect(decideBetterCopyForMember).toHaveBeenCalledWith(SERVER, '555', EVIDENCE)
    expect(startFix).toHaveBeenCalledWith({ reportId: 'report-1', action: 'BETTER_COPY', trigger: 'automatic', actorUserId: 'member-1' })
    expect(queueReportAlert).not.toHaveBeenCalled()
  })

  it('answers that this is the best copy the server keeps, and files nothing', async () => {
    jest.mocked(decideBetterCopyForMember).mockResolvedValue({ answer: { kind: 'BEST_COPY' } })

    expect(await blurry()).toEqual({ ok: true, outcome: 'answered', reportId: null, answer: { kind: 'BEST_COPY' } })
    expect(prismaMock.problemReport.create).not.toHaveBeenCalled()
  })

  it("sends it to the admins with why when the app can't look", async () => {
    jest.mocked(decideBetterCopyForMember).mockResolvedValue({ startsFix: false, reason: 'TRANSCODED' })

    expect(await blurry()).toEqual({ ok: true, outcome: 'reported', reportId: 'report-1' })
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledWith({ data: { reportId: 'report-1', kind: 'TO_ADMIN', data: { reason: 'TRANSCODED' } } })
    expect(queueReportAlert).toHaveBeenCalledWith('report-1')
  })

  it('files it for the admins without checking when the member sends it anyway', async () => {
    expect(await blurry({ toAdmin: true })).toEqual({ ok: true, outcome: 'reported', reportId: 'report-1' })
    expect(decideBetterCopyForMember).not.toHaveBeenCalled()
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledTimes(1)
  })

  it('leaves a whole show to the admins, since a show has no file', async () => {
    expect(await blurry({ ratingKey: '6999' })).toEqual({ ok: true, outcome: 'reported', reportId: 'report-1' })
    expect(decideBetterCopyForMember).not.toHaveBeenCalled()
  })
})

describe('reportProblem for wrong details', () => {
  const details = (overrides: Partial<Parameters<typeof reportProblem>[0]> = {}) => reportProblem({ userId: 'member-1', ratingKey: '555', problem: 'wrong_details', note: null, ...overrides })

  beforeEach(() => {
    jest.mocked(readMemberItem).mockResolvedValue({ ok: true, item: MOVIE, server: SERVER })
    jest.mocked(startFix).mockResolvedValue({ ok: true, runToken: 1 })
  })

  it('starts Refresh the details, which checks the match in the run, instead of alerting the admins', async () => {
    jest.mocked(decideDetailsForMember).mockResolvedValue({ startsFix: true })

    expect(await details()).toEqual({ ok: true, outcome: 'fixing', reportId: 'report-1', action: 'REFRESH' })
    expect(decideDetailsForMember).toHaveBeenCalledWith('movie')
    expect(startFix).toHaveBeenCalledWith({ reportId: 'report-1', action: 'REFRESH', trigger: 'automatic', actorUserId: 'member-1' })
    expect(queueReportAlert).not.toHaveBeenCalled()
  })

  it("sends it to the admins with why when there is nothing to check the match against, or the member asks", async () => {
    jest.mocked(decideDetailsForMember).mockResolvedValue({ startsFix: false, reason: 'NO_RADARR' })

    expect(await details()).toEqual({ ok: true, outcome: 'reported', reportId: 'report-1' })
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledWith({ data: { reportId: 'report-1', kind: 'TO_ADMIN', data: { reason: 'NO_RADARR' } } })

    jest.mocked(decideDetailsForMember).mockClear()
    expect(await details({ toAdmin: true })).toEqual({ ok: true, outcome: 'reported', reportId: 'report-1' })
    expect(decideDetailsForMember).not.toHaveBeenCalled()
    expect(startFix).not.toHaveBeenCalled()
  })
})

describe('cancelProblemReport', () => {
  it("closes the member's own untouched report, frees the title, and tells the members who follow it", async () => {
    prismaMock.problemReport.updateMany.mockResolvedValue({ count: 1 })

    expect(await cancelProblemReport({ userId: 'member-1', reportId: 'report-1' })).toEqual({ ok: true })
    expect(queueMemberUpdates).toHaveBeenCalledWith('report-1', 'CLOSED', { except: 'member-1', from: 'request' })

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
