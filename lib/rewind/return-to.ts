/**
 * Where Rewind's Close control goes: the `?from=` path a link into Rewind
 * passed, when it is a same-site path, else home. Client-safe.
 *
 * @module
 */

import type { Route } from "next"

/**
 * A path on this site: one leading slash, no second one, no backslash and no
 * control character (URL parsing strips tab, CR and LF, so `/\t/x` would
 * become `//x`).
 */
// eslint-disable-next-line no-control-regex -- the control characters are what it rejects
const SAME_SITE_PATH = /^\/(?![/\\])[^\\\u0000-\u001f\u007f]*$/

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
