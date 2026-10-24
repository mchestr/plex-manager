/**
 * Keeps a member's Discord linked role in step with their access (SEC-47).
 *
 * ## Overview
 *
 * Every change that can grant or remove access calls {@link enqueueRoleSync}:
 * `endUserSessions` (unshare, demotion, disable, the Stripe revoke), the Plex
 * grant job, the Stripe status writes and the admin subscription actions. It
 * queues one `DISCORD_ROLE_SYNC` job per member, deduplicated on
 * `discord:role:<userId>`, which pushes a fresh `is_subscribed` with the
 * stored watched hours. The daily `DISCORD_ROLE_RECONCILE` job
 * (`lib/queue/jobs/discord-role.ts`) catches anything an event missed and
 * recomputes the hours, as do a fresh link and the member's manual resync.
 *
 * ## Special Cases
 *
 * - The integration is off, or the member has no live link: nothing happens.
 * - No `REDIS_URL`: the sync runs inline, best effort; the daily reconcile
 *   needs the queue.
 * - {@link enqueueRoleSync} never throws: a role sync must never fail the
 *   access change that triggered it.
 *
 * @module
 */

import type { JobsOptions } from "bullmq"

import { getDiscordIntegration, syncDiscordRoleConnection } from "@/lib/discord/integration"
import type { RoleMetadataOptions } from "@/lib/discord/role-metadata"
import { prisma } from "@/lib/prisma"
import { isRedisConfigured } from "@/lib/queue/connection"
import {
  JOB_TYPES,
  type DiscordRoleSyncPayload,
  type DiscordRoleSyncResult,
  type RoleSyncReason,
} from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("DISCORD_ROLE_SYNC")

/** Stored on the connection when a sync fails; the error itself is only logged. */
const SYNC_FAILED_COPY = "Could not update your Discord role. It is retried automatically."

/** The job options of one member's sync: one pending job per member, 3 attempts. */
export function roleSyncJobOptions(userId: string): Partial<JobsOptions> {
  return { attempts: 3, deduplication: { id: `discord:role:${userId}` } }
}

/** Why a member's role cannot be synced, or null when it can. @internal */
async function roleSyncSkipReason(userId: string): Promise<DiscordRoleSyncResult["skipped"] | null> {
  if (!(await getDiscordIntegration())) {
    return "DISCORD_DISABLED"
  }
  const connection = await prisma.discordConnection.findUnique({
    where: { userId },
    select: { revokedAt: true },
  })
  return !connection || connection.revokedAt ? "NOT_LINKED" : null
}

/**
 * Syncs one member's linked-role metadata now. A failure stores fixed copy in
 * `DiscordConnection.lastError` and rethrows, so a queued job retries.
 *
 * @param payload - Who, why, and whether to recompute the watched hours.
 * @param options - The limiter and signal for the Tautulli call.
 */
export async function runRoleSync(
  { userId, reason, refreshHours }: DiscordRoleSyncPayload,
  options: Omit<RoleMetadataOptions, "refreshHours"> = {}
): Promise<DiscordRoleSyncResult> {
  const skipped = await roleSyncSkipReason(userId)
  if (skipped) {
    return { userId, synced: false, skipped }
  }

  try {
    await syncDiscordRoleConnection(userId, { ...options, refreshHours })
  } catch (error) {
    logger.warn("discord.role_sync_failed", { userId, reason, error })
    await prisma.discordConnection
      .updateMany({ where: { userId }, data: { lastError: SYNC_FAILED_COPY } })
      .catch(() => undefined)
    throw error
  }

  logger.info("Discord role synced", { userId, reason, refreshHours })
  return { userId, synced: true }
}

/**
 * Queues a re-sync of a member's linked role after their access changed. It
 * does nothing when the integration is off or the member is not linked, runs
 * the sync inline without Redis, and never throws.
 *
 * @param userId - The member whose access changed.
 * @param reason - What changed, for the logs.
 */
export async function enqueueRoleSync(userId: string, reason: RoleSyncReason): Promise<void> {
  try {
    if (await roleSyncSkipReason(userId)) {
      return
    }
    const payload: DiscordRoleSyncPayload = { userId, reason, refreshHours: false }
    if (!isRedisConfigured()) {
      await runRoleSync(payload)
      return
    }
    // Loaded on use, so the actions and auth paths that import this module never
    // load BullMQ; fails fast while Redis is down, since requests call this (P11.3)
    const { enqueueFromRequest } = await import("@/lib/queue/request-path")
    const queued = await enqueueFromRequest(JOB_TYPES.DISCORD_ROLE_SYNC, payload, roleSyncJobOptions(userId))
    if (!queued.ok) logger.warn("discord.role_sync_enqueue_failed", { userId, reason, code: queued.code })
  } catch (error) {
    logger.warn("discord.role_sync_enqueue_failed", { userId, reason, error })
  }
}
