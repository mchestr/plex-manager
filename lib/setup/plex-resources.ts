/**
 * The Plex servers on a plex.tv account, for setup's Connect with Plex
 * (P10.25, UI-03).
 *
 * `GET https://clients.plex.tv/api/v2/resources?includeHttps=1&includeRelay=1`
 * with the account token lists every device on the account. Only those whose
 * `provides` includes `server` are kept. Each resource carries the server's
 * own `accessToken`: {@link readPlexResources} keeps it for the server-side
 * choice, and {@link toPickerServer} builds the browser's view without it.
 *
 * @module lib/setup/plex-resources
 */

import "server-only"

import { z } from "zod"

import { serviceFetch, type ServiceResult } from "@/lib/connections/http"
import { plexProduct } from "@/lib/brand"
import type { PickerServer, PlexServerConnection } from "@/types/setup"

const RESOURCES_URL = "https://clients.plex.tv/api/v2/resources?includeHttps=1&includeRelay=1"

const connectionSchema = z.looseObject({
  uri: z.url().max(2048),
  local: z.boolean().optional(),
  relay: z.boolean().optional(),
})

const resourceSchema = z.looseObject({
  name: z.string().max(200),
  clientIdentifier: z.string().min(1).max(200),
  provides: z.string().max(200).default(""),
  owned: z.boolean().optional(),
  presence: z.boolean().optional(),
  lastSeenAt: z.string().max(64).nullish(),
  productVersion: z.string().max(64).nullish(),
  platform: z.string().max(64).nullish(),
  accessToken: z.string().max(500).nullish(),
  connections: z.array(connectionSchema).default([]),
})

const resourcesSchema = z.array(resourceSchema)

/** A server as plex.tv lists it, its token included. Server-side only. */
export interface PlexResource extends PickerServer {
  accessToken: string | null
}

const rank = (connection: PlexServerConnection) => (connection.relay ? 2 : connection.local ? 0 : 1)

/** The servers on the account whose token this is. */
export async function readPlexResources(accountToken: string, clientId: string): Promise<ServiceResult<PlexResource[]>> {
  const result = await serviceFetch({
    service: "plex.tv",
    url: RESOURCES_URL,
    headers: { "X-Plex-Token": accountToken, "X-Plex-Client-Identifier": clientId, "X-Plex-Product": plexProduct },
    schema: resourcesSchema,
  })
  if (!result.ok) return result
  const servers = result.data
    .filter((resource) => resource.provides.split(",").includes("server"))
    .map((resource) => ({
      name: resource.name,
      machineIdentifier: resource.clientIdentifier,
      owned: resource.owned ?? false,
      online: resource.presence ?? false,
      lastSeenAt: resource.lastSeenAt ?? null,
      version: resource.productVersion ?? null,
      platform: resource.platform ?? null,
      accessToken: resource.accessToken ?? null,
      connections: resource.connections
        .map((connection) => ({ uri: connection.uri, local: connection.local ?? false, relay: connection.relay ?? false }))
        .sort((a, b) => rank(a) - rank(b)),
    }))
  return { ok: true, data: servers }
}

/** A resource as the browser may see it: every field named, so the token cannot slip through. */
export function toPickerServer(resource: PlexResource): PickerServer {
  return {
    machineIdentifier: resource.machineIdentifier,
    name: resource.name,
    owned: resource.owned,
    online: resource.online,
    lastSeenAt: resource.lastSeenAt,
    version: resource.version,
    platform: resource.platform,
    connections: resource.connections.map(({ uri, local, relay }) => ({ uri, local, relay })),
  }
}
