import { findTautulliUser, getTautulliActivity, getTautulliHistory, getTautulliLibraryNames, getTautulliLibraryStats, getTautulliMostWatched, getTautulliRecentlyWatched, getTautulliServerInfo, getTautulliTopUsers, getTautulliUserWatchTimeStats, getTautulliUsers } from "@/lib/connections/tautulli"
import { prisma } from "@/lib/prisma"

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
      const activity = activityResult.data as any

      // In Discord context, scope activity to the requesting user
      if (context === "discord" && userId) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { plexUserId: true, name: true },
        })

        if (user?.plexUserId) {
          // Map the Plex user ID to the Tautulli user ID
          const lookup = await findTautulliUser(config, {
            plexUserId: user.plexUserId,
            plexUsername: user.name,
          })
          if (lookup.ok) {
            const tautulliUserId = lookup.user.user_id

            if (activity?.response?.data?.sessions) {
              // Filter activity sessions to only include those belonging to the user
              const sessions = Array.isArray(activity.response.data.sessions)
                ? activity.response.data.sessions.filter(
                    (session: any) => session.user_id === tautulliUserId
                  )
                : activity.response.data.sessions.user_id === tautulliUserId
                  ? [activity.response.data.sessions]
                  : []

              return JSON.stringify({
                ...activity,
                response: {
                  ...activity.response,
                  data: {
                    ...activity.response.data,
                    session_count: sessions.length,
                    sessions,
                  },
                },
              })
            }

            // No sessions found for user, return empty activity
            return JSON.stringify({
              ...activity,
              response: {
                ...activity.response,
                data: {
                  ...activity.response.data,
                  session_count: 0,
                  sessions: [],
                },
              },
            })
          }
        } else {
          // User doesn't have a Plex user ID, return empty activity
          return JSON.stringify({
            ...activity,
            response: {
              ...activity.response,
              data: {
                ...activity.response.data,
                session_count: 0,
                sessions: [],
              },
            },
          })
        }
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
      const limit = typeof args.limit === "number" ? args.limit : 20
      const recentResult = await getTautulliRecentlyWatched(config, limit)
      if (!recentResult.success) {
        return JSON.stringify({ error: recentResult.error })
      }
      return JSON.stringify(recentResult.data)
    }
    case "get_tautulli_most_watched": {
      const limit = typeof args.limit === "number" ? args.limit : 20
      const mostWatchedResult = await getTautulliMostWatched(config, limit)
      if (!mostWatchedResult.success) {
        return JSON.stringify({ error: mostWatchedResult.error })
      }
      return JSON.stringify(mostWatchedResult.data)
    }
    case "get_tautulli_top_users": {
      const limit = typeof args.limit === "number" ? args.limit : 10
      const topUsersResult = await getTautulliTopUsers(config, limit)
      if (!topUsersResult.success) {
        return JSON.stringify({ error: topUsersResult.error })
      }
      return JSON.stringify(topUsersResult.data)
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

