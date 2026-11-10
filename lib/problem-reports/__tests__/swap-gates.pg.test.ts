/**
 * @jest-environment node
 */

/**
 * Members' swaps reaching their grab at the same time, on PostgreSQL: each
 * grab's gate re-reads the ledger in its own serializable transaction, so a
 * member one swap short of their allowance, or a server one swap short of
 * its day, gets exactly one more. The runs are dated in April 2027, away
 * from other tests' rows. Gated by `describePg` and run only by
 * `npm run test:integration`.
 */

import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient, type ProblemReportSettings } from '@/lib/generated/prisma/client'
import { fixTraits } from '@/lib/problem-reports/fixes'
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

const RUN = `swap-gates-${randomUUID().slice(0, 8)}`
const MEMBERS = [`${RUN}-a`, `${RUN}-b`, `${RUN}-c`]
const NOW = new Date('2027-04-10T12:00:00Z')
const HOUR = 60 * 60 * 1000
const REPORTS = Array.from({ length: 4 }, (_, index) => `${RUN}-report-${index}`)

const swapOf = (reportId: string, reporterId: string) => ({
  reportId,
  runToken: 1,
  reporterId,
  actorUserId: reporterId,
  trigger: 'automatic' as const,
  target: `radarr:movie:${reportId}`,
  titleKey: `plex://movie/${reportId}`,
  action: 'SWAP' as const,
  traits: fixTraits('SWAP'),
  claimedAt: NOW.getTime() - 60_000,
})

describePg("members' swaps at their grab on PostgreSQL", (databaseUrl) => {
  let settingsBefore: ProblemReportSettings | null = null

  const settings = (dailySwapCap: number) =>
    mockDb.problemReportSettings.upsert({
      where: { id: PROBLEM_REPORT_SETTINGS_ID },
      create: { id: PROBLEM_REPORT_SETTINGS_ID, enabled: true, automatic: 'ON', automaticSince: new Date(NOW.getTime() - 24 * HOUR), weeklySwaps: 3, dailySwapCap },
      update: { breakerTrippedAt: null, automatic: 'ON', automaticSince: new Date(NOW.getTime() - 24 * HOUR), weeklySwaps: 3, dailySwapCap },
    })
  const earlierSwap = (id: string, reporterId: string, hoursAgo: number) =>
    mockDb.problemFixLedger.create({
      data: { id: `${RUN}-${id}`, target: `radarr:movie:${id}`, titleKey: `plex://movie/${RUN}-${id}`, action: 'SWAP', trigger: 'automatic', reporterId, startedAt: new Date(NOW.getTime() - hoursAgo * HOUR), replacedAt: new Date(NOW.getTime() - hoursAgo * HOUR), outcome: 'FIXED' },
    })

  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    await mockDb.user.createMany({ data: MEMBERS.map((id) => ({ id, name: id })) })
    await mockDb.problemReport.createMany({
      data: REPORTS.map((id) => ({ id, reporterId: MEMBERS[0], problem: 'wont_start', plexRatingKey: '555', mediaType: 'MOVIE', title: 'Heat', titleKey: `plex://movie/${id}`, status: 'FIXING' })),
    })
    settingsBefore = await mockDb.problemReportSettings.findUnique({ where: { id: PROBLEM_REPORT_SETTINGS_ID } })
  })

  afterEach(async () => {
    await mockDb.problemFixLedger.deleteMany({ where: { id: { startsWith: RUN } } })
  })

  afterAll(async () => {
    await mockDb.auditLog.deleteMany({ where: { actorUserId: { in: MEMBERS } } })
    await mockDb.problemReport.deleteMany({ where: { id: { in: REPORTS } } })
    await mockDb.user.deleteMany({ where: { id: { in: MEMBERS } } })
    if (settingsBefore) await mockDb.problemReportSettings.update({ where: { id: PROBLEM_REPORT_SETTINGS_ID }, data: settingsBefore })
    else await mockDb.problemReportSettings.delete({ where: { id: PROBLEM_REPORT_SETTINGS_ID } })
    await mockDb.$disconnect()
  })

  it('lets a member one swap short of their allowance make exactly one more', async () => {
    await settings(10)
    await earlierSwap('earlier-1', MEMBERS[0], 24)
    await earlierSwap('earlier-2', MEMBERS[0], 48)
    const runs = REPORTS.slice(0, 3).map((reportId) => swapOf(reportId, MEMBERS[0]))
    // Nothing is replaced yet, so every run passes its first gate
    for (const run of runs) await expect(gateAndRecord(run, NOW)).resolves.toBeNull()

    const grabs = await Promise.all(runs.map((run) => gateReplace(run, NOW)))

    expect(grabs.filter((grab) => grab === null)).toHaveLength(1)
    expect(grabs.filter((grab) => grab === 'OUT_OF_SWAPS')).toHaveLength(2)
    expect(await mockDb.problemFixLedger.count({ where: { reportId: { in: REPORTS }, replacedAt: { not: null } } })).toBe(1)
  })

  it("lets the server one swap short of its day make exactly one more, whoever asks", async () => {
    await settings(2)
    await earlierSwap('earlier-today', MEMBERS[2], 2)
    const runs = [swapOf(REPORTS[0], MEMBERS[0]), swapOf(REPORTS[1], MEMBERS[1])]
    for (const run of runs) await expect(gateAndRecord(run, NOW)).resolves.toBeNull()

    const grabs = await Promise.all(runs.map((run) => gateReplace(run, NOW)))

    expect(grabs.sort()).toEqual(['PAUSED', null].sort())
  })
})
