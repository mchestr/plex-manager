import "server-only"

import { containsText, cutShort, firstIndex, listOf, rowRange, showing, ways, withinBudget, type Paged, type Row } from "./plex-tautulli-reply"
import { isActiveUser, userOf } from "./tautulli-projections"
import { LIMITS, local } from "./tautulli-lists"

/**
 * The reply of `get_tautulli_users`: a page of the users by name, narrowed to
 * those with or without access and by a search when given.
 *
 * @module
 */

interface UsersQuery extends Paged {
  /** Part of a name or username, or exactly a user_id. */
  search?: string
  /** Only the users who still have access (`true`), or only those who no longer do (`false`). */
  active?: boolean
}

const nameOf = (user: Row) => String(user.friendly_name ?? user.username ?? "")
const byName = (a: Row, b: Row) => nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: "base" })

function isWanted(user: Row, { search, active }: UsersQuery): boolean {
  if (active !== undefined && isActiveUser(user) !== active) return false
  return search === undefined || String(user.user_id) === search || containsText(search, user.friendly_name, user.username)
}

/** The users `query` asks for, in words: "450 users with access", "2 users matching "sam"". */
function usersLabel(count: number, { search, active }: UsersQuery): string {
  const access = active === undefined ? [] : [active ? "with access" : "without access"]
  return [`${count} users`, ...access, ...(search === undefined ? [] : [`matching "${search}"`])].join(" ")
}

/** How to see the users a page leaves out. */
function moreUsers({ search, active, limit, page }: UsersQuery): string {
  return ways([
    `pass page ${page + 1} for more`,
    search === undefined ? "a search (a name, username or user_id) to find someone" : "a longer search",
    search === undefined && active === undefined && "active (true or false) for only the users with or without access",
    limit < LIMITS.users.max && `a larger limit (at most ${LIMITS.users.max})`,
  ])
}

/** A page of Tautulli's users by name, with the total and how many of them still have access. */
export function usersReply(data: unknown, query: UsersQuery, timeZone: string) {
  const all = listOf(data).map(userOf).sort(byName)
  const found = all.filter((user) => isWanted(user, query))
  const read = found.slice(firstIndex(query), firstIndex(query) + query.limit)
  const users = withinBudget(local(read, timeZone))
  const label = usersLabel(found.length, query)
  const line =
    read.length === 0 && query.page > 1
      ? `none on page ${query.page}; there are ${label}`
      : `showing ${rowRange(query, users.length)} of ${label}${query.search === undefined ? ", by name" : ""}`
  const more = users.length < read.length ? cutShort(users.length, read.length, "users") : moreUsers(query)
  return { showing: showing(line, firstIndex(query) + users.length < found.length, more), total: all.length, active: all.filter(isActiveUser).length, users }
}
