/**
 * Typed builders for every dynamic admin link (ui-design-system 6.2, UI-06).
 * A link that shows one year's data always carries that year, so a 2025 row
 * never opens the 2026 view; ids are URL-encoded.
 *
 * @module lib/admin/routes
 */

import type { Route } from "next"

const seg = encodeURIComponent

export function userDetail(id: string): Route {
  return `/admin/users/${seg(id)}` as Route
}

/** One member's Rewind for `year`, in the admin preview (P7.9). */
export function userRewind(id: string, year: number): Route {
  return `/admin/users/${seg(id)}/rewind/${year}` as Route
}

/** LLM usage, filtered to a member and a year when given. */
export function llmUsage({ userId, year }: { userId?: string; year?: number } = {}): Route {
  const params = new URLSearchParams()
  if (userId) params.set("userId", userId)
  if (year !== undefined) params.set("year", String(year))
  const query = params.toString()
  return (query ? `/admin/llm-usage?${query}` : "/admin/llm-usage") as Route
}

export function llmUsageDetail(id: string): Route {
  return `/admin/llm-usage/${seg(id)}` as Route
}

export function invite(id: string): Route {
  return `/admin/invites/${seg(id)}` as Route
}

/** One stored generation of a Rewind, from its LLM usage row. */
export function rewindHistory(wrappedId: string, usageId: string): Route {
  return `/admin/wrapped/${seg(wrappedId)}/history/${seg(usageId)}` as Route
}
