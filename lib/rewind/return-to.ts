/**
 * Where Rewind's Close control goes: the `?from=` path a link into Rewind
 * passed, when it is a same-site path, else home. Client-safe.
 *
 * @module
 */

import type { Route } from "next"

/** A path on this site: one leading slash, no second one, no backslash. */
const SAME_SITE_PATH = /^\/(?!\/)[^\\]*$/

/**
 * Returns `raw` when it is a relative path on this site, otherwise `/`, so a
 * crafted `?from=` can never send a member to another origin.
 *
 * @example
 * ```ts
 * safeReturnPath("/account")        // "/account"
 * safeReturnPath("//evil.example")  // "/"
 * safeReturnPath("https://x")       // "/"
 * safeReturnPath(undefined)         // "/"
 * ```
 */
export function safeReturnPath(raw: string | null | undefined): Route {
  // Checked above: a same-site path, which is what a typed route stands for here
  return (typeof raw === "string" && SAME_SITE_PATH.test(raw) ? raw : "/") as Route
}
