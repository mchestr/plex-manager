/**
 * The admin invites list's URL filters and an invite's status (P10.1), as
 * pure functions the page and the table share.
 *
 * | Param    | Values                                  |
 * |----------|-----------------------------------------|
 * | `q`      | part of a code, any case                |
 * | `status` | `all`, `active`, `expired`, `usedUp`    |
 * | `server` | `all`, `plex`, `jellyfin`               |
 *
 * Each defaults to `all` (UI-05); anything unrecognised falls back to it.
 * Sorts are `created` (the default, newest first), `code` and `expires`.
 *
 * @module lib/admin/invites/filter
 */

import { z } from "zod"

import type { TableSort } from "@/lib/ui/table-params"

/** A row's state, as the `invite` status domain names it. */
export type InviteStatus = "active" | "expired" | "usedUp"

export const INVITES_SORTS = ["created", "code", "expires"] as const
export const INVITES_DEFAULT_SORT: TableSort = { id: "created", desc: true }

const inviteFilterSchema = z.object({
  q: z.string().trim().max(32).catch(""),
  status: z.enum(["all", "active", "expired", "usedUp"]).catch("all"),
  server: z.enum(["all", "plex", "jellyfin"]).catch("all"),
})

export type InviteFilter = z.infer<typeof inviteFilterSchema>

type Params = Record<string, string | string[] | undefined>

/** The filters from a page's `searchParams`, each `all` (and `q` empty) unless the URL says otherwise. */
export function parseInviteFilter(params: Params): InviteFilter {
  const first = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }
  return inviteFilterSchema.parse({ q: first("q") ?? "", status: first("status"), server: first("server") })
}

/** Expired first, then used up, else active: the order the status filters use. */
export function inviteStatus(
  invite: { expiresAt: Date | null; useCount: number; maxUses: number },
  now: Date
): InviteStatus {
  if (invite.expiresAt && invite.expiresAt < now) return "expired"
  if (invite.useCount >= invite.maxUses) return "usedUp"
  return "active"
}
