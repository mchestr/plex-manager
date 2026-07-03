import type Stripe from "stripe"

import { prisma } from "@/lib/prisma"
import { getStripe } from "@/lib/stripe/client"
import { getBaseUrl } from "@/lib/utils"

/**
 * Path a completed Checkout redirects back to. Stripe appends the session id via
 * the `{CHECKOUT_SESSION_ID}` template so the success page can look up status.
 */
const SUCCESS_PATH = "/subscribe/success"

/** Path a canceled/abandoned Checkout redirects back to. */
const CANCEL_PATH = "/subscribe"

/**
 * Creates a Stripe Checkout Session in subscription mode for the given user and
 * price.
 *
 * ## Identity binding
 *
 * The app user is bound to the session and the resulting subscription in two
 * ways so webhooks can always map an event back to the app user **without ever
 * matching by email**:
 * - `client_reference_id = userId` on the Checkout Session, and
 * - `subscription_data.metadata.appUserId = userId`, which Stripe propagates onto
 *   the created Subscription object.
 *
 * ## Behavior
 *
 * - `mode: 'subscription'` with a single line item for `priceId`.
 * - `allow_promotion_codes: true` so users can redeem promo codes (R6).
 * - `success_url` returns to {@link SUCCESS_PATH} with the session id appended;
 *   `cancel_url` returns to {@link CANCEL_PATH}.
 * - `customer_email` is prefilled from the user's stored Plex email when
 *   available, so the user does not re-enter it.
 * - Returns `null` when Stripe is unconfigured/disabled (`getStripe()` is
 *   `null`), so callers can degrade gracefully.
 *
 * The caller is responsible for auth and for validating that `priceId` is one of
 * the admin-configured offered prices — this builder trusts its inputs.
 *
 * @param userId - The database user id (from the session).
 * @param priceId - A Stripe price id to subscribe to.
 * @returns The created Checkout Session, or `null` when Stripe is unconfigured.
 *
 * @example
 * ```ts
 * const session = await createCheckoutSession("user_123", "price_123")
 * if (!session) return { error: "Stripe is not configured" }
 * redirect(session.url!)
 * ```
 */
export async function createCheckoutSession(
  userId: string,
  priceId: string
): Promise<Stripe.Checkout.Session | null> {
  const stripe = await getStripe()
  if (!stripe) {
    return null
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })

  const baseUrl = getBaseUrl()

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: userId,
    subscription_data: {
      metadata: { appUserId: userId },
    },
    allow_promotion_codes: true,
    success_url: `${baseUrl}${SUCCESS_PATH}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}${CANCEL_PATH}`,
  }

  // Prefill the email only when we actually have one — an empty/absent value
  // would make Stripe reject the parameter.
  if (user?.email) {
    params.customer_email = user.email
  }

  return stripe.checkout.sessions.create(params)
}
