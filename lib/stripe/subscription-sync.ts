/**
 * Writes Stripe's live subscription state onto the app's `Subscription` row,
 * newest event first (SEC-37, BP-14).
 *
 * ## Why
 *
 * Stripe delivers events in no fixed order and resends them, and an event's
 * payload is a snapshot from when it was created. Writing that snapshot let a
 * late `customer.subscription.updated` (active) revive a CANCELED row, and a
 * dunning `invoice.payment_failed` leave a canceled member PAST_DUE. So every
 * handler re-reads the subscription from Stripe ({@link liveSubscriptionState})
 * and writes it with {@link applySubscriptionState}, which skips the write when
 * a newer event already applied.
 *
 * ## Ordering
 *
 * `Subscription.stripeEventAt` holds the `created` time of the newest event
 * applied. A write matches only rows where it is null or not newer than this
 * event, in one `updateMany`, so two workers cannot interleave a read and a
 * write. A count of 0 is a stale event: the caller skips its side effects.
 *
 * ## Transitions
 *
 * A grant is due only when the row moves into ACTIVE from UNPAID, CANCELED or
 * INCOMPLETE. The write into ACTIVE is first tried with that previous status as
 * part of its own `where`, so whether it was a transition is decided by the
 * same atomic statement that changed the row, not by an earlier read.
 *
 * @module lib/stripe/subscription-sync
 */

import type Stripe from "stripe"

import { prisma } from "@/lib/prisma"
import { SubscriptionStatus, type Prisma } from "@/lib/generated/prisma/client"
import { getCurrentPeriodEnd, mapStripeStatus } from "@/lib/stripe/events"

/** Statuses without Plex access: moving from one of these into ACTIVE warrants a grant. */
const UNGRANTED_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.UNPAID,
  SubscriptionStatus.CANCELED,
  SubscriptionStatus.INCOMPLETE,
]

/** The fields of a `Subscription` row that come from Stripe's live subscription. */
export interface LiveSubscriptionState {
  status: SubscriptionStatus
  priceId: string | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  canceledAt?: Date | null
}

/** Which row an event is about. */
export type SubscriptionMatch = { stripeSubscriptionId: string } | { userId: string }

/** What {@link applySubscriptionState} did. */
export type SubscriptionSyncOutcome =
  | { applied: false; reason: "stale" | "missing" }
  | { applied: true; userId: string; status: SubscriptionStatus; becameActive: boolean }

/** Epoch seconds from Stripe as a `Date`, or null. @internal */
function epochToDate(value: number | null | undefined): Date | null {
  return typeof value === "number" ? new Date(value * 1000) : null
}

/**
 * The row fields for a subscription as Stripe reports it now. A canceled
 * subscription carries when it ended; any other status leaves `canceledAt`
 * alone.
 */
export function liveSubscriptionState(subscription: Stripe.Subscription): LiveSubscriptionState {
  const status = mapStripeStatus(subscription.status)
  return {
    status,
    priceId: subscription.items?.data[0]?.price?.id ?? null,
    currentPeriodEnd: getCurrentPeriodEnd(subscription),
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    ...(status === SubscriptionStatus.CANCELED && {
      canceledAt: epochToDate(subscription.ended_at) ?? epochToDate(subscription.canceled_at) ?? new Date(),
    }),
  }
}

/**
 * Writes `data` to the matching row unless a newer event already applied.
 *
 * @param match - The row, by Stripe subscription id or (checkout) app user id.
 * @param data - The live state, plus any ids the event carries.
 * @param eventAt - The event's `created` time.
 * @returns `missing` when no row matches, `stale` when a newer event applied,
 *   otherwise the row's user and whether it just became ACTIVE.
 */
export async function applySubscriptionState(
  match: SubscriptionMatch,
  data: LiveSubscriptionState & Prisma.SubscriptionUpdateManyMutationInput,
  eventAt: Date
): Promise<SubscriptionSyncOutcome> {
  const notNewer: Prisma.SubscriptionWhereInput = {
    ...match,
    OR: [{ stripeEventAt: null }, { stripeEventAt: { lte: eventAt } }],
  }
  const write = { ...data, stripeEventAt: eventAt }

  let count = 0
  let becameActive = false
  if (data.status === SubscriptionStatus.ACTIVE) {
    ;({ count } = await prisma.subscription.updateMany({
      where: { ...notNewer, status: { in: [...UNGRANTED_STATUSES] } },
      data: write,
    }))
    becameActive = count > 0
  }
  if (count === 0) {
    ;({ count } = await prisma.subscription.updateMany({ where: notNewer, data: write }))
  }

  const row = await prisma.subscription.findFirst({ where: match, select: { userId: true } })
  if (!row) {
    return { applied: false, reason: "missing" }
  }
  if (count === 0) {
    return { applied: false, reason: "stale" }
  }
  return { applied: true, userId: row.userId, status: data.status, becameActive }
}
