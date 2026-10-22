/**
 * The admin users list's filters, sorts and stat figures (P10.18), as pure
 * functions the page runs on the server after one read of every member.
 *
 * ## Filters
 *
 * `?q=` searches name and email, ignoring case. `?role=`, `?plexAccess=` and
 * `?subscription=` each default to `all` (UI-05), so a fresh page lists
 * everyone, even when Plex is down and every access is `unknown`. Anything
 * unrecognised in the URL falls back to `all`.
 *
 * | Param          | Values                                           |
 * |----------------|--------------------------------------------------|
 * | `role`         | `all`, `admin` (owner included), `member`        |
 * | `plexAccess`   | `all`, `shared`, `notShared`, `unknown`          |
 * | `subscription` | `all`, `active`, `pastDue`, `canceled`, `none`   |
 *
 * `pastDue` covers `PAST_DUE` and `UNPAID`; `none` is no row or `INCOMPLETE`.
 *
 * ## Sorts
 *
 * `name`, `joined` (the default, newest first) and `cost` (LLM spend across
 * every year), each with the user id as the tie-break so a page never
 * reshuffles.
 *
 * @module lib/admin/users-filter
 */

import { z } from "zod"

import type { TableSort } from "@/lib/ui/table-params"
import type { AdminUserWithWrappedStats, PlexAccessCheck } from "@/types/admin"

export type PlexAccess = "shared" | "notShared" | "unknown"

export const USERS_SORTS = ["name", "joined", "cost"] as const
export const USERS_DEFAULT_SORT: TableSort = { id: "joined", desc: true }

const ROLES = ["all", "admin", "member"] as const
const PLEX_ACCESS = ["all", "shared", "notShared", "unknown"] as const
const SUBSCRIPTIONS = ["all", "active", "pastDue", "canceled", "none"] as const

const usersFilterSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  role: z.enum(ROLES).catch("all"),
  plexAccess: z.enum(PLEX_ACCESS).catch("all"),
  subscription: z.enum(SUBSCRIPTIONS).catch("all"),
})

export type UsersFilter = z.infer<typeof usersFilterSchema>

type Params = Record<string, string | string[] | undefined>

/** The filters from a page's `searchParams`, each `all` (and `q` empty) unless the URL says otherwise. */
export function parseUsersFilter(params: Params): UsersFilter {
  const first = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }
  return usersFilterSchema.parse({
    q: first("q") ?? "",
    role: first("role"),
    plexAccess: first("plexAccess"),
    subscription: first("subscription"),
  })
}

/** A member's Plex access as a status word; null is `unknown`. */
export function plexAccessOf(user: Pick<AdminUserWithWrappedStats, "hasPlexAccess">): PlexAccess {
  if (user.hasPlexAccess === null) return "unknown"
  return user.hasPlexAccess ? "shared" : "notShared"
}

function subscriptionOf(user: Pick<AdminUserWithWrappedStats, "subscriptionStatus">): Exclude<UsersFilter["subscription"], "all"> {
  switch (user.subscriptionStatus) {
    case "ACTIVE":
      return "active"
    case "PAST_DUE":
    case "UNPAID":
      return "pastDue"
    case "CANCELED":
      return "canceled"
    default:
      return "none"
  }
}

/** The members that match every filter and the search. */
export function filterUsers<T extends AdminUserWithWrappedStats>(users: T[], filter: UsersFilter): T[] {
  const q = filter.q.toLowerCase()
  return users.filter((user) => {
    if (q && !`${user.name ?? ""} ${user.email ?? ""}`.toLowerCase().includes(q)) return false
    if (filter.role !== "all" && (user.isAdmin ? "admin" : "member") !== filter.role) return false
    if (filter.plexAccess !== "all" && plexAccessOf(user) !== filter.plexAccess) return false
    if (filter.subscription !== "all" && subscriptionOf(user) !== filter.subscription) return false
    return true
  })
}

const COMPARE: Record<(typeof USERS_SORTS)[number], (a: AdminUserWithWrappedStats, b: AdminUserWithWrappedStats) => number> = {
  name: (a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "", "en", { sensitivity: "base" }),
  joined: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  cost: (a, b) => (a.totalLlmUsage?.cost ?? 0) - (b.totalLlmUsage?.cost ?? 0),
}

/** A sorted copy; an unknown sort id falls back to the default. */
export function sortUsers<T extends AdminUserWithWrappedStats>(users: T[], sort: TableSort): T[] {
  const compare = COMPARE[sort.id as keyof typeof COMPARE] ?? COMPARE.joined
  const direction = sort.id in COMPARE ? (sort.desc ? -1 : 1) : -1
  return [...users].sort((a, b) => direction * compare(a, b) || a.id.localeCompare(b.id))
}

export interface UsersStats {
  members: number
  shared: number
  /** Members whose access is unknown: Plex didn't answer, or they have no Plex account. */
  notVerified: number
  subscriptions: { active: number; pastDue: number }
  /** This season's Rewind LLM spend, regenerations included. */
  season: { costUsd: number; tokens: number; requests: number }
  plexDown: boolean
}

/** The figures for the StatGrid and the Plex-down Alert. */
export function usersStats(users: AdminUserWithWrappedStats[], plexCheck: PlexAccessCheck): UsersStats {
  const count = (test: (user: AdminUserWithWrappedStats) => boolean) => users.filter(test).length
  return {
    members: users.length,
    shared: count((user) => user.hasPlexAccess === true),
    notVerified: count((user) => user.hasPlexAccess === null),
    subscriptions: {
      active: count((user) => subscriptionOf(user) === "active"),
      pastDue: count((user) => subscriptionOf(user) === "pastDue"),
    },
    season: users.reduce(
      (sum, user) => ({
        costUsd: sum.costUsd + (user.llmUsage?.cost ?? 0),
        tokens: sum.tokens + (user.llmUsage?.totalTokens ?? 0),
        requests: sum.requests + (user.llmUsage?.count ?? 0),
      }),
      { costUsd: 0, tokens: 0, requests: 0 }
    ),
    plexDown: plexCheck.status === "unreachable",
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "2 not verified", or undefined when every member's access is known. */
export function notVerifiedCopy(stats: Pick<UsersStats, "notVerified">): string | undefined {
  return stats.notVerified > 0 ? `${stats.notVerified} not verified` : undefined
}

/** The Plex-down Alert's bold first sentence (ui-design-system 6.3). */
export function plexDownTitle(notVerified: number): string {
  return `Plex didn't respond, so ${plural(notVerified, "member", "members")} couldn't be verified.`
}
