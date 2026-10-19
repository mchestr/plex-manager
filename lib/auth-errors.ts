/**
 * Stable digests for the auth errors `requireAdmin()` throws, and the one
 * check the error boundaries use to recognise them.
 *
 * A production build replaces a Server Component error's name and message
 * before it reaches the browser, but keeps a `digest` the error already has
 * (BP-27). Matching on the digest therefore works in development and
 * production alike; nothing compares `error.name` or `error.message`.
 *
 * @module lib/auth-errors
 */

export const AUTH_ERROR_DIGESTS = {
  unauthenticated: "PM_UNAUTHENTICATED",
  forbidden: "PM_FORBIDDEN",
} as const

export type AuthErrorKind = keyof typeof AUTH_ERROR_DIGESTS

/**
 * Which auth error `error` is, from its digest, or null for any other error.
 *
 * @example
 * ```ts
 * authErrorKind(Object.assign(new Error("hidden"), { digest: "PM_FORBIDDEN" })) // "forbidden"
 * authErrorKind(new Error("UNAUTHENTICATED")) // null
 * ```
 */
export function authErrorKind(error: Error & { digest?: string }): AuthErrorKind | null {
  if (error.digest === AUTH_ERROR_DIGESTS.unauthenticated) return "unauthenticated"
  if (error.digest === AUTH_ERROR_DIGESTS.forbidden) return "forbidden"
  return null
}
