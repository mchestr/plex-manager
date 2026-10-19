/**
 * The member's own access token for this Plex server (SEC-48).
 *
 * ## Overview
 *
 * A request to the Plex server with the owner's token acts as the owner, so a
 * scrobble sent that way marks the item watched in the **owner's** history.
 * Each member who shares the server has their own server access token, which
 * plex.tv lists among the member's resources:
 *
 * 1. read `User.plexAuthToken` (the member's plex.tv sign-in);
 * 2. resolve this server's machine identifier (`GET /identity`);
 * 3. `GET https://clients.plex.tv/api/v2/resources?includeHttps=1` with the
 *    member's token, and take the `accessToken` of the resource whose
 *    `clientIdentifier` is that machine identifier.
 *
 * For the owner this yields the owner's own token, which is correct. A token
 * found is cached in memory for 10 minutes.
 *
 * ## Special Cases
 *
 * - No stored sign-in, or plex.tv rejects it (401/403): `NO_PLEX_SIGN_IN`.
 * - The member's resources do not include this server: `NO_SERVER_RESOURCE`.
 * - plex.tv or the server cannot be reached: `UNAVAILABLE`.
 *
 * @module
 */

import { z } from "zod"

import { serviceFetch } from "@/lib/connections/http"
import { getPlexServerIdentity } from "@/lib/connections/plex-connection"
import { getClientIdentifier, logger } from "@/lib/connections/plex-core"
import { prisma } from "@/lib/prisma"

const RESOURCES_URL = "https://clients.plex.tv/api/v2/resources?includeHttps=1"
const CACHE_TTL_MS = 10 * 60 * 1000

/**
 * Where and as whom a member-scoped Plex call goes. Only
 * {@link resolveMemberServerToken} builds one, so a caller cannot hand the
 * active server config (the owner's token) to a member-scoped call.
 */
export interface MemberServerAccess {
  kind: "member"
  url: string
  token: string
}

type MemberServerTokenFailure = "NO_PLEX_SIGN_IN" | "NO_SERVER_RESOURCE" | "UNAVAILABLE"

export type MemberServerTokenResult =
  | { ok: true; access: MemberServerAccess }
  | { ok: false; reason: MemberServerTokenFailure }

const resourcesSchema = z.array(
  z.object({
    clientIdentifier: z.string(),
    accessToken: z.string().nullish(),
  })
)

const cache = new Map<string, { token: string; expiresAt: number }>()

/** Empties the token cache. @internal Tests only. */
export function clearMemberTokenCache(): void {
  cache.clear()
}

/**
 * Resolves the member's own access token for the given Plex server.
 *
 * @param userId - The app user acting.
 * @param server - The active server's URL and owner token (used only for `/identity`).
 * @returns The member-scoped `{ url, token }`, or why there is none.
 */
export async function resolveMemberServerToken(
  userId: string,
  server: { url: string; token: string }
): Promise<MemberServerTokenResult> {
  const key = `${userId}|${server.url}`
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, access: { kind: "member", url: server.url, token: cached.token } }
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plexAuthToken: true } })
  if (!user?.plexAuthToken) {
    return { ok: false, reason: "NO_PLEX_SIGN_IN" }
  }

  const identity = await getPlexServerIdentity(server)
  if (!identity.success || !identity.machineIdentifier) {
    return { ok: false, reason: "UNAVAILABLE" }
  }

  let clientIdentifier: string
  try {
    clientIdentifier = getClientIdentifier()
  } catch {
    return { ok: false, reason: "UNAVAILABLE" }
  }

  const resources = await serviceFetch({
    service: "Plex",
    url: RESOURCES_URL,
    headers: { "X-Plex-Token": user.plexAuthToken, "X-Plex-Client-Identifier": clientIdentifier },
    schema: resourcesSchema,
  })
  if (!resources.ok) {
    const rejected = resources.code === "HTTP" && (resources.status === 401 || resources.status === 403)
    return { ok: false, reason: rejected ? "NO_PLEX_SIGN_IN" : "UNAVAILABLE" }
  }

  const token = resources.data.find((resource) => resource.clientIdentifier === identity.machineIdentifier)?.accessToken
  if (!token) {
    logger.info("Member has no resource for this Plex server", { userId })
    return { ok: false, reason: "NO_SERVER_RESOURCE" }
  }

  cache.set(key, { token, expiresAt: Date.now() + CACHE_TTL_MS })
  return { ok: true, access: { kind: "member", url: server.url, token } }
}
