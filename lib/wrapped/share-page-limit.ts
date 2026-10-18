/**
 * How the public share page learns that its visitor is over `rw:share-page`.
 *
 * proxy.ts spends the visitor's point before its share-token status lookup, so
 * a flood of share URLs cannot reach the database at full rate. Over the limit
 * it skips the lookup and sets {@link SHARE_BUSY_HEADER} on the request; it
 * also drops any value the client sent. The page and its metadata then render
 * the busy state without a lookup of their own.
 *
 * @module
 */

import { headers } from "next/headers"

/** Request header proxy.ts sets to `"1"` for a visitor over `rw:share-page`. */
export const SHARE_BUSY_HEADER = "x-rewind-share-busy"

/** Whether proxy.ts marked this share-page request as over the limit. */
export async function isShareBusy(): Promise<boolean> {
  return (await headers()).get(SHARE_BUSY_HEADER) === "1"
}
