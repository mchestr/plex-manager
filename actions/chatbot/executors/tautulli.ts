import { findTautulliUser, getTautulliActivity, getTautulliHistory, getTautulliHomeStat, getTautulliLibraryNames, getTautulliLibraryStats, getTautulliServerInfo, getTautulliUserWatchTimeStats, getTautulliUsers } from "@/lib/connections/tautulli"
import { prisma } from "@/lib/prisma"
import { toToolOutput } from "./tool-output"

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
      // `data` of get_activity: { stream_count, sessions, ... }
      const activity = activityResult.data as { sessions?: unknown } | null

      // In Discord context, scope activity to the requesting user. Fail closed:
      // a caller with no Plex user ID, no Tautulli match or a failed lookup
      // sees no sessions rather than everyone's.
      if (context === "discord") {
        const user = userId
          ? await prisma.user.findUnique({ where: { id: userId }, select: { plexUserId: true } })
          : null
        const lookup = user?.plexUserId
          ? await findTautulliUser(config, { plexUserId: user.plexUserId })
          : null
        const tautulliUserId = lookup?.ok ? lookup.user.user_id : null
        const raw = activity?.sessions
        const all: unknown[] = raw === undefined || raw === null ? [] : Array.isArray(raw) ? raw : [raw]
        const sessions =
          tautulliUserId === null
            ? []
            : all.filter((session) => (session as { user_id?: unknown } | null)?.user_id === tautulliUserId)

        return JSON.stringify({ ...activity, session_count: sessions.length, sessions })
      }

      return JSON.stringify(activity)
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
      return JSON.stringify(usersResult.data)
    }
    case "get_tautulli_watch_history": {
      const tautulliUserId = typeof args.userId === "number" ? args.userId : undefined
      const limit = typeof args.limit === "number" ? args.limit : 20
      const historyResult = await getTautulliHistory(config, tautulliUserId, limit)
      if (!historyResult.success) {
        return JSON.stringify({ error: historyResult.error })
      }
      return JSON.stringify(historyResult.data)
    }
    case "get_tautulli_recently_watched": {
      // get_history is newest first by default
      const limit = typeof args.limit === "number" ? args.limit : 20
      return toToolOutput(await getTautulliHistory(config, undefined, limit))
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
      return JSON.stringify(statsResult.data)
    }
    default:
      return "Error: Unknown Tautulli tool"
  }
}

