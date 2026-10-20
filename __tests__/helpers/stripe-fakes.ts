/**
 * Stateful fakes for the Stripe webhook tests (P4.10).
 *
 * - {@link createFakeStripe}: events and subscriptions held in maps, so
 *   `events.retrieve` returns an event's snapshot and `subscriptions.retrieve`
 *   returns the subscription's live state, as the real API does. `webhooks` is
 *   the real SDK's, so a test can sign a fixture event with
 *   `generateTestHeaderString` and the route verifies it. Nothing reaches the
 *   network.
 * - {@link installStripeStore}: in-memory `Subscription` and `StripeEvent`
 *   rows behind `prismaMock`, implementing only the query shapes the webhook
 *   processor and route use (match by `stripeSubscriptionId` or `userId`, the
 *   `stripeEventAt` ordering filter and a `status: { in }` filter).
 */
import Stripe from 'stripe'
import type { DeepMockProxy } from 'jest-mock-extended'

import type { PrismaClient, StripeEvent, Subscription } from '@/lib/generated/prisma/client'
import { SubscriptionStatus } from '@/lib/generated/prisma/client'

/**
 * The real SDK's webhook helpers, from a client that never makes a request.
 * Built on first use: constructing a client needs `fetch`, which only the
 * node test environment provides.
 */
let webhooks: Stripe['webhooks'] | null = null
function realWebhooks(): Stripe['webhooks'] {
  webhooks ??= new Stripe('sk_test_offline_fixture').webhooks
  return webhooks
}

export const TEST_WEBHOOK_SECRET = 'whsec_test_fixture'

/** Signs `payload` the way Stripe does, for the `stripe-signature` header. */
export function signFixture(payload: string): string {
  return realWebhooks().generateTestHeaderString({ payload, secret: TEST_WEBHOOK_SECRET })
}

export interface FakeStripe {
  /** The object handed to code under test in place of `getStripe()`'s client. */
  client: Stripe
  events: Map<string, Stripe.Event>
  subscriptions: Map<string, Stripe.Subscription>
  /** Make `subscriptions.retrieve` reject with `error` until called again with null. */
  failSubscriptionReads(error: Error | null): void
}

export function createFakeStripe(): FakeStripe {
  const events = new Map<string, Stripe.Event>()
  const subscriptions = new Map<string, Stripe.Subscription>()
  let readError: Error | null = null

  const client = {
    get webhooks() {
      return realWebhooks()
    },
    events: {
      retrieve: jest.fn(async (id: string) => {
        const event = events.get(id)
        if (!event) throw new Error(`No such event: ${id}`)
        return event
      }),
    },
    subscriptions: {
      retrieve: jest.fn(async (id: string) => {
        if (readError) throw readError
        const subscription = subscriptions.get(id)
        if (!subscription) throw new Error(`No such subscription: ${id}`)
        return subscription
      }),
    },
  }

  return {
    client: client as unknown as Stripe,
    events,
    subscriptions,
    failSubscriptionReads: (error) => {
      readError = error
    },
  }
}

/** A Stripe subscription with the fields the app reads. */
export function stripeSubscription(
  overrides: {
    id?: string
    status?: Stripe.Subscription.Status
    priceId?: string
    appUserId?: string
    cancelAtPeriodEnd?: boolean
    periodEnd?: number
    canceledAt?: number | null
  } = {}
): Stripe.Subscription {
  return {
    id: overrides.id ?? 'sub_1',
    object: 'subscription',
    status: overrides.status ?? 'active',
    cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
    canceled_at: overrides.canceledAt ?? null,
    ended_at: null,
    metadata: { appUserId: overrides.appUserId ?? 'user-1' },
    items: {
      object: 'list',
      data: [{ price: { id: overrides.priceId ?? 'price_1' }, current_period_end: overrides.periodEnd ?? 1704067200 }],
    },
  } as unknown as Stripe.Subscription
}

/** A Stripe event; `created` is epoch seconds, which orders the events. */
export function stripeEvent(id: string, type: string, object: object, created: number): Stripe.Event {
  return { id, object: 'event', type, created, data: { object } } as unknown as Stripe.Event
}

/** A paid subscription Checkout session for `userId`. */
export function checkoutSession(
  overrides: Partial<Pick<Stripe.Checkout.Session, 'mode' | 'payment_status' | 'client_reference_id' | 'subscription' | 'customer'>> = {}
): object {
  return {
    id: 'cs_1',
    object: 'checkout.session',
    mode: 'subscription',
    payment_status: 'paid',
    client_reference_id: 'user-1',
    customer: 'cus_1',
    subscription: 'sub_1',
    ...overrides,
  }
}

type SubscriptionRow = Pick<
  Subscription,
  | 'userId'
  | 'status'
  | 'stripeSubscriptionId'
  | 'stripeCustomerId'
  | 'priceId'
  | 'currentPeriodEnd'
  | 'cancelAtPeriodEnd'
  | 'canceledAt'
  | 'stripeEventAt'
  | 'plexInviteStatus'
>

export interface StripeStore {
  subscriptions: SubscriptionRow[]
  events: Map<string, Pick<StripeEvent, 'id' | 'type' | 'attempts' | 'lastError' | 'processedAt'>>
}

/** A subscription row with defaults for the fields a test does not care about. */
export function subscriptionRow(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    userId: 'user-1',
    status: SubscriptionStatus.ACTIVE,
    stripeSubscriptionId: 'sub_1',
    stripeCustomerId: 'cus_1',
    priceId: 'price_1',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    stripeEventAt: null,
    plexInviteStatus: null,
    ...overrides,
  }
}

interface WhereShape {
  userId?: string
  stripeSubscriptionId?: string
  status?: { in: SubscriptionStatus[] }
  OR?: Array<{ stripeEventAt: null | { lte: Date } }>
}

function matches(row: SubscriptionRow, where: WhereShape): boolean {
  if (where.userId !== undefined && row.userId !== where.userId) return false
  if (where.stripeSubscriptionId !== undefined && row.stripeSubscriptionId !== where.stripeSubscriptionId) return false
  if (where.status && !where.status.in.includes(row.status)) return false
  if (where.OR) {
    const notNewer = where.OR.some((clause) =>
      clause.stripeEventAt === null
        ? row.stripeEventAt === null
        : row.stripeEventAt !== null && row.stripeEventAt <= clause.stripeEventAt.lte
    )
    if (!notNewer) return false
  }
  return true
}

/**
 * Backs `prismaMock.subscription` and `prismaMock.stripeEvent` with `store`.
 * Call after `mockReset(prismaMock)`.
 */
export function installStripeStore(prismaMock: DeepMockProxy<PrismaClient>, store: StripeStore): void {
  const sub = prismaMock.subscription as unknown as Record<string, jest.Mock>
  sub.updateMany.mockImplementation(async ({ where, data }: { where: WhereShape; data: Partial<SubscriptionRow> }) => {
    const rows = store.subscriptions.filter((row) => matches(row, where))
    rows.forEach((row) => Object.assign(row, data))
    return { count: rows.length }
  })
  sub.findFirst.mockImplementation(async ({ where }: { where: WhereShape }) =>
    store.subscriptions.find((row) => matches(row, where)) ?? null
  )
  sub.create.mockImplementation(async ({ data }: { data: Partial<SubscriptionRow> & { userId: string } }) => {
    if (store.subscriptions.some((row) => row.userId === data.userId)) {
      throw new Error('Unique constraint failed on userId')
    }
    const row = subscriptionRow({ ...data })
    store.subscriptions.push(row)
    return row
  })

  const ev = prismaMock.stripeEvent as unknown as Record<string, jest.Mock>
  ev.upsert.mockImplementation(async ({ where, create }: { where: { id: string }; create: { id: string; type: string } }) => {
    const existing = store.events.get(where.id)
    if (existing) {
      existing.attempts += 1
      return existing
    }
    const row = { id: create.id, type: create.type, attempts: 1, lastError: null, processedAt: null }
    store.events.set(create.id, row)
    return row
  })
  ev.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: object }) => {
    const row = store.events.get(where.id)
    if (!row) throw new Error('Record to update not found')
    return Object.assign(row, data)
  })
  ev.updateMany.mockImplementation(async ({ where, data }: { where: { id: string }; data: object }) => {
    const row = store.events.get(where.id)
    if (row) Object.assign(row, data)
    return { count: row ? 1 : 0 }
  })
  ev.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => store.events.get(where.id) ?? null)
}

/** An empty store. */
export function emptyStripeStore(subscriptions: SubscriptionRow[] = []): StripeStore {
  return { subscriptions, events: new Map() }
}
