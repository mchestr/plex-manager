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
 *   paying, exempt or admin member) **and** currently has access to the active
 *   Plex server, checked live through the Plex.tv API (SEC-47).
 * - `watched_hours` (integer) — total streaming hours for the current year,
 *   derived from Tautulli.
 *
 * ## Hours: refreshed daily, reused otherwise
 *
 * The hours come from a full Tautulli history scan (RWP-17), so only a sync
 * with `refreshHours` (the daily reconcile, a fresh link or a manual resync)
 * runs it, through the caller's {@link UpstreamLimiter} (the reconcile passes
 * the Redis-backed Tautulli semaphore). Every other sync reuses the stored
 * `DiscordConnection.lastWatchedHours`.
 *
 * ## Special Cases
 *
 * - **Not entitled** → `is_subscribed` is `false`, and Plex is not asked.
 * - **No Plex identity** → `is_subscribed` is `false` when no active Plex
 *   server is configured or the user has no `plexUserId`.
 * - **Plex access unknown** → when plex.tv or the PMS cannot answer (the
 *   access check is `unknown`, or it throws), `metadata` is `null`: the caller
 *   pushes nothing and Discord keeps the stored values, so a timeout never
 *   removes a role (GAP-05).
 * - **Tautulli unavailable / failing** → the stored hours are reused; with
 *   none stored, `watched_hours` is omitted (never emitted as `0` on failure).
 *
 * These are boundary/external-service edge cases, so they are handled
 * defensively here even though internal callers are trusted.
 */

import { getAccessLevel } from "@/lib/access"
import { checkUserServerAccess } from "@/lib/connections/plex"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { directLimiter, type UpstreamLimiter } from "@/lib/wrapped/sources/watch-history-source"
import { fetchTautulliStatistics } from "@/lib/wrapped/tautulli-statistics"

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
  /** `DiscordConnection.lastWatchedHours`, reused unless the hours are refreshed. */
  lastWatchedHours: number | null
}

export interface RoleMetadataOptions {
  /** Recompute the hours from Tautulli instead of reusing the stored value. */
  refreshHours: boolean
  /** Admits the Tautulli call (default: no cap). */
  limiter?: UpstreamLimiter
  signal?: AbortSignal
}

export interface RoleMetadataResult {
  /** Null when Plex access is unknown: push nothing and keep Discord's stored values. */
  metadata: Record<string, boolean | number> | null
  /** The hours pushed, to store back as `lastWatchedHours`; null when unknown. */
  watchedHours: number | null
}

/**
 * Resolves whether a user currently has access to the active Plex server.
 *
 * @param user - The user's Plex identity.
 * @returns `true` when access is granted, `false` when it is denied or the
 *   user has no Plex identity, and `null` when Plex could not answer.
 *
 * @internal
 */
async function resolvePlexAccess(user: RoleMetadataUser): Promise<boolean | null> {
  try {
    const plexServer = await getActivePlexServerConfig()
    if (!plexServer || !user.plexUserId) return false

    const access = await checkUserServerAccess(
      {
        url: plexServer.url,
        token: plexServer.token,
        adminPlexUserId: plexServer.adminPlexUserId,
        machineIdentifier: plexServer.machineIdentifier,
      },
      user.plexUserId
    )
    if (access.status === "unknown") {
      logger.warn("Plex access unknown; keeping the stored Discord metadata", { userId: user.id, reason: access.reason })
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

/** Plex access counts only for an entitled member (SEC-47). Null when Plex could not answer. @internal */
async function resolveSubscribed(user: RoleMetadataUser): Promise<boolean | null> {
  if ((await getAccessLevel(user.id)) !== "full") {
    return false
  }
  return resolvePlexAccess(user)
}

/**
 * Resolves the user's total watched hours for the current year from Tautulli.
 *
 * @param user - The user's Plex identity (matched to Tautulli by account ID).
 * @returns The integer hour count, or `undefined` when Tautulli is not
 *   configured, the user has no `plexUserId`, or the lookup fails.
 *
 * @internal
 */
async function resolveWatchedHours(
  user: RoleMetadataUser,
  limiter: UpstreamLimiter,
  signal: AbortSignal | undefined
): Promise<number | undefined> {
  try {
    const tautulli = await prisma.tautulli.findFirst({
      where: { isActive: true },
    })

    const plexUserId = user.plexUserId
    if (tautulli && plexUserId) {
      const year = new Date().getFullYear()
      const stats = await limiter.run(
        "tautulli",
        () => fetchTautulliStatistics({ url: tautulli.url, apiKey: tautulli.apiKey }, { plexUserId }, year),
        { signal }
      )

      if (stats.success && stats.data) {
        // totalWatchTime is in MINUTES – convert to integer hours
        return Math.floor(stats.data.totalWatchTime / 60)
      }
    }
  } catch (error) {
    logger.warn("Failed to determine Tautulli watch time for Discord metadata", {
      error: error instanceof Error ? error.message : "unknown",
    })
  }

  return undefined
}

/**
 * Computes the Discord Linked-Roles metadata for a user.
 *
 * Returns `{ is_subscribed }`, plus `{ watched_hours }` when it is known, or
 * `metadata: null` when Plex access is unknown. See the module JSDoc for the
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
 *   { id: "user-1", plexUserId: "123", lastWatchedHours: 42 },
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
