/**
 * Discord linked-role jobs (P4.18, SEC-47).
 *
 * - `DISCORD_ROLE_SYNC` (`{ userId, reason, refreshHours }`, 3 attempts,
 *   deduplicated on `discord:role:<userId>`): pushes one member's metadata
 *   (`lib/discord/role-sync.ts`). With `refreshHours` the Tautulli scan runs
 *   through the Redis-backed Tautulli semaphore (P2.5).
 * - `DISCORD_ROLE_RECONCILE`: the daily safety net, scheduled at 04:00 in the
 *   server zone. It queues a `refreshHours` sync for every live link whose
 *   `metadataSyncedAt` is missing or more than 20 hours old, at most 25 a
 *   minute, and stops early at shutdown (the rows it missed stay stale for the
 *   next run).
 *
 * @module
 */

import type { Job } from "bullmq"

import { getDiscordIntegration } from "@/lib/discord/integration"
import { roleSyncJobOptions, runRoleSync } from "@/lib/discord/role-sync"
import { shutdownSignal } from "@/lib/instrumentation/shutdown"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { normalizeTimeZone } from "@/lib/utils/zoned-time"
import { directLimiter } from "@/lib/wrapped/sources/watch-history-source"

import { addJob } from "../client"
import { redisLimiter } from "../redis-semaphore"
import {
  JOB_TYPES,
  type DiscordRoleReconcileResult,
  type DiscordRoleSyncPayload,
  type DiscordRoleSyncResult,
} from "../types"

const logger = createLogger("DISCORD_ROLE_JOBS")

/** A connection synced longer ago than this is stale. @internal */
export const ROLE_STALE_AFTER_MS = 20 * 60 * 60 * 1000
/** The reconcile queues at most this many syncs per {@link RECONCILE_BATCH_INTERVAL_MS}. @internal */
export const RECONCILE_BATCH_SIZE = 25
const RECONCILE_BATCH_INTERVAL_MS = 60_000
/** A single sync's budget, Tautulli scan included. */
const SYNC_LIMIT_MS = 2 * 60_000

/** The scheduler id and cron pattern of the daily reconcile. */
export const ROLE_RECONCILE_SCHEDULER_ID = "discord-role-reconcile"
export const ROLE_RECONCILE_PATTERN = "0 4 * * *"

/** The zone the reconcile runs in: `Config.timezone`, else `TZ`, else UTC (as `serverZone()`). */
export async function reconcileTimeZone(): Promise<string> {
  const config = await prisma.config.findUnique({ where: { id: "config" }, select: { timezone: true } })
  return normalizeTimeZone(config?.timezone) ?? normalizeTimeZone(process.env.TZ) ?? "UTC"
}

/** Resolves after `ms`, or as soon as `signal` aborts. @internal */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener("abort", done, { once: true })
  })
}

/** Processes a `DISCORD_ROLE_SYNC` job; a failure throws for BullMQ's retry. @internal */
export async function processDiscordRoleSync(job: Job<DiscordRoleSyncPayload>): Promise<DiscordRoleSyncResult> {
  return runRoleSync(job.data, {
    limiter: job.data.refreshHours ? redisLimiter : directLimiter,
    signal: AbortSignal.any([AbortSignal.timeout(SYNC_LIMIT_MS), shutdownSignal]),
  })
}

/**
 * Processes the daily `DISCORD_ROLE_RECONCILE` job.
 *
 * @param signal - Ends the pacing early (the shutdown signal in production).
 * @internal
 */
export async function processDiscordRoleReconcile(
  _job: Job,
  signal: AbortSignal = shutdownSignal
): Promise<DiscordRoleReconcileResult> {
  if (!(await getDiscordIntegration())) {
    return { enqueued: 0, stale: 0, skipped: "DISCORD_DISABLED" }
  }

  const staleBefore = new Date(Date.now() - ROLE_STALE_AFTER_MS)
  const stale = await prisma.discordConnection.findMany({
    where: {
      revokedAt: null,
      OR: [{ metadataSyncedAt: null }, { metadataSyncedAt: { lt: staleBefore } }],
    },
    select: { userId: true },
    orderBy: { metadataSyncedAt: { sort: "asc", nulls: "first" } },
  })

  let enqueued = 0
  for (const [index, { userId }] of stale.entries()) {
    if (index > 0 && index % RECONCILE_BATCH_SIZE === 0) {
      await pause(RECONCILE_BATCH_INTERVAL_MS, signal)
    }
    if (signal.aborted) break
    await addJob(
      JOB_TYPES.DISCORD_ROLE_SYNC,
      { userId, reason: "reconcile", refreshHours: true },
      roleSyncJobOptions(userId)
    )
    enqueued++
  }

  logger.info("Discord role reconcile queued syncs", { stale: stale.length, enqueued })
  return { enqueued, stale: stale.length }
}

/** The processor for a Discord role job type, or null. */
export function getDiscordRoleProcessor(jobType: string): ((job: Job) => Promise<unknown>) | null {
  switch (jobType) {
    case JOB_TYPES.DISCORD_ROLE_SYNC:
      return processDiscordRoleSync as (job: Job) => Promise<unknown>
    case JOB_TYPES.DISCORD_ROLE_RECONCILE:
      return (job: Job) => processDiscordRoleReconcile(job)
    default:
      return null
  }
}
