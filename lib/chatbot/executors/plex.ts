import "server-only"

import { getPlexLibrarySections, getPlexOnDeck, getPlexRecentlyAdded, getPlexServerIdentity, getPlexSessions } from "@/lib/connections/plex"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { matchesSessionUser, type PlexSessionUserRef } from "@/lib/connections/plex-sessions"
import { isJellyfinOnly } from "@/lib/discord/copy"
import { memberServices } from "@/lib/members/service"
import { prisma } from "@/lib/prisma"
import { type FormatSettings } from "@/lib/utils/format"
import { JELLYFIN_MEMBER } from "./tool-output"
import { sanitizePlexSessionsPayload } from "./plex-sanitizer"
import { PLEX_EPOCH_KEYS, UTC_FORMAT, withLocalTimestamps } from "./timestamps"

export async function executePlexTool(
  toolName: string,
  args: Record<string, unknown>,
  userId?: string,
  context?: string,
  format: FormatSettings = UTC_FORMAT
): Promise<string> {
  const config = await getActivePlexServerConfig()
  if (!config) return "Error: No active Plex server configured."

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
          select: { plexUserId: true, jellyfinUserId: true },
        })
        // A Jellyfin-only member has no Plex streams to show; say why rather than "none" (P11.12)
        if (user && isJellyfinOnly(memberServices(user))) return JSON.stringify(JELLYFIN_MEMBER)

        if (user?.plexUserId && sessionsData?.MediaContainer?.Metadata) {
          // Only the user's own sessions; the owner's are PMS user 1 (GAP-08)
          const member = { plexUserId: user.plexUserId, isOwner: user.plexUserId === config.adminPlexUserId }
          const metadata: PlexSessionUserRef[] = Array.isArray(sessionsData.MediaContainer.Metadata)
            ? sessionsData.MediaContainer.Metadata
            : [sessionsData.MediaContainer.Metadata]
          const userSessions = metadata.filter((session) => matchesSessionUser(session, member))

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
      return JSON.stringify(withLocalTimestamps(result.data, PLEX_EPOCH_KEYS, format.timeZone))
    }
    case "get_plex_on_deck": {
      const result = await getPlexOnDeck(config)
      if (!result.success) return result.error || "Error fetching on deck"
      return JSON.stringify(withLocalTimestamps(result.data, PLEX_EPOCH_KEYS, format.timeZone))
    }
    default:
      return "Error: Unknown Plex tool"
  }
}

