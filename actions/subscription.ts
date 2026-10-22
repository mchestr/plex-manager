"use server"

import { z } from "zod"

import { memberAction } from "@/lib/actions/define-action"
import { fail, ok, type ActionErrorCode, type ActionResult } from "@/lib/actions/result"
import type { SubscriptionStatus } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { getStripe } from "@/lib/stripe/client"
import { createCheckoutSession } from "@/lib/stripe/checkout"
import { parseStripeLibrarySectionIds } from "@/lib/stripe/config"
import { getOfferedPrices } from "@/lib/stripe/prices"
import { getBaseUrl } from "@/lib/env"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("SUBSCRIPTION")

/** `startCheckout` refuses a member whose subscription is ACTIVE or PAST_DUE (SEC-39). */
type CheckoutCode = ActionErrorCode | "ALREADY_SUBSCRIBED"

/**
 * Path the Billing Portal returns the user to after they finish managing their
 * subscription. Points at the account/status surface where the "Manage
 * subscription" button lives.
 */
const PORTAL_RETURN_PATH = "/"

/**
 * Starts a Stripe Checkout session for the current user and returns the URL to
 * redirect them to.
 *
 * ## Auth vs. gate
 *
 * This action requires an authenticated session but is deliberately **not**
 * behind the subscription access gate: it is the escape hatch a gated user on
 * `/subscribe` uses to actually subscribe, so gating it would be a chicken/egg
 * problem.
 *
 * ## Behavior
 *
 * 1. Requires a session (`UNAUTHENTICATED`) and spends a `checkout` point.
 * 2. Returns `ALREADY_SUBSCRIBED` when the member's subscription is ACTIVE or
 *    PAST_DUE, so nobody is billed twice (SEC-39).
 * 3. Validates `priceId` against {@link getOfferedPrices} so a client cannot
 *    check out against an arbitrary/un-offered price. This also returns an empty
 *    list (→ `{error}`) when Stripe is disabled/unconfigured.
 * 4. Returns `{error}` when the user has no stored email: the Plex access grant
 *    invites by email, so the payment could never grant access.
 * 5. Builds the Checkout session, as the member's existing Stripe customer when
 *    they have one, and returns its `url`, or `{error}` when Stripe
 *    is unconfigured or the session has no URL.
 *
 * Never throws — callers get a failure with a code and can surface its
 * `error` via a toast.
 *
 * @param input - `{ priceId }`, the Stripe price id the user chose.
 * @returns `{ url }` with the Checkout URL as `data`, or a failure.
 */
export const startCheckout = memberAction({
  input: z.object({ priceId: z.string().min(1, "Invalid plan selected.").max(255) }),
  // Keyed by user id so a signed-in user cannot hammer Stripe.
  rateLimit: { name: "checkout" },
  fallbackError: "Could not start checkout. Please try again.",
  handler: async ({ priceId }, { userId }): Promise<ActionResult<{ url: string }, CheckoutCode>> => {
    // A second checkout would start a second, separately billed subscription.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, subscription: { select: { status: true } } },
    })
    const status = user?.subscription?.status
    if (status === "ACTIVE" || status === "PAST_DUE") {
      return {
        success: false,
        code: "ALREADY_SUBSCRIBED",
        error: "You already have a subscription. Manage it from your account instead.",
      }
    }

    const offered = await getOfferedPrices()
    if (offered.length === 0) {
      return fail("UPSTREAM_UNAVAILABLE", "Subscriptions are not available right now.")
    }

    const isOffered = offered.some((price) => price.priceId === priceId)
    if (!isOffered) {
      logger.warn("Rejected checkout for non-offered price", {
        userId,
        priceId,
      })
      return fail("VALIDATION", "Invalid plan selected.")
    }

    // The Plex access grant invites by email, so a member without one would pay
    // and never get access. A Plex sign-in whose email another account already
    // holds stores none (lib/auth.ts, auth.email_conflict).
    if (!user?.email) {
      logger.warn("Rejected checkout for a user with no email", { userId })
      return fail(
        "CONFLICT",
        "Your account has no email address, which Plex access needs. Sign out and sign in with Plex again; if this message stays, ask the server admin."
      )
    }

    const checkoutSession = await createCheckoutSession(userId, priceId)
    if (!checkoutSession?.url) {
      return fail("UPSTREAM_UNAVAILABLE", "Subscriptions are not available right now.")
    }

    logger.info("Started checkout session", {
      userId,
      priceId,
      sessionId: checkoutSession.id,
    })

    return ok({ url: checkoutSession.url })
  },
})

/**
 * Creates a Stripe Billing Portal session for the current user and returns the
 * URL to redirect them to so they can manage/cancel/update payment via Stripe's
 * hosted UI.
 *
 * ## Behavior
 *
 * 1. Requires a session (`UNAUTHENTICATED`) and spends a `portal` point.
 * 2. Looks up the user's `Subscription.stripeCustomerId` (recorded at first
 *    successful checkout). Returns `{error}` when the user has no customer id —
 *    there is nothing to manage yet.
 * 3. Returns `{error}` when Stripe is unconfigured/disabled (`getStripe()` is
 *    `null`).
 * 4. Creates a Billing Portal session with a `return_url` back to the
 *    account/status surface and returns its `url`.
 *
 * Never throws — callers get a failure with a code and can surface its
 * `error` via a toast. Only the portal URL is ever returned; no secrets are
 * exposed.
 *
 * @returns `{ url }` with the Billing Portal URL as `data`, or a failure.
 */
export const openBillingPortal = memberAction({
  rateLimit: { name: "portal" },
  fallbackError: "Could not open the billing portal. Please try again.",
  handler: async (_input, { userId }) => {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      select: { stripeCustomerId: true },
    })

    const customerId = subscription?.stripeCustomerId
    if (!customerId) {
      return fail("NOT_FOUND", "No billing account found for your subscription.")
    }

    const stripe = await getStripe()
    if (!stripe) {
      return fail("UPSTREAM_UNAVAILABLE", "Subscription management is not available right now.")
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getBaseUrl()}${PORTAL_RETURN_PATH}`,
    })

    if (!portalSession?.url) {
      return fail("UPSTREAM_UNAVAILABLE", "Subscription management is not available right now.")
    }

    logger.info("Opened billing portal session", {
      userId,
      sessionId: portalSession.id,
    })

    return ok({ url: portalSession.url })
  },
})

/** Where a member's new subscription is: status fields only, never ids or secrets. */
export interface SubscriptionProvisioning {
  /** Null until the webhook has written the member's subscription row. */
  status: SubscriptionStatus | null
  /** `accepted`, `pending` (accept the invite by email), or null while the grant runs. */
  plexInviteStatus: string | null
  /** How many libraries subscribers get; null means every library. */
  libraryCount: number | null
  memberSince: Date | null
  currentPeriodEnd: Date | null
}

/**
 * The success page's live checklist (UI-40): the caller's own subscription
 * status, Plex invite status and period, and how many libraries subscribers
 * get. Requires a session; reads only the caller's row.
 */
export const getSubscriptionProvisioning = memberAction({
  fallbackError: "Could not check your subscription.",
  handler: async (_input, { userId }): Promise<ActionResult<SubscriptionProvisioning>> => {
    const [subscription, config] = await Promise.all([
      prisma.subscription.findUnique({
        where: { userId },
        select: { status: true, plexInviteStatus: true, createdAt: true, currentPeriodEnd: true },
      }),
      prisma.config.findUnique({ where: { id: "config" }, select: { stripeLibrarySectionIds: true } }),
    ])
    const libraries = parseStripeLibrarySectionIds(config?.stripeLibrarySectionIds)

    return ok({
      status: subscription?.status ?? null,
      plexInviteStatus: subscription?.plexInviteStatus ?? null,
      libraryCount: libraries.length > 0 ? libraries.length : null,
      memberSince: subscription?.createdAt ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    })
  },
})
