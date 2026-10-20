/**
 * @jest-environment node
 */

/**
 * `entitledUserWhere` (lib/access.ts) as PostgreSQL runs it, in the shape
 * `syncAllEnabledUsers` uses: through the `WatchlistSyncSettings.user`
 * relation (P4.5, SEC-28). It must select the same users `isAccessAllowed`
 * allows.
 *
 * Gated by `describePg` (test/helpers/integration.ts) and run only by
 * `npm run test:integration`. The suite only touches rows whose user id
 * starts with its own run prefix.
 */

import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'

import { entitledUserWhere } from '@/lib/access'
import { PrismaClient, type SubscriptionStatus } from '@/lib/generated/prisma/client'
import { describePg } from '@/test/helpers/integration'

// lib/access imports the app's client; this suite queries through its own.
jest.mock('@/lib/prisma', () => ({ prisma: {} }))

const RUN = `p45-${randomUUID()}`

const MEMBERS: Array<{
  name: string
  isAdmin?: boolean
  isExempt?: boolean
  disabled?: boolean
  status?: SubscriptionStatus
}> = [
  { name: 'admin', isAdmin: true },
  { name: 'exempt', isExempt: true },
  { name: 'active', status: 'ACTIVE' },
  { name: 'past-due', status: 'PAST_DUE' },
  { name: 'canceled', status: 'CANCELED' },
  { name: 'unpaid', status: 'UNPAID' },
  { name: 'no-subscription' },
  { name: 'disabled-admin', isAdmin: true, disabled: true },
]

describePg('entitledUserWhere on PostgreSQL', (databaseUrl) => {
  let db: PrismaClient

  async function selected(stripeEnabled: boolean): Promise<string[]> {
    const rows = await db.watchlistSyncSettings.findMany({
      where: { userId: { startsWith: RUN }, syncEnabled: true, user: entitledUserWhere(stripeEnabled) },
      select: { userId: true },
    })
    return rows.map((row) => row.userId.slice(RUN.length + 1)).sort()
  }

  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    for (const member of MEMBERS) {
      const id = `${RUN}-${member.name}`
      await db.user.create({
        data: {
          id,
          isAdmin: member.isAdmin ?? false,
          isExempt: member.isExempt ?? false,
          disabledAt: member.disabled ? new Date() : null,
          watchlistSyncSettings: { create: { syncEnabled: true } },
          ...(member.status && {
            subscription: { create: { status: member.status, stripeCustomerId: `cus_${id}` } },
          }),
        },
      })
    }
  })

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { startsWith: RUN } } })
    await db.$disconnect()
  })

  it('selects admins, exempt users and ACTIVE or PAST_DUE subscribers with Stripe on', async () => {
    await expect(selected(true)).resolves.toEqual(['active', 'admin', 'exempt', 'past-due'])
  })

  it('selects everyone but disabled users with Stripe off', async () => {
    await expect(selected(false)).resolves.toEqual(
      ['active', 'admin', 'canceled', 'exempt', 'no-subscription', 'past-due', 'unpaid'].sort()
    )
  })
})
