/**
 * Connection health for the settings page (P10.19) and the admin Overview
 * (P10.8): one `ConnectionStatus` per service, never an error message.
 *
 * ## Overview
 *
 * `getConnectionHealth()` runs the existing testers in `lib/connections/*`
 * in parallel for every active service row (each tester has its own 5 s
 * timeout), and caches the result for 5 minutes under the tag
 * `connection-health`, so a page that polls never runs a live upstream test
 * more than once per window. Revalidate the tag to re-check.
 *
 * | Service | Status |
 * |---|---|
 * | No active row | `notConfigured` |
 * | Tester succeeds | `ok` |
 * | Tester fails, throws or times out | `unreachable` |
 * | AI with `Config.llmDisabled` on | `degraded` ("Template copy", UI-31) |
 * | AI with a provider row | `ok` (no billed test call) |
 *
 * This is the smallest version P10.8 needs; P10.19 adds Discord, Stripe and
 * the other integrations and the `recheckConnections()` action.
 *
 * @module lib/settings/connection-health
 */

import "server-only"

import { unstable_cache } from "next/cache"

import { testJellyfinConnection } from "@/lib/connections/jellyfin-connection"
import { testOverseerrConnection } from "@/lib/connections/overseerr"
import { testPlexConnection } from "@/lib/connections/plex-connection"
import { testRadarrConnection } from "@/lib/connections/radarr"
import { testSonarrConnection } from "@/lib/connections/sonarr"
import { testTautulliConnection } from "@/lib/connections/tautulli"
import { prisma } from "@/lib/prisma"
import type { StatusValue } from "@/lib/ui/status"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("CONNECTION_HEALTH")

/** The cache tag; P10.19's `recheckConnections()` revalidates it. @internal */
export const CONNECTION_HEALTH_TAG = "connection-health"

type ConnectionId = "plex" | "jellyfin" | "tautulli" | "overseerr" | "sonarr" | "radarr" | "ai"

interface ConnectionHealthEntry {
  id: ConnectionId
  label: string
  status: StatusValue<"connection">
}

export interface ConnectionHealth {
  /** When the testers ran, as an ISO string (the cache serialises it). */
  checkedAt: string
  connections: ConnectionHealthEntry[]
}

type Tester = () => Promise<{ success: boolean }>

/** `ok` or `unreachable`; a thrown tester is logged without reaching the result. */
async function probe(id: ConnectionId, test: Tester): Promise<StatusValue<"connection">> {
  try {
    return (await test()).success ? "ok" : "unreachable"
  } catch (error) {
    logger.warn("Connection test threw", { id, error })
    return "unreachable"
  }
}

const SERVICE = { where: { isActive: true }, select: { name: true, url: true, publicUrl: true } } as const

/** Runs every tester now, without the cache. @internal */
export async function checkConnections(now: Date = new Date()): Promise<ConnectionHealth> {
  const [plex, jellyfin, tautulli, overseerr, sonarr, radarr, config, llmProviders] = await Promise.all([
    prisma.plexServer.findFirst({ ...SERVICE, select: { ...SERVICE.select, token: true } }),
    prisma.jellyfinServer.findFirst({ ...SERVICE, select: { ...SERVICE.select, apiKey: true } }),
    prisma.tautulli.findFirst({ ...SERVICE, select: { ...SERVICE.select, apiKey: true } }),
    prisma.overseerr.findFirst({ ...SERVICE, select: { ...SERVICE.select, apiKey: true } }),
    prisma.sonarr.findFirst({ ...SERVICE, select: { ...SERVICE.select, apiKey: true } }),
    prisma.radarr.findFirst({ ...SERVICE, select: { ...SERVICE.select, apiKey: true } }),
    prisma.config.findUnique({ where: { id: "config" }, select: { llmDisabled: true } }),
    prisma.lLMProvider.count({ where: { isActive: true } }),
  ])
  const publicUrl = (row: { publicUrl: string | null }) => row.publicUrl ?? undefined

  const tests: [ConnectionId, string, Tester | null][] = [
    ["plex", "Plex", plex && (() => testPlexConnection({ ...plex, publicUrl: publicUrl(plex) }))],
    ["jellyfin", "Jellyfin", jellyfin && (() => testJellyfinConnection({ ...jellyfin, publicUrl: publicUrl(jellyfin) }))],
    ["tautulli", "Tautulli", tautulli && (() => testTautulliConnection(tautulli))],
    ["overseerr", "Overseerr", overseerr && (() => testOverseerrConnection(overseerr))],
    ["sonarr", "Sonarr", sonarr && (() => testSonarrConnection({ ...sonarr, publicUrl: publicUrl(sonarr) }))],
    ["radarr", "Radarr", radarr && (() => testRadarrConnection({ ...radarr, publicUrl: publicUrl(radarr) }))],
  ]
  const services = await Promise.all(
    tests.map(async ([id, label, test]): Promise<ConnectionHealthEntry> => ({
      id,
      label,
      status: test ? await probe(id, test) : "notConfigured",
    }))
  )
  const ai: StatusValue<"connection"> = config?.llmDisabled ? "degraded" : llmProviders > 0 ? "ok" : "notConfigured"

  return { checkedAt: now.toISOString(), connections: [...services, { id: "ai", label: "AI", status: ai }] }
}

/** {@link checkConnections}, cached for 5 minutes under {@link CONNECTION_HEALTH_TAG}. */
export const getConnectionHealth = unstable_cache(() => checkConnections(), [CONNECTION_HEALTH_TAG], {
  tags: [CONNECTION_HEALTH_TAG],
  revalidate: 300,
})
