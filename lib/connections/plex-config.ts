/**
 * Shared loader for the active Plex server configuration.
 *
 * Centralizes the previously duplicated
 * `prisma.plexServer.findFirst({ where: { isActive: true } })` lookup and the
 * subsequent mapping into the config object that the Plex connection helpers
 * (and Discord integration) consume.
 */

import { prisma } from "@/lib/prisma"

/**
 * The full active-Plex-server config shared by all callers.
 *
 * Individual callers use the subset they need: the Plex connection helpers
 * read `{ url, token }` (and optionally `name`/`publicUrl`), while
 * `syncDiscordRoleConnection` additionally reads `adminPlexUserId`.
 */
export interface PlexServerConfig {
  name: string
  url: string
  token: string
  publicUrl?: string
  adminPlexUserId: string | null
}

/**
 * Loads the active Plex server and maps it to a {@link PlexServerConfig}.
 *
 * @returns The mapped config, or `null` when no active Plex server exists.
 */
export async function getActivePlexServerConfig(): Promise<PlexServerConfig | null> {
  const server = await prisma.plexServer.findFirst({ where: { isActive: true } })
  if (!server) {
    return null
  }

  return {
    name: server.name,
    url: server.url,
    token: server.token,
    publicUrl: server.publicUrl || undefined,
    adminPlexUserId: server.adminPlexUserId ?? null,
  }
}
