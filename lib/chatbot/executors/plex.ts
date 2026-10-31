import "server-only"

import { getPlexLibrarySections, getPlexOnDeck, getPlexRecentlyAdded, getPlexServerIdentity, getPlexSessions } from "@/lib/connections/plex"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { matchesSessionUser, type PlexSessionUserRef } from "@/lib/connections/plex-sessions"
import { isJellyfinOnly } from "@/lib/discord/copy"
import { memberServices } from "@/lib/members/service"
import { prisma } from "@/lib/prisma"
import { type FormatSettings } from "@/lib/utils/format"
import { JELLYFIN_MEMBER } from "./tool-output"
import { onDeckReply, RECENTLY_ADDED, recentlyAddedReply, sessionsReply } from "./plex-projections"
import { countArg, firstIndex, MAX_PAGE } from "./plex-tautulli-reply"
import { PLEX_EPOCH_KEYS, UTC_FORMAT, withLocalTimestamps } from "./timestamps"

/** `/status/sessions` as the PMS sends it: one session comes as an object, several as a list. */
interface PlexSessionsData {
  MediaContainer?: { Metadata?: PlexSessionUserRef | PlexSessionUserRef[] }
}

/**
 * The Discord caller's own Plex sessions, sanitized. Fails closed (SEC-50): no
 * caller, or a caller without a Plex user ID, sees none, and a Jellyfin-only
 * member is told why (P11.12). The owner's own streams are PMS user 1 (GAP-08).
 * The Discord allowlist drops the reply's `showing` line, whose hint is for an admin.
 */
async function callerSessions(data: PlexSessionsData, userId: string | undefined, adminPlexUserId: string | null) {
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { plexUserId: true, jellyfinUserId: true } })
    : null
  if (user && isJellyfinOnly(memberServices(user))) return JELLYFIN_MEMBER

  const metadata = data.MediaContainer?.Metadata
  const sessions = Array.isArray(metadata) ? metadata : metadata ? [metadata] : []
  const plexUserId = user?.plexUserId
  const own = plexUserId ? sessions.filter((session) => matchesSessionUser(session, { plexUserId, isOwner: plexUserId === adminPlexUserId })) : []
  return { success: true, data: sessionsReply({ MediaContainer: { size: own.length, Metadata: own } }) }
}

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
      // In the Discord context, only the requesting user's own sessions
      if (context === "discord") {
        return JSON.stringify(await callerSessions(sessions.data, userId, config.adminPlexUserId))
      }
      return JSON.stringify({ success: true, data: sessionsReply(sessions.data) })
    }
    case "get_plex_library_sections": {
      const result = await getPlexLibrarySections(config)
      if (!result.success) return JSON.stringify({ error: result.error || "Error fetching library sections" })
      return JSON.stringify(withLocalTimestamps(result.data, PLEX_EPOCH_KEYS, format.timeZone))
    }
    case "get_plex_recently_added": {
      const query = { limit: countArg(args.limit, RECENTLY_ADDED.fallback, RECENTLY_ADDED.max), page: countArg(args.page, 1, MAX_PAGE) }
      const result = await getPlexRecentlyAdded(config, query.limit, firstIndex(query))
      if (!result.success) return JSON.stringify({ error: result.error || "Error fetching recently added" })
      return JSON.stringify(recentlyAddedReply(result.data, query, format.timeZone))
    }
    case "get_plex_on_deck": {
      const result = await getPlexOnDeck(config)
      if (!result.success) return JSON.stringify({ error: result.error || "Error fetching on deck" })
      return JSON.stringify(onDeckReply(result.data, format.timeZone))
    }
    default:
      return "Error: Unknown Plex tool"
  }
}
