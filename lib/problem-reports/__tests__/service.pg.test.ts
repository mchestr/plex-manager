/**
 * @jest-environment node
 */

/**
 * reportProblem on PostgreSQL: members reporting the same title at once make
 * one report, and every other attempt becomes one `ALSO_REPORTED` event on
 * it, through the unique `activeKey`. Cancelling frees the title for a new
 * report. Plex, entitlement and the rate limits are mocked; the database is
 * real. Gated by `describePg` and run only by `npm run test:integration`.
 */

import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'

import { hasEntitlement } from '@/lib/actions/entitlement'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { readMemberItem } from '@/lib/problem-reports/access'
import { cancelProblemReport, reportProblem } from '@/lib/problem-reports/service'
import { PROBLEM_REPORT_SETTINGS_ID } from '@/lib/problem-reports/settings'
import { consume } from '@/lib/security/rate-limit'
import { describePg } from '@/__tests__/helpers/integration'

let mockDb: PrismaClient
jest.mock('@/lib/prisma', () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock('@/lib/problem-reports/access', () => ({ readMemberItem: jest.fn() }))
jest.mock('@/lib/actions/entitlement', () => ({ hasEntitlement: jest.fn() }))
jest.mock('@/lib/security/rate-limit', () => ({ consume: jest.fn() }))

const RUN = `pr-${randomUUID().slice(0, 8)}`
const MEMBERS = Array.from({ length: 5 }, (_, index) => `${RUN}-member-${index}`)
const GUID = `plex://movie/${RUN}`
const SERVER = { name: 'Home', url: 'http://plex.local:32400', token: 'owner-token', adminPlexUserId: 'owner', machineIdentifier: 'm' }

describePg('reportProblem on PostgreSQL', (databaseUrl) => {
  let createdSettings = false

  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    await mockDb.user.createMany({ data: MEMBERS.map((id) => ({ id, name: id })) })
    createdSettings = !(await mockDb.problemReportSettings.findUnique({ where: { id: PROBLEM_REPORT_SETTINGS_ID } }))
    await mockDb.problemReportSettings.upsert({
      where: { id: PROBLEM_REPORT_SETTINGS_ID },
      create: { id: PROBLEM_REPORT_SETTINGS_ID, enabled: true },
      update: { enabled: true },
    })
    jest.mocked(hasEntitlement).mockResolvedValue(true)
    jest.mocked(consume).mockResolvedValue({ ok: true })
    jest.mocked(readMemberItem).mockResolvedValue({
      ok: true,
      server: SERVER,
      item: { ratingKey: '555', type: 'movie', title: 'Heat', year: 1995, guid: GUID, ids: {}, librarySectionId: '1', parts: [], locations: [] },
    })
  })

  afterAll(async () => {
    await mockDb.user.deleteMany({ where: { id: { in: MEMBERS } } })
    if (createdSettings) await mockDb.problemReportSettings.delete({ where: { id: PROBLEM_REPORT_SETTINGS_ID } })
    await mockDb.$disconnect()
  })

  it('makes one report for one title, and one ALSO_REPORTED event per other member', async () => {
    const results = await Promise.all(
      MEMBERS.map((userId) => reportProblem({ userId, ratingKey: '555', problem: 'wont_start', note: null }))
    )

    expect(results.filter((result) => result.ok && result.outcome === 'reported')).toHaveLength(1)
    expect(results.filter((result) => result.ok && result.outcome === 'joined')).toHaveLength(MEMBERS.length - 1)
    const reports = await mockDb.problemReport.findMany({ where: { titleKey: GUID }, include: { events: true } })
    expect(reports).toHaveLength(1)
    expect(reports[0].activeKey).toBe(GUID)
    expect(reports[0].events.filter((event) => event.kind === 'REPORTED')).toHaveLength(1)
    expect(reports[0].events.filter((event) => event.kind === 'ALSO_REPORTED')).toHaveLength(MEMBERS.length - 1)
  })

  it('frees the title once the reporter cancels, so the next report is new', async () => {
    const open = await mockDb.problemReport.findUniqueOrThrow({ where: { activeKey: GUID } })

    expect(await cancelProblemReport({ userId: open.reporterId, reportId: open.id })).toEqual({ ok: true })
    const next = await reportProblem({ userId: MEMBERS[0], ratingKey: '555', problem: 'glitches', note: null })

    expect(next).toMatchObject({ ok: true, outcome: 'reported' })
    await expect(mockDb.problemReport.count({ where: { titleKey: GUID } })).resolves.toBe(2)
    await expect(mockDb.problemReport.findUniqueOrThrow({ where: { id: open.id } })).resolves.toMatchObject({ status: 'CLOSED', activeKey: null })
  })
})
