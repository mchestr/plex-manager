import { getTautulliActivity, getTautulliHistory, getTautulliLibraryNames, getTautulliMostWatched, getTautulliRecentlyWatched, getTautulliServerInfo, getTautulliTopUsers, getTautulliUserWatchTimeStats, getTautulliUsers } from "@/lib/connections/tautulli"
import { prisma } from "@/lib/prisma"
import { getActiveTautulliService } from "@/lib/services/service-helpers"

export async function executeTautulliTool(
  toolName: string,
  args: Record<string, unknown>,
  userId?: string,
  context?: string
): Promise<string> {
  const tautulliService = await getActiveTautulliService()
  if (!tautulliService) return "Error: No active Tautulli server configured."

  const config = {
    name: tautulliService.name,
    url: tautulliService.url ?? "",
    apiKey: tautulliService.config.apiKey,
    publicUrl: tautulliService.publicUrl || undefined,
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
          select: { plexUserId: true },
        })

        if (user?.plexUserId) {
          // Get Tautulli users to map Plex user ID to Tautulli user ID
          const tautulliUsersResult = await getTautulliUsers(config)
          if (tautulliUsersResult.success) {
            const tautulliUsers = tautulliUsersResult.data as any
            if (tautulliUsers?.response?.data) {
              const users = Array.isArray(tautulliUsers.response.data)
                ? tautulliUsers.response.data
                : [tautulliUsers.response.data]

              // Find Tautulli user ID matching the Plex user ID
              const tautulliUser = users.find(
                (u: any) => u.plex_id === user.plexUserId || u.user_id?.toString() === user.plexUserId
              )

              if (tautulliUser?.user_id && activity?.response?.data?.sessions) {
                // Filter activity sessions to only include those belonging to the user
                const sessions = Array.isArray(activity.response.data.sessions)
                  ? activity.response.data.sessions.filter(
                      (session: any) => session.user_id === tautulliUser.user_id
                    )
                  : activity.response.data.sessions.user_id === tautulliUser.user_id
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
              } else if (tautulliUser?.user_id) {
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
            }
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
      const statsResult = await getTautulliLibraryNames(config)
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

