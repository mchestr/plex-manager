/**
 * @jest-environment node
 */

/**
 * What the swap limits count, read from a real ledger: which of a member's
 * swaps still count, a title's attempts in its cooldown and in 60 days, the
 * server's day, a run's own row left out, and that deleting reports changes
 * none of it. Rows are dated in March 2027, away from other tests' rows.
 * Gated by `describePg` and run only by `npm run test:integration`.
 */

import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/lib/generated/prisma/client'
import { readSwapLedger } from '@/lib/problem-reports/swap-ledger'
import { describePg } from '@/__tests__/helpers/integration'
import { asAppTransactionClient } from '@/__tests__/helpers/prisma-mock'

const RUN = `swap-ledger-${randomUUID().slice(0, 8)}`
const MEMBER = `${RUN}-member`
const OTHER = `${RUN}-other`
const TITLE = `plex://movie/${RUN}`
const NOW = new Date('2027-03-15T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const ago = (days: number) => new Date(NOW.getTime() - days * DAY)

describePg('the swap limits on PostgreSQL', (databaseUrl) => {
  let db: PrismaClient
  const row = (id: string, fields: Record<string, unknown>) => ({
    id: `${RUN}-${id}`,
    target: `radarr:movie:${id}`,
    action: 'SWAP',
    trigger: 'automatic',
    reporterId: MEMBER,
    startedAt: ago(1),
    ...fields,
  })

  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    await db.user.createMany({ data: [{ id: MEMBER, name: MEMBER }, { id: OTHER, name: OTHER }] })
  })

  afterEach(async () => {
    await db.problemFixLedger.deleteMany({ where: { id: { startsWith: RUN } } })
    await db.problemReport.deleteMany({ where: { reporterId: MEMBER } })
  })

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: [MEMBER, OTHER] } } })
    await db.$disconnect()
  })

  it("counts a member's swaps from their grab for 7 days, while running or fixed", async () => {
    await db.problemFixLedger.createMany({
      data: [
        row('fixed', { replacedAt: ago(2), outcome: 'FIXED' }),
        row('running', { replacedAt: ago(3) }),
        row('failed', { replacedAt: ago(4), outcome: 'GRAB_FAILED' }),
        row('old', { replacedAt: ago(8), outcome: 'FIXED' }),
        row('not-grabbed', {}),
        row('admin', { trigger: 'web', replacedAt: ago(1), outcome: 'FIXED' }),
        row('other-member', { reporterId: OTHER, replacedAt: ago(1) }),
      ],
    })

    const ledger = await readSwapLedger(asAppTransactionClient(db), { reporterId: MEMBER, titleKey: TITLE, cooldownDays: 14 }, NOW)
    expect(ledger.memberSwaps.map((at) => at.toISOString()).sort()).toEqual([ago(3).toISOString(), ago(2).toISOString()])
    // Every member's swap whose grab is in the last day, whoever asked
    expect(ledger.serverToday).toBe(1)
  })

  it("counts a title's automatic swaps in its cooldown and every swap in 60 days, without dry runs or the run's own row", async () => {
    await db.problemFixLedger.createMany({
      data: [
        row('recent', { titleKey: TITLE, startedAt: ago(5), outcome: 'NO_OTHER_COPY' }),
        row('dry-run', { titleKey: TITLE, startedAt: ago(1), outcome: 'DRY_RUN' }),
        row('admin-swap', { titleKey: TITLE, trigger: 'web', startedAt: ago(30), outcome: 'FIXED' }),
        row('long-ago', { titleKey: TITLE, startedAt: ago(70), outcome: 'FIXED' }),
        row('own', { titleKey: TITLE, startedAt: ago(0) }),
        row('removal', { titleKey: TITLE, action: 'REMOVE_AND_SEARCH', trigger: 'web', startedAt: ago(2) }),
      ],
    })

    await expect(readSwapLedger(asAppTransactionClient(db), { reporterId: MEMBER, titleKey: TITLE, cooldownDays: 14, excludeId: `${RUN}-own` }, NOW)).resolves.toMatchObject({ titleRecent: 1, titleTwoMonths: 2 })
    await expect(readSwapLedger(asAppTransactionClient(db), { reporterId: MEMBER, titleKey: TITLE, cooldownDays: 3 }, NOW)).resolves.toMatchObject({ titleRecent: 1, titleTwoMonths: 3 })
  })

  it("keeps counting after the member deletes their reports", async () => {
    const report = await db.problemReport.create({
      data: { reporterId: MEMBER, problem: 'wont_start', plexRatingKey: '555', mediaType: 'MOVIE', title: 'Heat', titleKey: TITLE, status: 'FIXED' },
      select: { id: true },
    })
    await db.problemFixLedger.create({ data: row('deleted', { reportId: report.id, titleKey: TITLE, replacedAt: ago(1), outcome: 'FIXED' }) })
    const before = await readSwapLedger(asAppTransactionClient(db), { reporterId: MEMBER, titleKey: TITLE, cooldownDays: 14 }, NOW)

    await db.problemReport.delete({ where: { id: report.id } })

    await expect(readSwapLedger(asAppTransactionClient(db), { reporterId: MEMBER, titleKey: TITLE, cooldownDays: 14 }, NOW)).resolves.toEqual(before)
    expect(before).toMatchObject({ titleRecent: 1, titleTwoMonths: 1, serverToday: 1 })
    expect(before.memberSwaps).toHaveLength(1)
  })
})
