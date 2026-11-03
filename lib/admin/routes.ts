/**
 * Typed builders for every dynamic admin link (ui-design-system 6.2, UI-06).
 * A link that shows one year's data always carries that year, so a 2025 row
 * never opens the 2026 view; ids are URL-encoded.
 *
 * @module lib/admin/routes
 */

import type { Route } from "next"

import type { FindingSeverity, FindingStatus, FindingType } from "@/lib/generated/prisma/client"

const seg = encodeURIComponent

/** The user detail page's tabs (P10.6); `overview` is the default and leaves the URL bare. */
export const USER_DETAIL_TABS = ["overview", "rewind", "usage", "billing", "audit"] as const
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

/** The AI activity page's URL state: the Calls filters, the Findings tab and its filters, and the shared range. */
export interface AiActivityFilters {
  userId?: string
  year?: number
  /** A Calls purpose (`LLM_PURPOSES`), such as `judge`. */
  purpose?: string
  /** The Findings tab; Calls leaves the URL bare. */
  view?: "findings"
  type?: FindingType
  severity?: FindingSeverity
  /** A finding's tool; "" means findings that name no tool. */
  tool?: string
  status?: FindingStatus
  /** An inclusive day range (`YYYY-MM-DD` in the server zone). */
  from?: string
  to?: string
}

/** `?group=` for the Findings tab's grouped view (Group by type and tool); the list leaves it out. */
export const FINDINGS_GROUPED = "type-tool"

/** AI activity, filtered when given; each filter is left out when empty, except a tool of "" (no tool). */
export function aiActivity({ userId, year, purpose, view, type, severity, tool, status, from, to }: AiActivityFilters = {}): Route {
  const params = new URLSearchParams()
  if (userId) params.set("userId", userId)
  if (year !== undefined) params.set("year", String(year))
  if (purpose) params.set("purpose", purpose)
  if (view) params.set("view", view)
  if (type) params.set("type", type)
  if (severity) params.set("severity", severity)
  if (tool !== undefined) params.set("tool", tool)
  if (status) params.set("status", status)
  if (from) params.set("from", from)
  if (to) params.set("to", to)
  const query = params.toString()
  return (query ? `/admin/ai?${query}` : "/admin/ai") as Route
}

export function aiActivityRecord(id: string): Route {
  return `/admin/ai/${seg(id)}` as Route
}

/** The assistant page: a new conversation, or one of the caller's own. */
export function assistant(conversationId?: string): Route {
  return (conversationId ? `/admin/assistant?conversation=${seg(conversationId)}` : "/admin/assistant") as Route
}

/** One assistant conversation's calls. */
export function aiActivityConversation(id: string): Route {
  return `/admin/ai/conversation/${seg(id)}` as Route
}

/** The Affiliates page's tabs; `applications` is the default and leaves the URL bare. */
export const AFFILIATE_TABS = ["applications", "affiliates", "tree", "history", "settings"] as const
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

/** The audit log's URL filters; each is left out when empty. */
export interface AuditLogFilters {
  /** An event category (lib/audit/events.ts). */
  category?: string
  /** One event type, such as `MEMBER_UNSHARED`. */
  type?: string
  /** Who did it: a user id, or `system` for a job. */
  actor?: string
  /** Whom it was about: a user id. */
  member?: string
  /** One inactivity run's events, by the run id. */
  run?: string
  /** An inclusive day range (`YYYY-MM-DD` in the server zone). */
  from?: string
  to?: string
}

/** The audit log, filtered when given. */
export function auditLog(filters: AuditLogFilters = {}): Route {
  const params = new URLSearchParams()
  for (const key of ["category", "type", "actor", "member", "run", "from", "to"] as const) {
    const value = filters[key]
    if (value) params.set(key, value)
  }
  const query = params.toString()
  return (query ? `/admin/audit?${query}` : "/admin/audit") as Route
}

/** One audit event with its stored details. */
export function auditEvent(id: string): Route {
  return `/admin/audit/${seg(id)}` as Route
}

/** The settings sections that moved to their feature's own page, by section id (one per line, in alphabetical order). */
const SETTINGS_HOMES: Partial<Record<string, Route>> = {
  "request-tiers": "/admin/request-limits",
}

/** The page a settings section lives on: its feature's page, else its anchor on the settings page. */
export function settingsSection(id: string): Route {
  return SETTINGS_HOMES[id] ?? (`/admin/settings#${seg(id)}` as Route)
}
