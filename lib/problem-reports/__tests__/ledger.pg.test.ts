/**
 * @jest-environment node
 */

/**
 * The fix ledger on PostgreSQL: a swap's two gates, and the breaker under
 * swaps that reach their grab at the same time. Each gate is its own
 * serializable transaction, so concurrent grabs can't pass the breaker
 * between them: past the limit the rest are refused, and one of them trips
 * it. The admins' alert is mocked; the database is real, and the runs are
 * dated in 2027, so other tests' rows fall outside the breaker's day. Gated by
 * `describePg` and run only by `npm run test:integration`.
 */

import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient, type ProblemReportSettings } from '@/lib/generated/prisma/client'
import { queueBreakerAlert } from '@/lib/problem-reports/breaker-alert'
import { BREAKER_LIMITS, fixTraits } from '@/lib/problem-reports/fixes'
import { gateAndRecord, gateReplace } from '@/lib/problem-reports/ledger'
import { PROBLEM_REPORT_SETTINGS_ID } from '@/lib/problem-reports/settings'
import { describePg } from '@/__tests__/helpers/integration'

let mockDb: PrismaClient
jest.mock('@/lib/prisma', () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock('@/lib/problem-reports/breaker-alert', () => ({ queueBreakerAlert: jest.fn() }))

const RUN = `ledger-${randomUUID().slice(0, 8)}`
const MEMBER = `${RUN}-member`
const REPORTS = Array.from({ length: BREAKER_LIMITS.hour + 3 }, (_, index) => `${RUN}-report-${index}`)
const NOW = new Date('2027-02-01T12:00:00Z')

const swap = (reportId: string) => ({
  reportId,
  runToken: 1,
  reporterId: MEMBER,
  actorUserId: null,
  trigger: 'automatic' as const,
  target: `radarr:movie:${reportId}`,
  titleKey: `plex://movie/${reportId}`,
  action: 'SWAP' as const,
  traits: fixTraits('SWAP'),
  claimedAt: NOW.getTime() - 60_000,
  file: { id: 77, release: 'Heat.1995.1080p.BluRay-BAD' },
})

/** Members' swaps on, with limits the breaker reaches first. */
const SWAPS_ON = { automatic: 'ON' as const, automaticSince: new Date('2027-01-01T00:00:00Z'), weeklySwaps: 20, dailySwapCap: 100 }

describePg('the fix ledger on PostgreSQL', (databaseUrl) => {
  let settingsBefore: ProblemReportSettings | null = null

  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    await mockDb.user.create({ data: { id: MEMBER, name: MEMBER } })
    await mockDb.problemReport.createMany({
      data: REPORTS.map((id) => ({ id, reporterId: MEMBER, problem: 'wont_start', plexRatingKey: '555', mediaType: 'MOVIE', title: 'Heat', titleKey: `plex://movie/${id}`, status: 'FIXING' })),
    })
    settingsBefore = await mockDb.problemReportSettings.findUnique({ where: { id: PROBLEM_REPORT_SETTINGS_ID } })
  })

  beforeEach(async () => {
    jest.mocked(queueBreakerAlert).mockReset()
    await mockDb.problemFixLedger.deleteMany({ where: { reportId: { in: REPORTS } } })
    await mockDb.problemReportSettings.upsert({
      where: { id: PROBLEM_REPORT_SETTINGS_ID },
      create: { id: PROBLEM_REPORT_SETTINGS_ID, enabled: true, ...SWAPS_ON },
      update: { breakerTrippedAt: null, ...SWAPS_ON },
    })
  })

  afterAll(async () => {
    await mockDb.problemFixLedger.deleteMany({ where: { reportId: { in: REPORTS } } })
    await mockDb.auditLog.deleteMany({ where: { actorUserId: MEMBER } })
    await mockDb.problemReport.deleteMany({ where: { id: { in: REPORTS } } })
    await mockDb.user.delete({ where: { id: MEMBER } })
    if (settingsBefore) await mockDb.problemReportSettings.update({ where: { id: PROBLEM_REPORT_SETTINGS_ID }, data: settingsBefore })
    else await mockDb.problemReportSettings.delete({ where: { id: PROBLEM_REPORT_SETTINGS_ID } })
    await mockDb.$disconnect()
  })

  it('counts a swap toward the breaker from its grab, once, and never before', async () => {
    const [report] = REPORTS
    await expect(gateAndRecord(swap(report), NOW)).resolves.toBeNull()
    expect(await mockDb.problemFixLedger.findUnique({ where: { id: `${report}:1` }, select: { replacedAt: true } })).toEqual({ replacedAt: null })

    await expect(gateReplace(swap(report), NOW)).resolves.toBeNull()
    await expect(gateReplace(swap(report), NOW)).resolves.toBe('ALREADY_REPLACED')
    await expect(gateReplace({ ...swap(report), runToken: 2 }, NOW)).resolves.toBe('NO_RUN')
    expect(await mockDb.problemFixLedger.findUnique({ where: { id: `${report}:1` }, select: { replacedAt: true } })).toEqual({ replacedAt: NOW })
  })

  it('lets no more grabs past the breaker when they arrive at once, and trips it once', async () => {
    for (const report of REPORTS) await gateAndRecord(swap(report), NOW)
    const already = BREAKER_LIMITS.hour - 2
    for (const report of REPORTS.slice(0, already)) await gateReplace(swap(report), NOW)

    const racing = REPORTS.slice(already, already + 4)
    const results = await Promise.all(racing.map((reportId) => gateReplace(swap(reportId), NOW)))

    expect(results.filter((result) => result === null)).toHaveLength(2)
    expect(results.filter((result) => result === 'BREAKER')).toHaveLength(2)
    expect(await mockDb.problemFixLedger.count({ where: { replacedAt: { not: null } } })).toBe(BREAKER_LIMITS.hour)
    expect(await mockDb.problemReportSettings.findUnique({ where: { id: PROBLEM_REPORT_SETTINGS_ID }, select: { breakerTrippedAt: true } })).toEqual({ breakerTrippedAt: NOW })
    expect(queueBreakerAlert).toHaveBeenCalledTimes(1)
  })

  it('stops a swap before its search while the breaker is tripped', async () => {
    await mockDb.problemReportSettings.update({ where: { id: PROBLEM_REPORT_SETTINGS_ID }, data: { breakerTrippedAt: NOW } })

    await expect(gateAndRecord(swap(REPORTS[0]), NOW)).resolves.toBe('BREAKER')
    expect(await mockDb.problemFixLedger.count({ where: { reportId: REPORTS[0] } })).toBe(0)
    expect(queueBreakerAlert).not.toHaveBeenCalled()
  })
})
