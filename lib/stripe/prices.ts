import type Stripe from "stripe"

import { prisma } from "@/lib/prisma"
import { getStripe } from "@/lib/stripe/client"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("STRIPE_PRICES")

/** How long a resolved offered-price list is cached, in milliseconds. */
const CACHE_TTL_MS = 60_000

/** Display-ready details for a single offered Stripe price. */
export interface OfferedPrice {
  priceId: string
  /** Amount in the smallest currency unit (e.g. cents), or `null` for custom pricing. */
  amount: number | null
  currency: string
  /** Billing interval, e.g. "month" | "year"; `null` for one-off prices. */
  interval: string | null
  productName: string
}

interface PriceCache {
  expiresAt: number
  prices: OfferedPrice[]
}

let cache: PriceCache | null = null

/**
 * Reads the configured Stripe price IDs from the `Config` singleton, but only
 * when the Stripe integration is enabled.
 *
 * Gating on `stripeEnabled` here is the single chokepoint that keeps the whole
 * purchase path (the `/subscribe` display AND `startCheckout`, which validates
 * against this list) inert when an admin toggles Stripe off — even if a secret
 * key and price IDs remain configured. `Config.stripePriceIds` is stored as a
 * JSON array of price-id strings; missing/malformed values yield an empty list.
 *
 * @internal
 */
async function getConfiguredPriceIds(): Promise<string[]> {
  const config = await prisma.config.findUnique({
    where: { id: "config" },
    select: { stripeEnabled: true, stripePriceIds: true },
  })

  if (!config?.stripeEnabled) {
    return []
  }

  const raw = config.stripePriceIds
  if (!Array.isArray(raw)) {
    return []
  }

  return raw.filter((id): id is string => typeof id === "string" && id.length > 0)
}

/**
 * Extracts the product display name from an expanded Stripe price.
 *
 * @internal
 */
function resolveProductName(product: Stripe.Price["product"]): string {
  if (typeof product === "string") {
    return product
  }
  if (product && !product.deleted && "name" in product && product.name) {
    return product.name
  }
  return ""
}

/**
 * Resolves the admin-configured price IDs into display-ready price details.
 *
 * ## Overview
 *
 * `Config.stripePriceIds` stores price IDs only; the `/subscribe` page needs the
 * human-facing amount, currency, interval, and product name, which are fetched
 * live from Stripe. Multiple prices may be offered — they all grant the same
 * binary access.
 *
 * ## Behavior
 *
 * - For each configured price ID, calls
 *   `stripe.prices.retrieve(id, { expand: ['product'] })` and returns
 *   `{ priceId, amount, currency, interval, productName }`.
 * - A price ID that fails to resolve (deleted/invalid) is skipped and logged —
 *   one bad ID never crashes the page or discards the valid prices.
 * - Returns an empty array when Stripe is disabled (`Config.stripeEnabled` is
 *   false), unconfigured (`getStripe()` is `null`), or no price IDs are
 *   configured — so the purchase path is inert whenever Stripe is off.
 * - Results are cached briefly ({@link CACHE_TTL_MS}) so repeated page loads do
 *   not hit Stripe on every request.
 *
 * @returns The resolvable offered prices; possibly empty, never throws.
 *
 * @example
 * ```ts
 * const prices = await getOfferedPrices()
 * // [{ priceId: "price_123", amount: 500, currency: "usd",
 * //    interval: "month", productName: "Plex Access" }]
 * ```
 */
export async function getOfferedPrices(): Promise<OfferedPrice[]> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.prices
  }

  const stripe = await getStripe()
  if (!stripe) {
    return []
  }

  const priceIds = await getConfiguredPriceIds()
  if (priceIds.length === 0) {
    return []
  }

  const resolved: OfferedPrice[] = []
  for (const priceId of priceIds) {
    try {
      const price = await stripe.prices.retrieve(priceId, {
        expand: ["product"],
      })

      resolved.push({
        priceId: price.id,
        amount: price.unit_amount ?? null,
        currency: price.currency,
        interval: price.recurring?.interval ?? null,
        productName: resolveProductName(price.product),
      })
    } catch (error) {
      logger.warn("Skipping unresolvable Stripe price", { priceId, error })
    }
  }

  cache = { expiresAt: Date.now() + CACHE_TTL_MS, prices: resolved }
  return resolved
}

/**
 * Clears the offered-prices cache. Intended for tests and for use after an admin
 * updates the configured price IDs.
 */
export function clearOfferedPricesCache(): void {
  cache = null
}
