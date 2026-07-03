"use server"

import { z } from "zod"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getStripe } from "@/lib/stripe/client"
import { createCheckoutSession } from "@/lib/stripe/checkout"
import { getOfferedPrices } from "@/lib/stripe/prices"
import { checkRateLimit } from "@/lib/security/rate-limit"
import { getBaseUrl } from "@/lib/utils"
import { createLogger } from "@/lib/utils/logger"
import { getServerSession } from "next-auth"

const logger = createLogger("SUBSCRIPTION")

/**
 * Per-user rate limit for the Stripe-adjacent self-service actions. These are
 * authenticated Server Actions that create Stripe sessions, so they're keyed by
 * user id to prevent a logged-in user from hammering Stripe.
 */
const STRIPE_ACTION_RATE_LIMIT = { windowMs: 60 * 1000, max: 10 }

type StartCheckoutResult = { url: string } | { error: string }

type OpenBillingPortalResult = { url: string } | { error: string }

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
 * 1. Requires a session; returns `{error}` when unauthenticated.
 * 2. Validates `priceId` against {@link getOfferedPrices} so a client cannot
 *    check out against an arbitrary/un-offered price. This also returns an empty
 *    list (→ `{error}`) when Stripe is disabled/unconfigured.
 * 3. Builds the Checkout session and returns its `url`, or `{error}` when Stripe
 *    is unconfigured or the session has no URL.
 *
 * Never throws for the expected failure paths — callers get `{error}` and can
 * surface it via a toast.
 *
 * @param priceId - The Stripe price id the user chose to subscribe to.
 * @returns `{ url }` with the Checkout URL, or `{ error }`.
 */
export async function startCheckout(priceId: string): Promise<StartCheckoutResult> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { error: "You must be signed in to subscribe." }
  }

  if (!checkRateLimit(`checkout:${session.user.id}`, STRIPE_ACTION_RATE_LIMIT)) {
    return { error: "Too many attempts. Please wait a moment and try again." }
  }

  const parsed = z.string().min(1).safeParse(priceId)
  if (!parsed.success) {
    return { error: "Invalid plan selected." }
  }

  try {
    const offered = await getOfferedPrices()
    if (offered.length === 0) {
      return { error: "Subscriptions are not available right now." }
    }

    const isOffered = offered.some((price) => price.priceId === priceId)
    if (!isOffered) {
      logger.warn("Rejected checkout for non-offered price", {
        userId: session.user.id,
        priceId,
      })
      return { error: "Invalid plan selected." }
    }

    const checkoutSession = await createCheckoutSession(session.user.id, priceId)
    if (!checkoutSession?.url) {
      return { error: "Subscriptions are not available right now." }
    }

    logger.info("Started checkout session", {
      userId: session.user.id,
      priceId,
      sessionId: checkoutSession.id,
    })

    return { url: checkoutSession.url }
  } catch (error) {
    logger.error("Failed to start checkout", error, {
      userId: session.user.id,
      priceId,
    })
    return { error: "Could not start checkout. Please try again." }
  }
}

/**
 * Creates a Stripe Billing Portal session for the current user and returns the
 * URL to redirect them to so they can manage/cancel/update payment via Stripe's
 * hosted UI.
 *
 * ## Behavior
 *
 * 1. Requires a session; returns `{error}` when unauthenticated.
 * 2. Looks up the user's `Subscription.stripeCustomerId` (recorded at first
 *    successful checkout). Returns `{error}` when the user has no customer id —
 *    there is nothing to manage yet.
 * 3. Returns `{error}` when Stripe is unconfigured/disabled (`getStripe()` is
 *    `null`).
 * 4. Creates a Billing Portal session with a `return_url` back to the
 *    account/status surface and returns its `url`.
 *
 * Never throws for the expected failure paths — callers get `{error}` and can
 * surface it via a toast. Only the portal URL is ever returned; no secrets are
 * exposed.
 *
 * @returns `{ url }` with the Billing Portal URL, or `{ error }`.
 */
export async function openBillingPortal(): Promise<OpenBillingPortalResult> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { error: "You must be signed in to manage your subscription." }
  }

  if (!checkRateLimit(`portal:${session.user.id}`, STRIPE_ACTION_RATE_LIMIT)) {
    return { error: "Too many attempts. Please wait a moment and try again." }
  }

  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: session.user.id },
      select: { stripeCustomerId: true },
    })

    const customerId = subscription?.stripeCustomerId
    if (!customerId) {
      return { error: "No billing account found for your subscription." }
    }

    const stripe = await getStripe()
    if (!stripe) {
      return { error: "Subscription management is not available right now." }
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getBaseUrl()}${PORTAL_RETURN_PATH}`,
    })

    if (!portalSession?.url) {
      return { error: "Subscription management is not available right now." }
    }

    logger.info("Opened billing portal session", {
      userId: session.user.id,
      sessionId: portalSession.id,
    })

    return { url: portalSession.url }
  } catch (error) {
    logger.error("Failed to open billing portal", error, {
      userId: session.user.id,
    })
    return { error: "Could not open the billing portal. Please try again." }
  }
}
