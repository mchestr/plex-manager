import "server-only"

import { getAvailableLibraries } from "@/actions/server-info"
import { getJellyfinLibraries } from "@/lib/connections/jellyfin-connection"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import type { LibraryListing } from "@/types/invite"

const logger = createLogger("admin-invite-libraries")

/**
 * The active Plex server's movie, show and music sections for the
 * create-invite picker. The page starts it without awaiting, so the list
 * never waits for Plex; a failure says why instead of throwing.
 */
export async function plexLibraryListing(): Promise<LibraryListing> {
  const result = await getAvailableLibraries()
  if (!result.success) return { ok: false, reason: result.error }
  return {
    ok: true,
    libraries: result.data.map((library) => ({ id: String(library.id), name: library.title, type: library.type })),
  }
}

/**
 * The active Jellyfin server's libraries (P0.6's server-only read). With no
 * active server, or a failed read, the dialog disables the Jellyfin option
 * and shows the reason.
 */
export async function jellyfinLibraryListing(): Promise<LibraryListing> {
  const server = await prisma.jellyfinServer
    .findFirst({ where: { isActive: true }, orderBy: { updatedAt: "desc" }, select: { url: true, apiKey: true } })
    .catch((error: unknown) => {
      // A rejected promise would reach the dialog's `use()` and its error boundary
      logger.error("Could not read the Jellyfin server", error)
      return undefined
    })
  if (server === undefined) return { ok: false, reason: "Could not read the Jellyfin settings." }
  if (!server) return { ok: false, reason: "No Jellyfin server is set up." }

  const result = await getJellyfinLibraries(server)
  if (!result.success) {
    logger.warn("Could not list Jellyfin libraries", { error: result.error })
    return { ok: false, reason: "Could not reach the Jellyfin server to list libraries." }
  }
  return {
    ok: true,
    libraries: (result.data ?? []).map((library) => ({
      id: library.ItemId,
      name: library.Name,
      type: library.CollectionType || "unknown",
    })),
  }
}
