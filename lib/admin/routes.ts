/**
 * Typed builders for every dynamic admin link (ui-design-system 6.2, UI-06).
 * A link that shows one year's data always carries that year, so a 2025 row
 * never opens the 2026 view; ids are URL-encoded.
 *
 * @module lib/admin/routes
 */

import type { Route } from "next"

const seg = encodeURIComponent

/** The user detail page's tabs (P10.6); `overview` is the default and leaves the URL bare. */
export const USER_DETAIL_TABS = ["overview", "rewind", "usage", "billing"] as const
export type UserDetailTab = (typeof USER_DETAIL_TABS)[number]

export function userDetail(id: string, { tab }: { tab?: UserDetailTab } = {}): Route {
  const base = `/admin/users/${seg(id)}`
  return (tab && tab !== "overview" ? `${base}?tab=${tab}` : base) as Route
}

/** One member's Rewind for `year`, in the admin preview (P7.9). */
export function userRewind(id: string, year: number): Route {
  return `/admin/users/${seg(id)}/rewind/${year}` as Route
}

/** The playground with a member as the dry run's subject (P8.8). */
export function playgroundFor(userId: string): Route {
  return `/admin/rewind/playground?subject=${seg(userId)}` as Route
}

/**
 * LLM usage, filtered to a member, a Rewind year and an inclusive day range
 * (`YYYY-MM-DD` in the server zone) when given.
 */
export function llmUsage({ userId, year, from, to }: { userId?: string; year?: number; from?: string; to?: string } = {}): Route {
  const params = new URLSearchParams()
  if (userId) params.set("userId", userId)
  if (year !== undefined) params.set("year", String(year))
  if (from) params.set("from", from)
  if (to) params.set("to", to)
  const query = params.toString()
  return (query ? `/admin/llm-usage?${query}` : "/admin/llm-usage") as Route
}

export function llmUsageDetail(id: string): Route {
  return `/admin/llm-usage/${seg(id)}` as Route
}

/** The assistant page: a new conversation, or one of the caller's own. */
export function assistant(conversationId?: string): Route {
  return (conversationId ? `/admin/assistant?conversation=${seg(conversationId)}` : "/admin/assistant") as Route
}

/** One assistant conversation's calls. */
export function llmConversation(id: string): Route {
  return `/admin/llm-usage/conversation/${seg(id)}` as Route
}

/** The Affiliates page's tabs; `applications` is the default and leaves the URL bare. */
export const AFFILIATE_TABS = ["applications", "affiliates", "tree", "history"] as const
export type AffiliateTab = (typeof AFFILIATE_TABS)[number]

export function affiliates({ tab }: { tab?: AffiliateTab } = {}): Route {
  return (tab && tab !== "applications" ? `/admin/affiliates?tab=${tab}` : "/admin/affiliates") as Route
}

export function invite(id: string): Route {
  return `/admin/invites/${seg(id)}` as Route
}

/** The link an invitee follows: the public invite page on `origin` ("https://plex.example.com"). */
export function publicInviteUrl(code: string, origin: string): string {
  return `${origin.replace(/\/+$/, "")}/invite/${seg(code)}`
}

/** One stored generation of a Rewind, from its LLM usage row. */
export function rewindHistory(wrappedId: string, usageId: string): Route {
  return `/admin/wrapped/${seg(wrappedId)}/history/${seg(usageId)}` as Route
}

/** Cost analysis for an inclusive day range (`YYYY-MM-DD` in the server zone). */
export function costAnalysis({ from, to }: { from: string; to: string }): Route {
  return `/admin/cost-analysis?${new URLSearchParams({ from, to })}` as Route
}

/** One section of the settings page, by its anchor id. */
export function settingsSection(id: string): Route {
  return `/admin/settings#${seg(id)}` as Route
}
