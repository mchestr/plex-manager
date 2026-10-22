/**
 * The effects of member removal outside the database that are not a service
 * share: cancelling the Stripe subscription at once, and dropping the
 * member's queued jobs by their deduplication ids.
 *
 * @module lib/members/erase-external
 */

import "server-only"

import { isRedisConfigured } from "@/lib/queue/connection"
import { getStripe } from "@/lib/stripe/client"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("MEMBER_ERASE")

/** Subscription statuses Stripe still bills, so removal cancels them. */
export const BILLED_STATUSES = ["ACTIVE", "PAST_DUE"] as const

export type StripeCancelResult =
  | { success: true; status: "canceled" | "already_canceled" }
  | { success: false; code: "STRIPE_UNAVAILABLE" | "STRIPE_FAILED" }

function isMissingResource(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "resource_missing"
}

/**
 * Cancels a Stripe subscription now, not at period end. A subscription Stripe
 * no longer has counts as cancelled, so a rerun succeeds.
 */
export async function cancelStripeSubscription(stripeSubscriptionId: string): Promise<StripeCancelResult> {
  const stripe = await getStripe()
  if (!stripe) return { success: false, code: "STRIPE_UNAVAILABLE" }
  try {
    const subscription = await stripe.subscriptions.cancel(stripeSubscriptionId)
    return { success: true, status: subscription.status === "canceled" ? "canceled" : "already_canceled" }
  } catch (error) {
    if (isMissingResource(error)) return { success: true, status: "already_canceled" }
    logger.warn("Could not cancel the Stripe subscription", { stripeSubscriptionId, error: error instanceof Error ? error.name : "unknown" })
    return { success: false, code: "STRIPE_FAILED" }
  }
}

/** The deduplication ids of the jobs one member can have waiting in the main queue. */
function memberJobIds(userId: string): string[] {
  return [`watchlist:user:${userId}`, `discord:role:${userId}`]
}

/**
 * Removes the member's waiting jobs. Best effort: a job that still runs finds
 * no member and skips, so a Redis failure is logged and counted as zero.
 */
export async function removeMemberJobs(userId: string): Promise<number> {
  if (!isRedisConfigured()) return 0
  try {
    const { removeDeduplicatedJob } = await import("@/lib/queue/client")
    const removed = await Promise.all(memberJobIds(userId).map((id) => removeDeduplicatedJob(id)))
    return removed.filter(Boolean).length
  } catch (error) {
    logger.warn("Could not remove the member's queued jobs", { userId, error: error instanceof Error ? error.name : "unknown" })
    return 0
  }
}
