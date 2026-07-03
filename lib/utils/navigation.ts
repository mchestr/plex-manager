/**
 * Perform a full-page browser navigation to an external URL (e.g. a Stripe
 * Checkout or Billing Portal session).
 *
 * This is a thin wrapper around `window.location.assign` extracted into its own
 * module so callers have a single, mockable seam for redirects. jsdom locks
 * `window.location` (its `assign` is read-only and the object is
 * non-configurable), so tests mock this module rather than the global.
 *
 * @param url - The absolute URL to navigate the browser to.
 */
export function redirectTo(url: string): void {
  window.location.assign(url)
}
