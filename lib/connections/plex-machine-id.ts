import "server-only"

import { prisma } from "@/lib/prisma"

import { getPlexServerIdentity } from "./plex-connection"
import { logger } from "./plex-core"

/**
 * `PlexServer.machineIdentifier`, filled lazily (P11.8). Setup and settings
 * store it when the server is saved; a row saved before that gets it on its
 * first identity call here. When the PMS cannot answer, the row comes back
 * unchanged and the caller's own `resolveMachineIdentifier` asks again.
 */
export async function withMachineIdentifier<T extends { id: string; url: string; token: string; machineIdentifier: string | null }>(
  server: T
): Promise<T> {
  if (server.machineIdentifier) return server
  const identity = await getPlexServerIdentity(server)
  if (!identity.success || !identity.machineIdentifier) return server

  const machineIdentifier = identity.machineIdentifier
  try {
    await prisma.plexServer.update({ where: { id: server.id }, data: { machineIdentifier } })
  } catch (error) {
    logger.warn("Could not store the Plex machine identifier", { error: error instanceof Error ? error.name : "unknown" })
  }
  return { ...server, machineIdentifier }
}
