import "server-only"

import { z } from "zod"

import { findTautulliUser, getTautulliActivity, getTautulliHistory, getTautulliHomeStat, getTautulliLibraryNames, getTautulliLibraryStats, getTautulliServerInfo, getTautulliUserWatchTimeStats, getTautulliUsers } from "@/lib/connections/tautulli"
import { getActiveService } from "@/lib/data/active-service"
import { isJellyfinOnly } from "@/lib/discord/copy"
import { memberServices } from "@/lib/members/service"
import { prisma } from "@/lib/prisma"
import { type FormatSettings } from "@/lib/utils/format"
import { countArg, flagArg, MAX_PAGE, textArg, userIdArg } from "./plex-tautulli-reply"
import { auditTautulliMemberReads, historyPage } from "./tautulli-history"
import { activityReply, LIMITS, mostWatchedReply, recentPlaysReply, topUsersReply, watchHistoryReply, type HistoryQuery } from "./tautulli-lists"
import { sessionOf } from "./tautulli-projections"
import { usersReply } from "./tautulli-users"
import { TAUTULLI_EPOCH_KEYS, UTC_FORMAT, withLocalTimestamps } from "./timestamps"
import { JELLYFIN_MEMBER, toToolOutput } from "./tool-output"

type TautulliConfig = Parameters<typeof findTautulliUser>[0]

// `data` of get_activity: { stream_count, sessions: [{ user_id, ... }], ... }
const activitySchema = z.object({
  sessions: z.array(z.object({ user_id: z.union([z.number(), z.string()]) }).passthrough()),
})

/** What a Discord caller sees when their sessions cannot be picked out from everyone's. */
const UNMAPPED_ACTIVITY = { session_count: 0, sessions: [], scope: "unmapped" } as const

/** The answer to a `userId` that is not a Tautulli user id (a name, say), instead of every user's data. */
const NOT_A_USER_ID = JSON.stringify({ error: "userId must be a Tautulli user_id (a number); find it with get_tautulli_users." })

/**
 * Activity scoped to the Discord caller. Fails closed (SEC-50): only a caller
 * positively mapped to a Tautulli user sees sessions, and only their own. No
 * caller, no Plex user ID, a failed or empty lookup, or an activity payload of
 * an unexpected shape all return no sessions; a Jellyfin-only member is told
 * why (P11.12). Sessions are projected as for an admin, and the Discord
 * allowlist then drops the viewer fields. A search is not applied: it could
 * only hide the caller's own streams, and a search for someone else would
 * read as "not watching".
 */
async function scopeActivityToCaller(config: TautulliConfig, data: unknown, userId: string | undefined) {
  const activity = activitySchema.safeParse(data)
  if (!activity.success || !userId) return UNMAPPED_ACTIVITY

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plexUserId: true, jellyfinUserId: true } })
  if (user && isJellyfinOnly(memberServices(user))) return JELLYFIN_MEMBER
  if (!user?.plexUserId) return UNMAPPED_ACTIVITY

  const lookup = await findTautulliUser(config, { plexUserId: user.plexUserId })
  if (!lookup.ok) return UNMAPPED_ACTIVITY

  const tautulliUserId = String(lookup.user.user_id)
  const sessions = activity.data.sessions.filter((session) => String(session.user_id) === tautulliUserId).map(sessionOf)
  return { session_count: sessions.length, sessions, scope: "caller" }
}

/** The watch history page `args` ask for, or `null` for a userId that is not a user id. */
function historyQuery(args: Record<string, unknown>): HistoryQuery | null {
  const userId = userIdArg(args.userId)
  if (userId === null) return null
  return {
    userId,
    search: textArg(args.search),
    limit: countArg(args.limit, LIMITS.history.fallback, LIMITS.history.max),
    page: countArg(args.page, 1, MAX_PAGE),
  }
}

export async function executeTautulliTool(
  toolName: string,
  args: Record<string, unknown>,
  userId?: string,
  context?: string,
  format: FormatSettings = UTC_FORMAT
): Promise<string> {
  // Epoch seconds reach the model as ISO strings with the turn zone's offset (P11.17)
  const { timeZone } = format
  const server = await getActiveService("tautulli")
  if (!server) return "Error: No active Tautulli server configured."

  const config = {
    name: server.name,
    url: server.url,
    apiKey: server.apiKey,
    publicUrl: server.publicUrl || undefined,
  }

  // A failed call is `{ error }` with the client's fixed message (toToolOutput)
  switch (toolName) {
    case "get_tautulli_status":
      return toToolOutput(await getTautulliServerInfo(config))
    case "get_tautulli_activity": {
      const activity = await getTautulliActivity(config)
      if (!activity.success) return toToolOutput(activity)
      if (context === "discord") return JSON.stringify(await scopeActivityToCaller(config, activity.data, userId))
      return JSON.stringify(activityReply(activity.data, textArg(args.search)))
    }
    case "get_tautulli_library_stats": {
      const stats = await getTautulliLibraryStats(config)
      return stats.success ? JSON.stringify(withLocalTimestamps(stats.data, TAUTULLI_EPOCH_KEYS, timeZone)) : toToolOutput(stats)
    }
    case "get_tautulli_library_names":
      return toToolOutput(await getTautulliLibraryNames(config))
    case "get_tautulli_users": {
      const users = await getTautulliUsers(config)
      if (!users.success) return toToolOutput(users)
      const limit = countArg(args.limit, LIMITS.users.fallback, LIMITS.users.max)
      const query = { search: textArg(args.search), active: flagArg(args.active), limit, page: countArg(args.page, 1, MAX_PAGE) }
      return JSON.stringify(usersReply(users.data, query, timeZone))
    }
    case "get_tautulli_watch_history": {
      const query = historyQuery(args)
      if (!query) return NOT_A_USER_ID
      const history = await historyPage(config, query)
      if (!history.success) return toToolOutput(history)
      const reply = watchHistoryReply(history.data, query, timeZone)
      // The member asked for is read, and so is each one a search finds (by name, say)
      const searched = query.search === undefined ? [] : reply.plays.map((play) => play.user_id)
      await auditTautulliMemberReads([query.userId, ...searched], userId)
      return JSON.stringify(reply)
    }
    case "get_tautulli_recently_watched": {
      // get_history is newest first by default
      const limit = countArg(args.limit, LIMITS.history.fallback, LIMITS.history.max)
      const recent = await getTautulliHistory(config, undefined, limit)
      return recent.success ? JSON.stringify(recentPlaysReply(recent.data, limit, timeZone)) : toToolOutput(recent)
    }
    case "get_tautulli_most_watched": {
      const limit = countArg(args.limit, LIMITS.topTitles.fallback, LIMITS.topTitles.max)
      const [movies, tv] = await Promise.all([
        getTautulliHomeStat(config, "top_movies", limit),
        getTautulliHomeStat(config, "top_tv", limit),
      ])
      if (!movies.success) return toToolOutput(movies)
      if (!tv.success) return toToolOutput(tv)
      return JSON.stringify(mostWatchedReply(movies.data, tv.data, limit, timeZone))
    }
    case "get_tautulli_top_users": {
      const limit = countArg(args.limit, LIMITS.topUsers.fallback, LIMITS.topUsers.max)
      const topUsers = await getTautulliHomeStat(config, "top_users", limit, "duration")
      return topUsers.success ? JSON.stringify(topUsersReply(topUsers.data, limit, timeZone)) : toToolOutput(topUsers)
    }
    case "get_tautulli_user_watch_stats": {
      // Tautulli has no server-wide form of get_user_watch_time_stats: without a user it fails
      const tautulliUserId = userIdArg(args.userId)
      if (tautulliUserId === null || tautulliUserId === undefined) return NOT_A_USER_ID
      const stats = await getTautulliUserWatchTimeStats(config, tautulliUserId)
      if (stats.success) await auditTautulliMemberReads([tautulliUserId], userId)
      return toToolOutput(stats)
    }
    default:
      return "Error: Unknown Tautulli tool"
  }
}
