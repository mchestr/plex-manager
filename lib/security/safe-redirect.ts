/**
 * Turns an untrusted `?redirect=` value into a path on this app.
 *
 * ## Rules
 *
 * 1. Refuse anything that is not a path starting with exactly one `/`, or that
 *    holds a backslash, a control character, or an encoded backslash, slash
 *    pair or control character (`%5c`, `%2f%2f`, `%09`, ... in any case).
 *    Browsers read `/\evil.com` and `/%5Cevil.com` as `//evil.com`.
 * 2. Resolve it against the app's base URL and require the same origin.
 * 3. Keep only `pathname + search`, dropping the hash, and only when the
 *    pathname is on {@link REDIRECT_ALLOW_LIST}.
 *
 * Anything refused becomes `fallback`.
 *
 * @example
 * ```ts
 * safeRedirectPath("/discord/link?x=1") // => "/discord/link?x=1"
 * safeRedirectPath("/%5Cevil.com") // => "/discord/link"
 * safeRedirectPath("/admin", "/") // => "/"
 * ```
 *
 * @module lib/security/safe-redirect
 */

import "server-only"

import { getBaseUrl } from "@/lib/env"

/** The pages a redirect may land on. */
const REDIRECT_ALLOW_LIST: ReadonlySet<string> = new Set(["/", "/discord/link", "/onboarding", "/account"])

const DEFAULT_FALLBACK = "/discord/link"

// eslint-disable-next-line no-control-regex -- control characters are what it refuses
const UNSAFE_CHARACTERS = /[\\\x00-\x1f\x7f]/
const UNSAFE_ENCODINGS = /%5c|%2f%2f|%[01][0-9a-f]|%7f/i

/** `input` as an allow-listed same-origin `pathname + search`, or `fallback`. */
export function safeRedirectPath(input: string | null | undefined, fallback: string = DEFAULT_FALLBACK): string {
  if (!input || !input.startsWith("/") || input.startsWith("//")) return fallback
  if (UNSAFE_CHARACTERS.test(input) || UNSAFE_ENCODINGS.test(input)) return fallback

  const base = new URL(getBaseUrl())
  let resolved: URL
  try {
    resolved = new URL(input, base)
  } catch {
    return fallback
  }
  if (resolved.origin !== base.origin) return fallback
  if (!REDIRECT_ALLOW_LIST.has(resolved.pathname)) return fallback

  return `${resolved.pathname}${resolved.search}`
}
