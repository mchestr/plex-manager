/**
 * Which pages a member below `full` access may open (SEC-28, FR-51).
 *
 * Route groups leave no trace in a URL, so `(app)` paths are found by
 * exclusion: every page path except the top-level folders outside `(app)` and
 * the public share pages. A new member page is therefore covered without being
 * listed; `__tests__/proxy.test.ts` checks every route folder against this.
 *
 * ```
 * level    (app) path         /rewind, /rewind/*    other paths
 * full     open               open                  open
 * lapsed   -> /subscribe      open                  open
 * none     -> /subscribe      -> /subscribe         open
 * ```
 *
 * A plain module (no `server-only`), so `proxy.ts` and the `(app)` layout share it.
 *
 * @module lib/access-paths
 */

import type { AccessLevel } from "@/lib/access"

/** The first path segments of the folders outside `(app)`. */
const NON_APP_SEGMENTS = new Set(["admin", "api", "auth", "dev", "invite", "onboarding", "setup", "subscribe"])

/** `app/rewind/s/`, outside `(app)`: anyone may open a share link. */
const PUBLIC_PATH = /^\/rewind\/s(\/|$)/

/**
 * The read-only Rewind pages a lapsed member keeps (FR-51). `/wrapped*`
 * redirects here before the proxy runs.
 */
const LAPSED_OPEN_PATH = /^\/rewind(\/|$)/

/** A file such as `/robots.txt`: never a page. */
const FILE_PATH = /\/[^/]*\.[A-Za-z0-9]+$/

/** Whether `pathname` is a page of the `(app)` group. */
export function isMemberAppPath(pathname: string): boolean {
  if (pathname.startsWith("/_") || FILE_PATH.test(pathname) || PUBLIC_PATH.test(pathname)) {
    return false
  }
  const [first = ""] = pathname.slice(1).split("/")
  return !NON_APP_SEGMENTS.has(first)
}

/** Whether a member at `level` must be sent to `/subscribe` from `pathname`. */
export function needsSubscribeRedirect(pathname: string, level: AccessLevel): boolean {
  if (level === "full" || !isMemberAppPath(pathname)) {
    return false
  }
  return level === "none" || !LAPSED_OPEN_PATH.test(pathname)
}
