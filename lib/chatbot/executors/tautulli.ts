import "server-only"

import { findTautulliUser, getTautulliActivity, getTautulliHistory, getTautulliHomeStat, getTautulliLibraryNames, getTautulliLibraryStats, getTautulliServerInfo, getTautulliUserWatchTimeStats, getTautulliUsers } from "@/lib/connections/tautulli"
import { prisma } from "@/lib/prisma"
import { auditMemberRead } from "@/lib/security/audit-log"
import { z } from "zod"
import { withoutPersonalFields } from "./personal-fields"
import { toToolOutput } from "./tool-output"

type TautulliConfig = Parameters<typeof findTautulliUser>[0]

// `data` of get_activity: { stream_count, sessions: [{ user_id, ... }], ... }
const activitySchema = z.object({
  sessions: z.array(z.object({ user_id: z.union([z.number(), z.string()]) }).passthrough()),
})

/** What a Discord caller sees when their sessions cannot be picked out from everyone's. */
const UNMAPPED_ACTIVITY = { session_count: 0, sessions: [], scope: "unmapped" } as const

/**
 * Activity scoped to the Discord caller. Fails closed (SEC-50): only a caller
 * positively mapped to a Tautulli user sees sessions, and only their own. No
 * caller, no Plex user ID, a failed or empty lookup, or an activity payload of
 * an unexpected shape all return no sessions.
 */
async function scopeActivityToCaller(config: TautulliConfig, data: unknown, userId: string | undefined) {
  const activity = activitySchema.safeParse(data)
  if (!activity.success || !userId) return UNMAPPED_ACTIVITY

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plexUserId: true } })
  if (!user?.plexUserId) return UNMAPPED_ACTIVITY

  const lookup = await findTautulliUser(config, { plexUserId: user.plexUserId })
  if (!lookup.ok) return UNMAPPED_ACTIVITY

  const tautulliUserId = String(lookup.user.user_id)
  const sessions = activity.data.sessions.filter((session) => String(session.user_id) === tautulliUserId)
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

export async function executeTautulliTool(
  toolName: string,
  args: Record<string, unknown>,
  userId?: string,
  context?: string
): Promise<string> {
  const server = await prisma.tautulli.findFirst({ where: { isActive: true } })
  if (!server) return "Error: No active Tautulli server configured."

  const config = {
    name: server.name,
    url: server.url,
    apiKey: server.apiKey,
    publicUrl: server.publicUrl || undefined,
  }

  switch (toolName) {
    case "get_tautulli_status": {
      const infoResult = await getTautulliServerInfo(config)
      if (!infoResult.success) {
        return JSON.stringify({ error: infoResult.error })
      }
      return JSON.stringify(infoResult.data)
    }
    case "get_tautulli_activity": {
      const activityResult = await getTautulliActivity(config)
      if (!activityResult.success) {
        return JSON.stringify({ error: activityResult.error })
      }
      if (context === "discord") {
        return JSON.stringify(await scopeActivityToCaller(config, activityResult.data, userId))
      }

      return JSON.stringify(withoutPersonalFields(activityResult.data))
    }
    case "get_tautulli_library_stats": {
      const statsResult = await getTautulliLibraryStats(config)
      if (!statsResult.success) {
        return JSON.stringify({ error: statsResult.error })
      }
      return JSON.stringify(statsResult.data)
    }
    case "get_tautulli_library_names": {
      const namesResult = await getTautulliLibraryNames(config)
      if (!namesResult.success) {
        return JSON.stringify({ error: namesResult.error })
      }
      return JSON.stringify(namesResult.data)
    }
    case "get_tautulli_users": {
      const usersResult = await getTautulliUsers(config)
      if (!usersResult.success) {
        return JSON.stringify({ error: usersResult.error })
      }
      return JSON.stringify(withoutPersonalFields(usersResult.data))
    }
    case "get_tautulli_watch_history": {
      const tautulliUserId = typeof args.userId === "number" ? args.userId : undefined
      const limit = typeof args.limit === "number" ? args.limit : 20
      const historyResult = await getTautulliHistory(config, tautulliUserId, limit)
      if (!historyResult.success) {
        return JSON.stringify({ error: historyResult.error })
      }
      await auditTautulliMemberRead(tautulliUserId, userId)
      return JSON.stringify(withoutPersonalFields(historyResult.data))
    }
    case "get_tautulli_recently_watched": {
      // get_history is newest first by default
      const limit = typeof args.limit === "number" ? args.limit : 20
      const recent = await getTautulliHistory(config, undefined, limit)
      return toToolOutput(recent.success ? { ...recent, data: withoutPersonalFields(recent.data) } : recent)
    }
    case "get_tautulli_most_watched": {
      const limit = typeof args.limit === "number" ? args.limit : 20
      const [movies, tv] = await Promise.all([
        getTautulliHomeStat(config, "top_movies", limit),
        getTautulliHomeStat(config, "top_tv", limit),
      ])
      if (!movies.success) return toToolOutput(movies)
      if (!tv.success) return toToolOutput(tv)
      return JSON.stringify({ top_movies: movies.data, top_tv: tv.data })
    }
    case "get_tautulli_top_users": {
      const limit = typeof args.limit === "number" ? args.limit : 10
      return toToolOutput(await getTautulliHomeStat(config, "top_users", limit, "duration"))
    }
    case "get_tautulli_user_watch_stats": {
      const tautulliUserId = typeof args.userId === "number" ? args.userId : undefined
      const statsResult = await getTautulliUserWatchTimeStats(config, tautulliUserId)
      if (!statsResult.success) {
        return JSON.stringify({ error: statsResult.error })
      }
      await auditTautulliMemberRead(tautulliUserId, userId)
      return JSON.stringify(statsResult.data)
    }
    default:
      return "Error: Unknown Tautulli tool"
  }
}

