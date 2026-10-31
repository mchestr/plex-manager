import "server-only"

import { containsText, cutShort, firstIndex, isRecord, listOf, REPLY_BUDGET, rowRange, showing, ways, wholeNumber, withinBudget, type Paged, type Row } from "./plex-tautulli-reply"
import { activityTotalsOf, homeStatRows, playOf, sessionOf, topTitleOf, topUserOf } from "./tautulli-projections"
import { TAUTULLI_EPOCH_KEYS, withLocalTimestamps } from "./timestamps"

/**
 * The Tautulli list tools' replies: projected rows, a total where Tautulli
 * gives one, and a `showing` line that says how many of how many the reply
 * holds and how to see the rest, so a capped or filtered list is never taken
 * for the whole.
 *
 * @module
 */

/**
 * Each list tool's default count and the most it returns, sized for a
 * 40,000-character result on a large server. A user with 15 libraries and
 * content restrictions takes about 200 characters, so a page of 150 still
 * fits whole and paging at the largest limit skips no one.
 */
export const LIMITS = {
  users: { fallback: 100, max: 150 },
  history: { fallback: 20, max: 50 },
  topTitles: { fallback: 20, max: 50 },
  topUsers: { fallback: 10, max: 100 },
} as const

/** The period `get_home_stats` covers when not told otherwise. */
const HOME_STATS_PERIOD = "in the last 30 days"

/** Rows with their epoch seconds as ISO times in the turn's zone (P11.17). */
export function local(rows: Row[], timeZone: string): Row[] {
  return withLocalTimestamps(rows, TAUTULLI_EPOCH_KEYS, timeZone) as Row[]
}

/** Whether a stream is that of the user or the title `search` names: exactly a user_id, or part of a name or title. */
const isMatch = (search: string) => (session: Row) =>
  String(session.user_id) === search || containsText(search, session.friendly_name, session.full_title, session.title, session.grandparent_title)

/** Everyone's streams (the admin's view): the server's totals, then each stream, or only those `search` names. */
export function activityReply(data: unknown, search: string | undefined) {
  const all = listOf(isRecord(data) ? data.sessions : undefined).map(sessionOf)
  const found = search === undefined ? all : all.filter(isMatch(search))
  const sessions = withinBudget(found)
  const line = search === undefined ? `showing ${sessions.length} of ${all.length} streams` : `showing ${sessions.length} of ${found.length} streams matching "${search}"`
  return { ...activityTotalsOf(data), showing: showing(line, sessions.length < found.length, "pass a search (a user or a title) to see the others"), sessions }
}

export interface HistoryQuery extends Paged {
  userId?: number
  search?: string
}

/**
 * A `get_history` page: its plays, how many match, and `more` when the reply
 * does not reach the last of them, or `cut` when the reply budget held fewer
 * plays than the page read.
 */
function historyReply(data: unknown, query: HistoryQuery, timeZone: string, { more, cut }: { more: string; cut?: string }) {
  const page = isRecord(data) ? data : {}
  const read = listOf(page.data).map(playOf)
  const plays = withinBudget(local(read, timeZone))
  const total = wholeNumber(page.recordsFiltered) ?? read.length
  const label = [`${total} plays`, query.userId !== undefined && `by user_id ${query.userId}`, query.search !== undefined && `matching "${query.search}"`]
    .filter(Boolean)
    .join(" ")
  const line = read.length === 0 && query.page > 1 ? `none on page ${query.page}; there are ${label}` : `showing ${rowRange(query, plays.length)} of ${label}, newest first`
  const hint = plays.length < read.length ? cutShort(plays.length, read.length, "plays", cut) : more
  return { showing: showing(line, firstIndex(query) + plays.length < total, hint), total, plays }
}

/** One page of the watch history, for one user or a search when given. */
export function watchHistoryReply(data: unknown, query: HistoryQuery, timeZone: string) {
  const more = [
    `pass page ${query.page + 1} for older plays`,
    query.limit < LIMITS.history.max && `a larger limit (at most ${LIMITS.history.max})`,
    query.userId === undefined && query.search === undefined && "a userId or a search to narrow them",
  ]
  return historyReply(data, query, timeZone, { more: ways(more) })
}

/** The newest plays on the server. */
export function recentPlaysReply(data: unknown, limit: number, timeZone: string) {
  const more = [
    limit < LIMITS.history.max && `pass a larger limit (at most ${LIMITS.history.max})`,
    "use get_tautulli_watch_history with page, userId or search for older plays",
  ]
  const cut = "use get_tautulli_watch_history with a smaller limit and page through them"
  return historyReply(data, { limit, page: 1 }, timeZone, { more: ways(more), cut })
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
