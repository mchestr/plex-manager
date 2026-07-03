import type Stripe from "stripe"

import { SubscriptionStatus } from "@/lib/generated/prisma/client"

/**
 * Translates a Stripe subscription status into the app's `SubscriptionStatus`
 * enum.
 *
 * ## Mapping
 *
 * | Stripe status                     | App status   |
 * | --------------------------------- | ------------ |
 * | `active`, `trialing`              | `ACTIVE`     |
 * | `past_due`                        | `PAST_DUE`   |
 * | `canceled`                        | `CANCELED`   |
 * | `incomplete`, `incomplete_expired`| `INCOMPLETE` |
 * | `unpaid`                          | `UNPAID`     |
 *
 * ## Special cases
 *
 * Any unrecognized status maps to `INCOMPLETE` — the safest default, since it
 * treats an unknown state as "no access granted" rather than accidentally
 * admitting or removing a user. This never throws.
 *
 * @param stripeStatus - The `status` field from a Stripe subscription object.
 * @returns The corresponding app `SubscriptionStatus`.
 *
 * @example
 * ```ts
 * mapStripeStatus("trialing") // SubscriptionStatus.ACTIVE
 * mapStripeStatus("past_due") // SubscriptionStatus.PAST_DUE
 * mapStripeStatus("weird")    // SubscriptionStatus.INCOMPLETE (safe default)
 * ```
 */
export function mapStripeStatus(
  stripeStatus: Stripe.Subscription.Status | string
): SubscriptionStatus {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return SubscriptionStatus.ACTIVE
    case "past_due":
      return SubscriptionStatus.PAST_DUE
    case "canceled":
      return SubscriptionStatus.CANCELED
    case "incomplete":
    case "incomplete_expired":
      return SubscriptionStatus.INCOMPLETE
    case "unpaid":
      return SubscriptionStatus.UNPAID
    // "paused" (and any future/unknown status) falls through to INCOMPLETE,
    // which the access gate treats as "not covered" — a safe default.
    default:
      return SubscriptionStatus.INCOMPLETE
  }
}

/** Minimal shape needed to read a subscription's period end defensively. */
interface PeriodEndShape {
  current_period_end?: number | null
  items?: {
    data?: Array<{ current_period_end?: number | null }>
  } | null
}

/**
 * Coerces a Stripe epoch-seconds timestamp into a `Date`, or `null` if absent.
 *
 * @internal
 */
function epochSecondsToDate(value: unknown): Date | null {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000)
    : null
}

/**
 * Reads a subscription's current-period-end timestamp in a version-safe way.
 *
 * ## Why this is defensive
 *
 * The location of `current_period_end` is Stripe API-version-sensitive. Older
 * versions expose it at the top level of the subscription object; in more recent
 * versions it lives on the subscription **items** instead. This helper checks
 * both, in order, so it works regardless of the API version negotiated by the
 * installed SDK.
 *
 * ## Lookup order
 *
 * 1. Top-level `subscription.current_period_end`.
 * 2. The first subscription item's `current_period_end`
 *    (`subscription.items.data[0].current_period_end`).
 *
 * Returns `null` (never throws) when the value is absent in both locations, so
 * callers can fall back to a "renews soon" style UI rather than crashing.
 *
 * @param subscription - A Stripe subscription object (loosely typed to tolerate
 *   API-version field placement differences).
 * @returns A `Date` for the period end, or `null` when unavailable.
 *
 * @example
 * ```ts
 * // Top-level (older API versions)
 * getCurrentPeriodEnd({ current_period_end: 1704067200 })
 * // → Date("2024-01-01T00:00:00.000Z")
 *
 * // Item-level (newer API versions)
 * getCurrentPeriodEnd({ items: { data: [{ current_period_end: 1704067200 }] } })
 * // → Date("2024-01-01T00:00:00.000Z")
 *
 * // Absent
 * getCurrentPeriodEnd({}) // → null
 * ```
 */
export function getCurrentPeriodEnd(
  subscription: Stripe.Subscription | PeriodEndShape
): Date | null {
  const sub = subscription as PeriodEndShape

  const topLevel = epochSecondsToDate(sub.current_period_end)
  if (topLevel) {
    return topLevel
  }

  const itemLevel = sub.items?.data?.[0]?.current_period_end
  return epochSecondsToDate(itemLevel)
}
