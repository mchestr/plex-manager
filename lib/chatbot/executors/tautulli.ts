import "server-only"

import { z } from "zod"

import { toConnectionResult } from "@/lib/connections/http"
import { findTautulliUser, getTautulliActivity, getTautulliHistory, getTautulliHomeStat, getTautulliLibraryNames, getTautulliLibraryStats, getTautulliServerInfo, getTautulliUserWatchTimeStats, getTautulliUsers, tautulliCommand } from "@/lib/connections/tautulli"
import { getActiveService } from "@/lib/data/active-service"
import { isJellyfinOnly } from "@/lib/discord/copy"
import { memberServices } from "@/lib/members/service"
import { prisma } from "@/lib/prisma"
import { auditMemberRead } from "@/lib/security/audit-log"
import { type FormatSettings } from "@/lib/utils/format"
import { countArg, MAX_PAGE, textArg, userIdArg } from "./plex-tautulli-reply"
import { activityReply, LIMITS, matchingSessions, mostWatchedReply, recentPlaysReply, topUsersReply, usersReply, watchHistoryReply, type HistoryQuery } from "./tautulli-lists"
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
 * allowlist then drops the viewer fields.
 */
async function scopeActivityToCaller(config: TautulliConfig, data: unknown, userId: string | undefined, search: string | undefined) {
  const activity = activitySchema.safeParse(data)
  if (!activity.success || !userId) return UNMAPPED_ACTIVITY

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plexUserId: true, jellyfinUserId: true } })
  if (user && isJellyfinOnly(memberServices(user))) return JELLYFIN_MEMBER
  if (!user?.plexUserId) return UNMAPPED_ACTIVITY

  const lookup = await findTautulliUser(config, { plexUserId: user.plexUserId })
  if (!lookup.ok) return UNMAPPED_ACTIVITY

  const tautulliUserId = String(lookup.user.user_id)
  const sessions = matchingSessions(activity.data.sessions.filter((session) => String(session.user_id) === tautulliUserId), search)
  return { session_count: sessions.length, sessions, scope: "caller" }
}

/**
 * Audit an admin's per-member Tautulli read (P11.16, GAP-33). Tautulli's user
 * id is the Plex account id, so the member is the app user with that Plex id;
 * a Plex user with no account here has nothing to attach the row to.
 */
async function auditTautulliMemberRead(tautulliUserId: number | undefined, actorUserId: string | undefined) {
  if (tautulliUserId === undefined || !actorUserId) return
  const member = await prisma.user.findFirst({ where: { plexUserId: String(tautulliUserId) }, select: { id: true } })
  if (member && member.id !== actorUserId) await auditMemberRead("chatbot-tautulli", member.id, actorUserId)
}

/** One page of `get_history`, newest first (Tautulli's order), for one user or a search when given. */
async function historyPage(config: TautulliConfig, { userId, search, limit, page }: HistoryQuery) {
  const params = { user_id: userId, search, length: limit, start: (page - 1) * limit }
  return toConnectionResult("Tautulli", await tautulliCommand(config, "get_history", params, z.unknown()))
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
      const search = textArg(args.search)
      return JSON.stringify(context === "discord" ? await scopeActivityToCaller(config, activity.data, userId, search) : activityReply(activity.data, search))
    }
    case "get_tautulli_library_stats": {
      const stats = await getTautulliLibraryStats(config)
      return stats.success ? JSON.stringify(withLocalTimestamps(stats.data, TAUTULLI_EPOCH_KEYS, timeZone)) : toToolOutput(stats)
    }
    case "get_tautulli_library_names":
      return toToolOutput(await getTautulliLibraryNames(config))
    case "get_tautulli_users": {
      const users = await getTautulliUsers(config)
      const limit = countArg(args.limit, LIMITS.users.fallback, LIMITS.users.max)
      return users.success ? JSON.stringify(usersReply(users.data, { search: textArg(args.search), limit }, timeZone)) : toToolOutput(users)
    }
    case "get_tautulli_watch_history": {
      const tautulliUserId = userIdArg(args.userId)
      if (tautulliUserId === null) return NOT_A_USER_ID
      const query: HistoryQuery = {
        userId: tautulliUserId,
        search: textArg(args.search),
        limit: countArg(args.limit, LIMITS.history.fallback, LIMITS.history.max),
        page: countArg(args.page, 1, MAX_PAGE),
      }
      const history = await historyPage(config, query)
      if (!history.success) return toToolOutput(history)
      await auditTautulliMemberRead(tautulliUserId, userId)
      return JSON.stringify(watchHistoryReply(history.data, query, timeZone))
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
      if (stats.success) await auditTautulliMemberRead(tautulliUserId, userId)
      return toToolOutput(stats)
    }
    default:
      return "Error: Unknown Tautulli tool"
  }
}
