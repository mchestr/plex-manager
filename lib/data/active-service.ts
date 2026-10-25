/**
 * Each connected service's active row, read once per server render (P11.19,
 * BP-31). A page whose layout, loaders and cards all need the Plex server
 * makes one query for it instead of one each.
 *
 * The rows carry decrypted secrets (`ENCRYPTED_FIELDS`), so they are memoised
 * per request with React `cache()` and never inside `'use cache'`, whose
 * entries outlive the request and are shared between viewers. Outside a render
 * (an action, a job) each call queries again.
 *
 * @module lib/data/active-service
 */

import "server-only"

import { cache } from "react"

import type { JellyfinServer, Overseerr, PlexServer, Prometheus, Radarr, Sonarr, Tautulli } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"

interface ActiveRows {
  plex: PlexServer
  jellyfin: JellyfinServer
  tautulli: Tautulli
  overseerr: Overseerr
  sonarr: Sonarr
  radarr: Radarr
  prometheus: Prometheus
}

export type ActiveServiceKind = keyof ActiveRows

const ACTIVE = { where: { isActive: true }, orderBy: { updatedAt: "desc" } } as const

const loaders: { [K in ActiveServiceKind]: () => Promise<ActiveRows[K] | null> } = {
  plex: cache(() => prisma.plexServer.findFirst(ACTIVE)),
  jellyfin: cache(() => prisma.jellyfinServer.findFirst(ACTIVE)),
  tautulli: cache(() => prisma.tautulli.findFirst(ACTIVE)),
  overseerr: cache(() => prisma.overseerr.findFirst(ACTIVE)),
  sonarr: cache(() => prisma.sonarr.findFirst(ACTIVE)),
  radarr: cache(() => prisma.radarr.findFirst(ACTIVE)),
  prometheus: cache(() => prisma.prometheus.findFirst(ACTIVE)),
}

/** The kind's active row, or `null` when none is configured. */
export function getActiveService<K extends ActiveServiceKind>(kind: K): Promise<ActiveRows[K] | null> {
  return loaders[kind]()
}
