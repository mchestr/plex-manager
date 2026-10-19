/**
 * Shared parsing helpers for Stripe-related `Config` fields.
 */

/**
 * Parses the stored `stripeLibrarySectionIds` JSON value into a clean array of
 * Plex library section keys. Returns [] for missing/malformed values, which
 * callers treat as "share all libraries".
 */
export function parseStripeLibrarySectionIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (id): id is number => typeof id === "number" && Number.isFinite(id)
  )
}

/**
 * Parses the stored `stripePriceIds` JSON value into the configured price ids.
 * Returns [] for missing/malformed values.
 */
export function parseStripePriceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
}
