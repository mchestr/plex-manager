/**
 * Ask the server admin: a member's own report that Look for a better copy
 * closed goes back to the admins once, with the title checked against their
 * libraries again, or joins the title's newer open report.
 */

import { mockReset } from 'jest-mock-extended'

import { asTransactionClient, prismaMock } from '@/__tests__/helpers/prisma-mock'
import { hasEntitlement } from '@/lib/actions/entitlement'
import type { PlexItemMetadata } from '@/lib/connections/plex'
import { Prisma } from '@/lib/generated/prisma/client'
import { readMemberItem } from '@/lib/problem-reports/access'
import { queueReportAlert } from '@/lib/problem-reports/alerts'
import { askServerAdmin } from '@/lib/problem-reports/ask-admin'
import { consume } from '@/lib/security/rate-limit'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/problem-reports/access', () => ({ readMemberItem: jest.fn() }))
jest.mock('@/lib/problem-reports/alerts', () => ({ queueReportAlert: jest.fn() }))
jest.mock('@/lib/actions/entitlement', () => ({ hasEntitlement: jest.fn() }))
jest.mock('@/lib/security/rate-limit', () => ({ consume: jest.fn() }))
jest.mock('@/lib/db/serializable', () => ({
  inSerializable: (fn: (tx: unknown) => Promise<unknown>) => fn(require('@/__tests__/helpers/prisma-mock').prismaMock),
}))

const SERVER = { name: 'Home', url: 'http://plex.local:32400', token: 'owner-token', adminPlexUserId: 'owner', machineIdentifier: 'm' }
const MOVIE: PlexItemMetadata = { ratingKey: '555', type: 'movie', title: 'Heat', year: 1995, guid: 'plex://movie/heat', ids: {}, librarySectionId: '1', media: [], locations: [] }

const conflict = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '7', meta: { target: ['activeKey'] } })

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => Promise<unknown>) => fn(asTransactionClient(prismaMock))) as never)
  prismaMock.problemReportSettings.findUnique.mockResolvedValue({ id: 'problem-reports', breakerTrippedAt: null, enabled: true, updatedAt: new Date(), updatedBy: null })
  jest.mocked(hasEntitlement).mockResolvedValue(true)
  jest.mocked(consume).mockResolvedValue({ ok: true })
})

describe('askServerAdmin', () => {
  const ask = () => askServerAdmin({ userId: 'member-1', reportId: 'report-1' })
  const closed = (kind: string, data: unknown) => ({ titleKey: 'plex://movie/heat', problem: 'blurry', note: 'Soft all through', plexRatingKey: '555', events: [{ kind, data }] })

  beforeEach(() => {
    jest.mocked(readMemberItem).mockResolvedValue({ ok: true, item: MOVIE, server: SERVER })
    prismaMock.problemReport.findFirst.mockResolvedValue(closed('CLOSED', { reason: 'no_better_copy' }) as never)
    prismaMock.problemReport.updateMany.mockResolvedValue({ count: 1 })
  })

  it('puts a report that found no better copy back with the admins, and alerts them', async () => {
    expect(await ask()).toEqual({ ok: true, reportId: 'report-1' })

    expect(prismaMock.problemReport.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'report-1', reporterId: 'member-1', status: 'CLOSED' } }))
    expect(prismaMock.problemReport.updateMany).toHaveBeenCalledWith({
      where: { id: 'report-1', reporterId: 'member-1', status: 'CLOSED', activeKey: null },
      data: { status: 'WITH_ADMIN', activeKey: 'plex://movie/heat', resolvedAt: null, alertedAt: null },
    })
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledWith({ data: { reportId: 'report-1', kind: 'REOPENED', actorUserId: 'member-1' } })
    expect(readMemberItem).toHaveBeenCalledWith('member-1', '555')
    expect(queueReportAlert).toHaveBeenCalledWith('report-1')
    expect(consume).toHaveBeenCalledWith('problem-report:create', 'member-1')
  })

  it('adds the problem to the open report when another member reported the title since', async () => {
    prismaMock.problemReport.updateMany.mockRejectedValue(conflict())
    prismaMock.problemReport.findFirst
      .mockResolvedValueOnce(closed('CLOSED', { reason: 'no_better_copy' }) as never)
      .mockResolvedValueOnce({ id: 'report-2', reporterId: 'member-2', problem: 'glitches', note: null, events: [] } as never)

    expect(await ask()).toEqual({ ok: true, reportId: 'report-2' })
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledWith({
      data: { reportId: 'report-2', kind: 'ALSO_REPORTED', actorUserId: 'member-1', data: { problem: 'blurry', note: 'Soft all through' } },
    })
    expect(queueReportAlert).not.toHaveBeenCalled()
  })

  it.each([
    ['the server admin closed it', closed('CLOSED', { reason: 'admin' })],
    ['the member cancelled it', closed('CLOSED', { reason: 'cancelled' })],
    ['it is not their closed report', null],
  ])("refuses when %s", async (_label, report) => {
    prismaMock.problemReport.findFirst.mockResolvedValue(report as never)

    expect(await ask()).toEqual({ ok: false, refusal: 'NOT_FOUND' })
    expect(prismaMock.problemReport.updateMany).not.toHaveBeenCalled()
  })

  it('refuses a second tap, which finds the report already back with the admins', async () => {
    prismaMock.problemReport.updateMany.mockResolvedValue({ count: 0 })

    expect(await ask()).toEqual({ ok: false, refusal: 'NOT_FOUND' })
    expect(queueReportAlert).not.toHaveBeenCalled()
  })

  it("refuses a title that is no longer in the member's libraries, and refuses while the switch is off", async () => {
    jest.mocked(readMemberItem).mockResolvedValueOnce({ ok: false, reason: 'NOT_FOUND' })
    expect(await ask()).toEqual({ ok: false, refusal: 'NOT_FOUND' })

    prismaMock.problemReportSettings.findUnique.mockResolvedValue(null)
    expect(await ask()).toEqual({ ok: false, refusal: 'OFF' })
    expect(prismaMock.problemReport.updateMany).not.toHaveBeenCalled()
  })
})
