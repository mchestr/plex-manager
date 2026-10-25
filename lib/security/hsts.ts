/**
 * The `Strict-Transport-Security` value `proxy.ts` sends (P11.20, SEC-53).
 *
 * It is built per request from the environment rather than in `next.config.js`,
 * whose `headers()` is fixed at build time, so the Docker image picks the
 * variables up at start. `includeSubDomains` and `preload` are opt-in: once a
 * browser or the preload list has them, every subdomain must serve https.
 *
 * @module lib/security/hsts
 */

/** One year, the minimum the preload list accepts. */
const DEFAULT_HSTS_MAX_AGE = 31536000

const MAX_AGE = /^\d{1,10}$/

/** Whether `HSTS_MAX_AGE` is unset or a whole number of seconds (the boot check refuses anything else). */
export function isValidHstsMaxAge(value: string | undefined): boolean {
  return value === undefined || MAX_AGE.test(value)
}

export interface HstsEnv {
  HSTS_MAX_AGE?: string
  HSTS_INCLUDE_SUBDOMAINS?: string
  HSTS_PRELOAD?: string
}

/**
 * The header value, or `null` when the site is not served over https.
 *
 * @example
 * ```ts
 * hstsHeader({}, true) // "max-age=31536000"
 * hstsHeader({ HSTS_PRELOAD: "true" }, true) // "max-age=31536000; preload"
 * hstsHeader({}, false) // null
 * ```
 */
export function hstsHeader(env: HstsEnv, https: boolean): string | null {
  if (!https) return null
  const maxAge = env.HSTS_MAX_AGE && MAX_AGE.test(env.HSTS_MAX_AGE) ? env.HSTS_MAX_AGE : String(DEFAULT_HSTS_MAX_AGE)
  return [
    `max-age=${maxAge}`,
    ...(env.HSTS_INCLUDE_SUBDOMAINS === "true" ? ["includeSubDomains"] : []),
    ...(env.HSTS_PRELOAD === "true" ? ["preload"] : []),
  ].join("; ")
}
