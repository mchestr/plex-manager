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
 * - `is_subscribed` (boolean) — whether the user currently has access to the
 *   active Plex server, determined live from the Plex.tv API.
 * - `watched_hours` (integer) — total streaming hours for the current year,
 *   derived from Tautulli. Only present when Tautulli is configured and the
 *   lookup succeeds (see "Special Cases").
 *
 * ## Special Cases
 *
 * - **Plex access indeterminate** → `is_subscribed` is `false`. If no active
 *   Plex server is configured, the user has no `plexUserId`, the access check
 *   fails, or the lookup throws, the user is treated as *not* subscribed.
 * - **Tautulli unavailable / failing** → `watched_hours` is simply omitted from
 *   the result (it is never emitted as `0` on failure). This preserves the
 *   original inline behavior where a Tautulli error left the key unset.
 *
 * These are boundary/external-service edge cases, so they are handled
 * defensively here even though internal callers are trusted.
 */

import { checkUserServerAccess } from "@/lib/connections/plex"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { fetchTautulliStatistics } from "@/lib/wrapped/statistics"

const logger = createLogger("DISCORD_ROLE_METADATA")

/**
 * Registered Discord metadata key for subscription status.
 *
 * Discord's role-connection schema keys are fixed by
 * `scripts/register-discord-metadata.ts`. This used to be configurable via a
 * `DiscordIntegration.metadataKey` column, but that column was removed; the key
 * is now a constant that must match the registered schema.
 */
export const IS_SUBSCRIBED_KEY = "is_subscribed"

/**
 * Registered Discord metadata key for total watched hours (current year).
 */
export const WATCHED_HOURS_KEY = "watched_hours"

/** The subset of the {@link User} record required to compute role metadata. */
export interface RoleMetadataUser {
  plexUserId: string | null
  email: string | null
}

/**
 * Resolves whether a user currently has access to the active Plex server.
 *
 * Kept local to this module rather than shared with the admin user-list copy
 * (`actions/user-queries.ts`): that copy returns `boolean | null` (leaving
 * "indeterminate" distinct from "no access") and lives inside a larger admin
 * query, whereas Linked-Roles needs a plain boolean and collapses
 * "indeterminate" to `false`. Sharing would change one caller's null handling,
 * so we keep the small duplication instead.
 *
 * @param user - The user's Plex identity.
 * @returns `true` only when the user demonstrably has access; `false` when
 *   access cannot be determined for any reason.
 *
 * @internal
 */
async function resolvePlexAccess(user: RoleMetadataUser): Promise<boolean> {
  try {
    const plexServer = await getActivePlexServerConfig()

    if (plexServer && user.plexUserId) {
      const accessResult = await checkUserServerAccess(
        {
          url: plexServer.url,
          token: plexServer.token,
          adminPlexUserId: plexServer.adminPlexUserId,
        },
        user.plexUserId
      )

      if (accessResult.success) {
        return accessResult.hasAccess
      }
    }
  } catch (error) {
    logger.warn("Failed to determine Plex access for Discord metadata", {
      error: error instanceof Error ? error.message : "unknown",
    })
  }

  // If we can't determine access from Plex, treat as not subscribed.
  return false
}

/**
 * Resolves the user's total watched hours for the current year from Tautulli.
 *
 * @param user - The user's Plex identity (matched to Tautulli by email/ID).
 * @returns The integer hour count, or `undefined` when Tautulli is not
 *   configured, the user has no `plexUserId`, or the lookup fails.
 *
 * @internal
 */
async function resolveWatchedHours(user: RoleMetadataUser): Promise<number | undefined> {
  try {
    const tautulli = await prisma.tautulli.findFirst({
      where: { isActive: true },
    })

    if (tautulli && user.plexUserId) {
      const year = new Date().getFullYear()
      const stats = await fetchTautulliStatistics(
        {
          url: tautulli.url,
          apiKey: tautulli.apiKey,
        },
        user.plexUserId,
        user.email,
        year
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
 * Returns `{ is_subscribed }` always, plus `{ watched_hours }` when it can be
 * determined. See the module JSDoc for the two fields and their edge cases.
 *
 * @param user - The user's Plex identity.
 * @returns The metadata object to push to Discord.
 *
 * @example
 * ```ts
 * const metadata = await computeRoleMetadata({ plexUserId: "123", email: "a@b.c" })
 * // { is_subscribed: true, watched_hours: 42 }
 * ```
 */
export async function computeRoleMetadata(
  user: RoleMetadataUser
): Promise<Record<string, boolean | number>> {
  const metadata: Record<string, boolean | number> = {}

  metadata[IS_SUBSCRIBED_KEY] = await resolvePlexAccess(user)

  const watchedHours = await resolveWatchedHours(user)
  if (watchedHours !== undefined) {
    metadata[WATCHED_HOURS_KEY] = watchedHours
  }

  return metadata
}
