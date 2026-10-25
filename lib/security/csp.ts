/**
 * The strict Content Security Policy `proxy.ts` sends with every response (P11.20, SEC-53).
 *
 * ## Nonce, not SRI
 *
 * Every page renders per request (the root layout awaits `connection()`,
 * P11.19), so a per-request nonce costs nothing, and it also covers the inline
 * RSC payload scripts Next writes into each page. `experimental.sri` hashes
 * only Next's own script files, so it would still need `'unsafe-inline'`.
 *
 * ## How Next uses it
 *
 * The proxy puts the policy on the forwarded request as well as the response.
 * Next reads the nonce from the request's `script-src` and adds it to its own
 * scripts; `'strict-dynamic'` then trusts the chunks those scripts load. Code
 * that renders its own `<script>` reads the nonce from {@link NONCE_HEADER}.
 *
 * ## Directives
 *
 * - `style-src 'unsafe-inline'` stays: Motion and Recharts write inline styles.
 * - `img-src` adds Plex avatars (`User.image` is `plexUser.thumb`) and Discord avatars.
 * - `form-action` lists Stripe, because a Server Action can redirect to
 *   Checkout or the billing portal after a form post without JavaScript.
 * - `upgrade-insecure-requests` is sent only for an https `NEXTAUTH_URL`; on a
 *   LAN install over plain http it would rewrite every request to https.
 * - Development adds `'unsafe-eval'` and `ws:` for React Refresh and hot reload.
 *
 * @module lib/security/csp
 */

/** The request header that carries the nonce to the page (Next's documented name). */
export const NONCE_HEADER = "x-nonce"

/** Where browsers send violation reports (`app/api/csp-report/route.ts`). */
const CSP_REPORT_PATH = "/api/csp-report"

/** The `Reporting-Endpoints` value naming {@link CSP_REPORT_PATH} as `csp`. */
export const REPORTING_ENDPOINTS = `csp="${CSP_REPORT_PATH}"`

const IMAGE_HOSTS = ["https://plex.tv", "https://*.plex.tv", "https://cdn.discordapp.com"]
const FORM_TARGETS = ["https://checkout.stripe.com", "https://billing.stripe.com"]

export interface CspOptions {
  /** `next dev`: allows eval and the hot-reload socket. */
  development: boolean
  /** The site is served over https, so subresources may be upgraded. */
  https: boolean
}

/** A fresh nonce for one request: a base64 UUID, as in the Next docs. */
export function createNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64")
}

/**
 * The policy for one response.
 *
 * @example
 * ```ts
 * contentSecurityPolicy("abc", { development: false, https: true })
 * // "default-src 'self'; script-src 'self' 'nonce-abc' 'strict-dynamic'; ..."
 * ```
 */
export function contentSecurityPolicy(nonce: string, { development, https }: CspOptions): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${IMAGE_HOSTS.join(" ")}`,
    "font-src 'self'",
    `connect-src 'self'${development ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self' ${FORM_TARGETS.join(" ")}`,
    "frame-ancestors 'self'",
    ...(https ? ["upgrade-insecure-requests"] : []),
    "report-to csp",
    `report-uri ${CSP_REPORT_PATH}`,
  ]
  return directives.join("; ")
}

/** The header the policy goes out under: report-only while `CSP_REPORT_ONLY` is "true". */
export function cspHeaderName(reportOnly: boolean): "Content-Security-Policy" | "Content-Security-Policy-Report-Only" {
  return reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy"
}
