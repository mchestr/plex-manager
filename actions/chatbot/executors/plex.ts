import { getPlexLibrarySections, getPlexOnDeck, getPlexRecentlyAdded, getPlexServerIdentity, getPlexSessions } from "@/lib/connections/plex"
import { prisma } from "@/lib/prisma"
import { getActivePlexService } from "@/lib/services/service-helpers"
import { sanitizePlexSessionsPayload } from "./plex-sanitizer"

export async function executePlexTool(
  toolName: string,
  args: Record<string, unknown>,
  userId?: string,
  context?: string
): Promise<string> {
  const plexService = await getActivePlexService()
  if (!plexService) return "Error: No active Plex server configured."

  const config = {
    name: plexService.name,
    url: plexService.url ?? "",
    token: plexService.config.token,
    publicUrl: plexService.publicUrl || undefined,
  }

  switch (toolName) {
    case "get_plex_status": {
      const identity = await getPlexServerIdentity(config)
      return JSON.stringify(identity)
    }
    case "get_plex_sessions": {
      const sessions = await getPlexSessions(config)
      if (!sessions.success || !sessions.data) {
        return JSON.stringify(sessions)
      }

      // In Discord context, scope sessions to the requesting user
      let sessionsData = sessions.data
      if (context === "discord" && userId) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { plexUserId: true },
        })

        if (user?.plexUserId && sessionsData?.MediaContainer?.Metadata) {
          // Filter sessions to only include those belonging to the user
          const userSessions = Array.isArray(sessionsData.MediaContainer.Metadata)
            ? sessionsData.MediaContainer.Metadata.filter(
                (session: any) => session.User?.id === user.plexUserId || session.user_id === user.plexUserId
              )
            : sessionsData.MediaContainer.Metadata.User?.id === user.plexUserId ||
              sessionsData.MediaContainer.Metadata.user_id === user.plexUserId
              ? [sessionsData.MediaContainer.Metadata]
              : []

          sessionsData = {
            ...sessionsData,
            MediaContainer: {
              ...sessionsData.MediaContainer,
              size: userSessions.length,
              Metadata: userSessions,
            },
          }
        } else if (!user?.plexUserId) {
          // User doesn't have a Plex user ID, return empty sessions
          sessionsData = {
            ...sessionsData,
            MediaContainer: {
              ...sessionsData.MediaContainer,
              size: 0,
              Metadata: [],
            },
          }
        }
      }

      return JSON.stringify({
        success: true,
        data: sanitizePlexSessionsPayload(sessionsData),
      })
    }
    case "get_plex_library_sections": {
      const result = await getPlexLibrarySections(config)
      if (!result.success) return result.error || "Error fetching library sections"
      return JSON.stringify(result.data)
    }
    case "get_plex_recently_added": {
      const limit = typeof args.limit === "number" ? args.limit : 20
      const result = await getPlexRecentlyAdded(config, limit)
      if (!result.success) return result.error || "Error fetching recently added"
      return JSON.stringify(result.data)
    }
    case "get_plex_on_deck": {
      const result = await getPlexOnDeck(config)
      if (!result.success) return result.error || "Error fetching on deck"
      return JSON.stringify(result.data)
    }
    default:
      return "Error: Unknown Plex tool"
  }
}

