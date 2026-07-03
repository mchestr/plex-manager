import Stripe from "stripe"

import { prisma } from "@/lib/prisma"

/**
 * Reads the configured Stripe secret key from the encrypted `Config` singleton.
 *
 * The Prisma query extension in `lib/prisma.ts` transparently decrypts
 * `stripeSecretKey` on read, so the value returned here is plaintext usable by
 * the SDK. Returns `null` when the integration has not been configured yet.
 *
 * @internal
 */
async function getStripeSecretKey(): Promise<string | null> {
  const config = await prisma.config.findUnique({
    where: { id: "config" },
    select: { stripeSecretKey: true },
  })

  const secret = config?.stripeSecretKey
  return typeof secret === "string" && secret.length > 0 ? secret : null
}

/**
 * Builds a Stripe client from the stored (encrypted) secret key.
 *
 * ## Behavior
 *
 * - Returns a configured {@link Stripe} instance when `Config.stripeSecretKey`
 *   is set.
 * - Returns `null` when Stripe is unconfigured, so callers can degrade
 *   gracefully (the `/subscribe` flow, offered-prices fetcher, and webhook all
 *   treat `null` as "feature not available").
 *
 * The `apiVersion` is intentionally **not** hard-pinned. The app targets Stripe
 * API `2026-06-24.dahlia`, but pinning a version string that does not match the
 * installed SDK's bundled types produces inaccurate TypeScript types in Node.
 * Omitting it lets the SDK use its built-in default version; revisit only if the
 * installed `stripe` major exposes `2026-06-24.dahlia` in its type union.
 *
 * The secret key is never logged or returned to callers directly — it is only
 * handed to the SDK constructor.
 *
 * @returns A configured `Stripe` client, or `null` when unconfigured.
 *
 * @example
 * ```ts
 * const stripe = await getStripe()
 * if (!stripe) return { error: "Stripe is not configured" }
 * const price = await stripe.prices.retrieve("price_123")
 * ```
 */
export async function getStripe(): Promise<Stripe | null> {
  const secretKey = await getStripeSecretKey()
  if (!secretKey) {
    return null
  }

  return new Stripe(secretKey)
}

/**
 * Base URL for the Stripe dashboard, accounting for test vs live mode.
 *
 * Stripe test-mode objects live under `dashboard.stripe.com/test/...` while live
 * objects are at `dashboard.stripe.com/...`. Livemode isn't stored anywhere, so
 * it's derived from the secret key prefix (`sk_test_`/`rk_test_` → test mode).
 * Returns `null` when Stripe is unconfigured (no link should be shown).
 *
 * @returns The dashboard base URL (no trailing slash), or `null` if unconfigured.
 */
export async function getStripeDashboardBaseUrl(): Promise<string | null> {
  const secretKey = await getStripeSecretKey()
  if (!secretKey) {
    return null
  }

  const isTestMode = secretKey.startsWith("sk_test_") || secretKey.startsWith("rk_test_")
  return isTestMode
    ? "https://dashboard.stripe.com/test"
    : "https://dashboard.stripe.com"
}
