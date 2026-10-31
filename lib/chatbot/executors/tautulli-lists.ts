import "server-only"

import { containsText, isRecord, listOf, REPLY_BUDGET, showing, wholeNumber, withinBudget, type Row } from "./plex-tautulli-reply"
import { activityTotalsOf, homeStatRows, isActiveUser, playOf, sessionOf, topTitleOf, topUserOf, userOf } from "./tautulli-projections"
import { TAUTULLI_EPOCH_KEYS, withLocalTimestamps } from "./timestamps"

/**
 * The Tautulli list tools' replies: projected rows, a total where Tautulli
 * gives one, and a `showing` line that says how many of how many the reply
 * holds and how to see the rest, so a capped or filtered list is never taken
 * for the whole.
 *
 * @module
 */

/** Each list tool's default count and the most it returns, sized for a 40,000-character result on a large server. */
export const LIMITS = {
  users: { fallback: 100, max: 200 },
  history: { fallback: 20, max: 50 },
  topTitles: { fallback: 20, max: 50 },
  topUsers: { fallback: 10, max: 100 },
} as const

/** The period `get_home_stats` covers when not told otherwise. */
const HOME_STATS_PERIOD = "in the last 30 days"

/** Rows with their epoch seconds as ISO times in the turn's zone (P11.17). */
function local(rows: Row[], timeZone: string): Row[] {
  return withLocalTimestamps(rows, TAUTULLI_EPOCH_KEYS, timeZone) as Row[]
}

/** The ways to see more that apply, as one hint: "pass page 2 for older plays, or a larger limit (at most 50)". */
const ways = (options: (string | false)[]) => options.filter((option) => option !== false).join(", or ")

const nameOf = (user: Row) => String(user.friendly_name ?? user.username ?? "")
const byName = (a: Row, b: Row) => nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: "base" })

/** Tautulli's users by name, found by a name, a username or a user_id when `search` is given. */
export function usersReply(data: unknown, { search, limit }: { search?: string; limit: number }, timeZone: string) {
  const all = listOf(data).map(userOf).sort(byName)
  const found = search === undefined ? all : all.filter((user) => String(user.user_id) === search || containsText(search, user.friendly_name, user.username))
  const users = withinBudget(local(found.slice(0, limit), timeZone))
  const line = search === undefined ? `showing ${users.length} of ${all.length} users, by name` : `showing ${users.length} of ${found.length} users matching "${search}"`
  const more = [
    search === undefined ? "pass a search (a name, username or user_id) to find someone" : "use a longer search",
    limit < LIMITS.users.max && `a larger limit (at most ${LIMITS.users.max})`,
  ]
  return { showing: showing(line, users.length < found.length, ways(more)), total: all.length, active: all.filter(isActiveUser).length, users }
}

/** `sessions` projected, and only those of the user or title `search` names when it is given. */
export function matchingSessions(sessions: unknown[], search: string | undefined): Row[] {
  const projected = sessions.map(sessionOf)
  if (search === undefined) return projected
  return projected.filter(
    (session) => String(session.user_id) === search || containsText(search, session.friendly_name, session.full_title, session.title, session.grandparent_title)
  )
}

/** Everyone's streams (the admin's view): the server's totals, then each stream. */
export function activityReply(data: unknown, search: string | undefined) {
  const all = listOf(isRecord(data) ? data.sessions : undefined)
  const found = matchingSessions(all, search)
  const sessions = withinBudget(found)
  const line = search === undefined ? `showing ${sessions.length} of ${all.length} streams` : `showing ${sessions.length} of ${found.length} streams matching "${search}"`
  return { ...activityTotalsOf(data), showing: showing(line, sessions.length < found.length, "pass a search (a user or a title) to see the others"), sessions }
}

export interface HistoryQuery {
  userId?: number
  search?: string
  limit: number
  page: number
}

/** A `get_history` page: its plays, how many match, and `more` when the reply does not reach the last of them. */
function historyReply(data: unknown, query: HistoryQuery, timeZone: string, more: string) {
  const page = isRecord(data) ? data : {}
  const plays = withinBudget(local(listOf(page.data).map(playOf), timeZone))
  const total = wholeNumber(page.recordsFiltered) ?? plays.length
  const first = (query.page - 1) * query.limit + 1
  const label = [`${total} plays`, query.userId !== undefined && `by user_id ${query.userId}`, query.search !== undefined && `matching "${query.search}"`]
    .filter(Boolean)
    .join(" ")
  const line =
    plays.length === 0 && query.page > 1
      ? `none on page ${query.page}; there are ${label}`
      : `showing ${query.page === 1 ? plays.length : `${first}-${first + plays.length - 1}`} of ${label}, newest first`
  return { showing: showing(line, first - 1 + plays.length < total, more), total, plays }
}

/** One page of the watch history, for one user or a search when given. */
export function watchHistoryReply(data: unknown, query: HistoryQuery, timeZone: string) {
  const more = [
    `pass page ${query.page + 1} for older plays`,
    query.limit < LIMITS.history.max && `a larger limit (at most ${LIMITS.history.max})`,
    query.userId === undefined && query.search === undefined && "a userId or a search to narrow them",
  ]
  return historyReply(data, query, timeZone, ways(more))
}

/** The newest plays on the server. */
export function recentPlaysReply(data: unknown, limit: number, timeZone: string) {
  const more = [
    limit < LIMITS.history.max && `pass a larger limit (at most ${LIMITS.history.max})`,
    "use get_tautulli_watch_history with page, userId or search for older plays",
  ]
  return historyReply(data, { limit, page: 1 }, timeZone, ways(more))
}

const largerLimit = (shown: number, limit: number, max: number) => shown >= limit && limit < max

/** The `top_movies` and `top_tv` cards: the most played titles in Tautulli's default period. */
export function mostWatchedReply(movies: unknown, tv: unknown, limit: number, timeZone: string) {
  const { max } = LIMITS.topTitles
  // Two lists share one reply's budget
  const top_movies = withinBudget(local(homeStatRows(movies).map(topTitleOf), timeZone), REPLY_BUDGET / 2)
  const top_tv = withinBudget(local(homeStatRows(tv).map(topTitleOf), timeZone), REPLY_BUDGET / 2)
  const line = `showing the top ${top_movies.length} movies and top ${top_tv.length} shows by plays ${HOME_STATS_PERIOD}`
  const capped = largerLimit(top_movies.length, limit, max) || largerLimit(top_tv.length, limit, max)
  return { showing: showing(line, capped, `pass a larger limit (at most ${max}) to see more`), top_movies, top_tv }
}

/** The `top_users` card: the users who watched longest in Tautulli's default period. */
export function topUsersReply(data: unknown, limit: number, timeZone: string) {
  const { max } = LIMITS.topUsers
  const users = withinBudget(local(homeStatRows(data).map(topUserOf), timeZone))
  const line = `showing the top ${users.length} users by watch time ${HOME_STATS_PERIOD}`
  return { showing: showing(line, largerLimit(users.length, limit, max), `pass a larger limit (at most ${max}) to see more`), users }
}
