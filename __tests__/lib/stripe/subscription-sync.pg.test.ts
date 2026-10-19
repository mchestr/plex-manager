/**
 * @jest-environment node
 */

/**
 * `applySubscriptionState` (lib/stripe/subscription-sync.ts) as PostgreSQL
 * runs it (P4.10, SEC-37): an older event never overwrites a newer one, a move
 * into ACTIVE is reported only from UNPAID, CANCELED or INCOMPLETE, and two
 * concurrent writes of the same transition report it once.
 *
 * Gated by `describePg` (test/helpers/integration.ts) and run only by
 * `npm run test:integration`. The suite only touches rows whose user id
 * starts with its own run prefix.
 */

import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'

import { applySubscriptionState, type LiveSubscriptionState } from '@/lib/stripe/subscription-sync'
import { PrismaClient, SubscriptionStatus } from '@/lib/generated/prisma/client'
import { describePg } from '@/test/helpers/integration'

let mockDb: PrismaClient | null = null
jest.mock('@/lib/prisma', () => ({
  get prisma() {
    return mockDb
  },
}))

const RUN = `p410-${randomUUID()}`

function live(status: SubscriptionStatus): LiveSubscriptionState {
  return { status, priceId: 'price_1', currentPeriodEnd: null, cancelAtPeriodEnd: false }
}

const at = (seconds: number) => new Date(1_760_000_000_000 + seconds * 1000)

describePg('applySubscriptionState on PostgreSQL', (databaseUrl) => {
  let db: PrismaClient
  let n = 0

  /** A user with a subscription row in `status`, last written by an event at `eventAt`. */
  async function member(status: SubscriptionStatus, eventAt: Date | null = null) {
    n += 1
    const userId = `${RUN}-${n}`
    const stripeSubscriptionId = `sub_${userId}`
    await db.user.create({
      data: { id: userId, subscription: { create: { status, stripeSubscriptionId, stripeEventAt: eventAt } } },
    })
    return { userId, stripeSubscriptionId }
  }

  const statusOf = async (userId: string) =>
    (await db.subscription.findUniqueOrThrow({ where: { userId }, select: { status: true } })).status

  beforeAll(() => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    mockDb = db
  })

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { startsWith: RUN } } })
    await db.$disconnect()
  })

  it('applies a newer event and skips an older one', async () => {
    const { userId, stripeSubscriptionId } = await member(SubscriptionStatus.ACTIVE)

    await expect(
      applySubscriptionState({ stripeSubscriptionId }, live(SubscriptionStatus.CANCELED), at(60))
    ).resolves.toEqual({ applied: true, userId, status: SubscriptionStatus.CANCELED, becameActive: false })

    await expect(
      applySubscriptionState({ stripeSubscriptionId }, live(SubscriptionStatus.ACTIVE), at(0))
    ).resolves.toEqual({ applied: false, reason: 'stale' })
    await expect(statusOf(userId)).resolves.toBe(SubscriptionStatus.CANCELED)
  })

  it('reports a move into ACTIVE from CANCELED, but not from PAST_DUE', async () => {
    const canceled = await member(SubscriptionStatus.CANCELED, at(0))
    const pastDue = await member(SubscriptionStatus.PAST_DUE, at(0))

    await expect(
      applySubscriptionState({ userId: canceled.userId }, live(SubscriptionStatus.ACTIVE), at(10))
    ).resolves.toMatchObject({ applied: true, becameActive: true })
    await expect(
      applySubscriptionState({ stripeSubscriptionId: pastDue.stripeSubscriptionId }, live(SubscriptionStatus.ACTIVE), at(10))
    ).resolves.toMatchObject({ applied: true, becameActive: false })
  })

  it('reports one transition when the same event is applied twice at once', async () => {
    const { stripeSubscriptionId } = await member(SubscriptionStatus.UNPAID, at(0))

    const outcomes = await Promise.all([
      applySubscriptionState({ stripeSubscriptionId }, live(SubscriptionStatus.ACTIVE), at(5)),
      applySubscriptionState({ stripeSubscriptionId }, live(SubscriptionStatus.ACTIVE), at(5)),
    ])

    expect(outcomes.filter((outcome) => outcome.applied && outcome.becameActive)).toHaveLength(1)
  })

  it('reports a missing row', async () => {
    await expect(
      applySubscriptionState({ stripeSubscriptionId: `sub_${RUN}-none` }, live(SubscriptionStatus.ACTIVE), at(0))
    ).resolves.toEqual({ applied: false, reason: 'missing' })
  })
})
