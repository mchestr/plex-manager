/**
 * Discord Linked-Roles metadata computation.
 *
 * ## Overview
 *
 * Discord "Linked Roles" let a server grant roles based on a small set of
 * per-user metadata fields that this application reports back to Discord. This
 * module computes those fields for a given user; the transport (pushing the
 * values to Discord via {@link updateDiscordRoleConnection}) lives in
 * `integration.ts`.
 *
 * Exactly two metadata fields are reported, matching the schema registered by
 * `scripts/register-discord-metadata.ts`:
 *
 * - `is_subscribed` (boolean) — whether the user is entitled
 *   (`getAccessLevel(userId) === "full"`: not disabled and, with Stripe on, a
 *   paying, exempt or admin member) **and** currently has access on one of
 *   their services (P11.12): a Plex share on the active server, checked live
 *   through the Plex.tv API (SEC-47), or a Jellyfin account on the active
 *   server that exists and is not disabled.
 * - `watched_hours` (integer) — hours watched in the member's current year,
 *   from their stored v3 Rewind or a bounded read of their history
 *   (`getMemberYearStats`, RWP-17).
 *
 * ## Hours: refreshed daily, reused otherwise
 *
 * Only a sync with `refreshHours` (the daily reconcile, a fresh link or a
 * manual resync) reads the hours, through the caller's {@link UpstreamLimiter}
 * (the reconcile passes the Redis-backed Tautulli semaphore). Every other sync
 * reuses the stored `DiscordConnection.lastWatchedHours`.
 *
 * ## Special Cases
 *
 * - **Not entitled** → `is_subscribed` is `false`, and no service is asked.
 * - **No service** → `is_subscribed` is `false` when the member has no
 *   account on an active server.
 * - **Access unknown** → when no service grants access and one could not
 *   answer (plex.tv or the PMS gives `unknown`, Jellyfin fails, or a check
 *   throws), `metadata` is `null`: the caller pushes nothing and Discord keeps
 *   the stored values, so a timeout never removes a role (GAP-05).
 * - **Stats unavailable** → the stored hours are reused; with none stored,
 *   `watched_hours` is omitted (never emitted as `0` on failure).
 *
 * These are boundary/external-service edge cases, so they are handled
 * defensively here even though internal callers are trusted.
 */

import { getAccessLevel } from "@/lib/access"
import { getJellyfinUserById } from "@/lib/connections/jellyfin-users"
import { checkUserServerAccess } from "@/lib/connections/plex"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { getMemberYearStats, memberStatsYear } from "@/lib/discord/stats/member-stats"
import { hoursOf } from "@/lib/discord/stats/year-stats"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { directLimiter, type UpstreamLimiter } from "@/lib/wrapped/sources/watch-history-source"

const logger = createLogger("DISCORD_ROLE_METADATA")

/**
 * Registered Discord metadata key for subscription status.
 *
 * Discord's role-connection schema keys are fixed by
 * `scripts/register-discord-metadata.ts`. This used to be configurable via a
 * `DiscordIntegration.metadataKey` column, but that column was removed; the key
 * is now a constant that must match the registered schema.
 *
 * @internal
 */
export const IS_SUBSCRIBED_KEY = "is_subscribed"

/**
 * Registered Discord metadata key for total watched hours (current year).
 *
 * @internal
 */
export const WATCHED_HOURS_KEY = "watched_hours"

/** What role metadata is computed from: the user and their stored hours. */
export interface RoleMetadataUser {
  id: string
  plexUserId: string | null
  jellyfinUserId: string | null
  /** `User.timezone`: the hours are for the member's current year in it. */
  timezone: string | null
  /** `DiscordConnection.lastWatchedHours`, reused unless the hours are refreshed. */
  lastWatchedHours: number | null
}

export interface RoleMetadataOptions {
  /** Recompute the hours instead of reusing the stored value. */
  refreshHours: boolean
  /** Admits the Tautulli calls (default: no cap). */
  limiter?: UpstreamLimiter
  signal?: AbortSignal
}

export interface RoleMetadataResult {
  /** Null when access is unknown: push nothing and keep Discord's stored values. */
  metadata: Record<string, boolean | number> | null
  /** The hours pushed, to store back as `lastWatchedHours`; null when unknown. */
  watchedHours: number | null
}

/**
 * Resolves whether a user currently has access to the active Plex server.
 *
 * @param plexUserId - The member's plex.tv account ID.
 * @returns `true` when access is granted, `false` when it is denied or no
 *   Plex server is active, and `null` when Plex could not answer.
 *
 * @internal
 */
async function resolvePlexAccess(userId: string, plexUserId: string): Promise<boolean | null> {
  try {
    const plexServer = await getActivePlexServerConfig()
    if (!plexServer) return false

    const access = await checkUserServerAccess(
      {
        url: plexServer.url,
        token: plexServer.token,
        adminPlexUserId: plexServer.adminPlexUserId,
        machineIdentifier: plexServer.machineIdentifier,
      },
      plexUserId
    )
    if (access.status === "unknown") {
      logger.warn("Plex access unknown; keeping the stored Discord metadata", { userId, reason: access.reason })
      return null
    }
    return access.status === "granted"
  } catch (error) {
    logger.warn("Failed to determine Plex access for Discord metadata", {
      error: error instanceof Error ? error.message : "unknown",
    })
    return null
  }
}

/**
 * Resolves whether the member's Jellyfin account on the active server exists
 * and is not disabled; `null` when Jellyfin could not answer.
 *
 * @internal
 */
async function resolveJellyfinAccess(userId: string, jellyfinUserId: string): Promise<boolean | null> {
  try {
    const server = await prisma.jellyfinServer.findFirst({ where: { isActive: true }, select: { url: true, apiKey: true } })
    if (!server) return false
    const result = await getJellyfinUserById(server, jellyfinUserId)
    if (result.notFound) return false
    const disabled = result.data?.Policy?.IsDisabled
    if (!result.success || typeof disabled !== "boolean") {
      logger.warn("Jellyfin access unknown; keeping the stored Discord metadata", { userId })
      return null
    }
    return !disabled
  } catch (error) {
    logger.warn("Failed to determine Jellyfin access for Discord metadata", {
      error: error instanceof Error ? error.message : "unknown",
    })
    return null
  }
}

/**
 * Access counts only for an entitled member (SEC-47), and then on any of
 * their services. Null when none grants it and one could not answer.
 *
 * @internal
 */
async function resolveSubscribed(user: RoleMetadataUser): Promise<boolean | null> {
  if ((await getAccessLevel(user.id)) !== "full") {
    return false
  }
  const access = await Promise.all([
    user.plexUserId ? resolvePlexAccess(user.id, user.plexUserId) : false,
    user.jellyfinUserId ? resolveJellyfinAccess(user.id, user.jellyfinUserId) : false,
  ])
  if (access.includes(true)) return true
  return access.includes(null) ? null : false
}

/**
 * Resolves the member's hours for their current year (`getMemberYearStats`:
 * the stored v3 Rewind, else at most 20 pages of history).
 *
 * @returns The integer hour count, or `undefined` when no stats could be read.
 *
 * @internal
 */
async function resolveWatchedHours(
  user: RoleMetadataUser,
  limiter: UpstreamLimiter,
  signal: AbortSignal | undefined
): Promise<number | undefined> {
  try {
    const { year, zone } = await memberStatsYear(user.timezone)
    const result = await getMemberYearStats(user.id, { year, zone, limiter, signal })
    if (result.ok) return hoursOf(result.stats)
  } catch (error) {
    logger.warn("Failed to determine watch time for Discord metadata", {
      error: error instanceof Error ? error.message : "unknown",
    })
  }

  return undefined
}

/**
 * Computes the Discord Linked-Roles metadata for a user.
 *
 * Returns `{ is_subscribed }`, plus `{ watched_hours }` when it is known, or
 * `metadata: null` when access is unknown. See the module JSDoc for the
 * two fields and their edge cases.
 *
 * @param user - The user, with their stored hours.
 * @param options - Whether to refresh the hours, and the limiter for Tautulli.
 * @returns The metadata to push, and the hours to store back.
 *
 * @example
 * ```ts
 * // An event-driven sync: no Tautulli call, the stored hours are pushed.
 * const { metadata } = await computeRoleMetadata(
 *   { id: "user-1", plexUserId: "123", jellyfinUserId: null, timezone: null, lastWatchedHours: 42 },
 *   { refreshHours: false }
 * )
 * // { is_subscribed: true, watched_hours: 42 }
 * ```
 */
export async function computeRoleMetadata(
  user: RoleMetadataUser,
  { refreshHours, limiter = directLimiter, signal }: RoleMetadataOptions
): Promise<RoleMetadataResult> {
  const subscribed = await resolveSubscribed(user)
  if (subscribed === null) return { metadata: null, watchedHours: user.lastWatchedHours }

  const metadata: Record<string, boolean | number> = {}
  metadata[IS_SUBSCRIBED_KEY] = subscribed

  const refreshed = refreshHours ? await resolveWatchedHours(user, limiter, signal) : undefined
  const watchedHours = refreshed ?? user.lastWatchedHours
  if (watchedHours !== null) {
    metadata[WATCHED_HOURS_KEY] = watchedHours
  }

  return { metadata, watchedHours }
}
