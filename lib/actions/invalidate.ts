/**
 * Cache and view refreshes that work in a Server Action and in an MCP tool call.
 *
 * `updateTag()` and `refresh()` (`next/cache`) throw outside a Server Action,
 * and `/api/mcp` runs the same actions from a route handler. These helpers use
 * them in a Server Action and, in an MCP call (`lib/mcp/principal.ts`), expire
 * the tag with `revalidateTag(tag, { expire: 0 })` and skip the refresh, since
 * no browser is waiting for one.
 *
 * Actions import these instead of `updateTag` and `refresh` (ESLint).
 *
 * @module lib/actions/invalidate
 */

import "server-only"

import { refresh, revalidateTag, updateTag } from "next/cache"

import { principalSession } from "@/lib/mcp/principal"

/** Expires `tag` now: read-your-own-writes in a Server Action, an immediate expiry in an MCP call. */
export function expireTag(tag: string): void {
  if (principalSession()) revalidateTag(tag, { expire: 0 })
  else updateTag(tag)
}

/** Refreshes the caller's page after a Server Action; nothing in an MCP call. */
export function refreshView(): void {
  if (!principalSession()) refresh()
}
