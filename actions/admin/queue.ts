"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { addJob, addWatchlistSyncUserJob, pauseQueue, removeJob, resumeQueue, retryJob } from "@/lib/queue/client"
import { isRedisConfigured } from "@/lib/queue/connection"
import { JOB_TYPES } from "@/lib/queue/types"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"
import { userIdSchema } from "@/lib/validations/shared-schemas"

const logger = createLogger("ADMIN_QUEUE_ACTIONS")

/**
 * The page these actions change. Revalidating it refreshes the open page, so
 * no client reloads or `router.refresh()` calls are needed (BP-31). The page's
 * reads live in `lib/admin/queues.ts`.
 */
const QUEUES_PATH = "/admin/queues"

/** Every queue action spends one point of the per-admin `admin:queue` limit. */
const QUEUE_LIMIT = { name: "admin:queue" } as const

const NO_REDIS = fail("UPSTREAM_UNAVAILABLE", "Redis is not configured")

const jobIdInput = z.object({ jobId: z.string().min(1, "Invalid job ID").max(200, "Invalid job ID") })

/** Retry a failed job (admin only, audited). */
export const retryQueueJob = adminAction({
  input: jobIdInput,
  rateLimit: QUEUE_LIMIT,
  fallbackError: "Failed to retry job. Please try again.",
  handler: async ({ jobId }, { userId: adminId }) => {
    if (!isRedisConfigured()) return NO_REDIS

    await retryJob(jobId)

    logAuditEvent(AuditEventType.QUEUE_JOB_RETRIED, adminId, { jobId })
    logger.info("Job retried by admin", { jobId, adminId })

    revalidatePath(QUEUES_PATH)
    return ok(null)
  },
})

/** Remove a job from the queue (admin only, audited). */
export const removeQueueJob = adminAction({
  input: jobIdInput,
  rateLimit: QUEUE_LIMIT,
  fallbackError: "Failed to remove job. Please try again.",
  handler: async ({ jobId }, { userId: adminId }) => {
    if (!isRedisConfigured()) return NO_REDIS

    await removeJob(jobId)

    logAuditEvent(AuditEventType.QUEUE_JOB_REMOVED, adminId, { jobId })
    logger.info("Job removed by admin", { jobId, adminId })

    revalidatePath(QUEUES_PATH)
    return ok(null)
  },
})

/** Pause the queue, so it stops starting new jobs (admin only, audited). */
export const pauseJobQueue = adminAction({
  rateLimit: QUEUE_LIMIT,
  fallbackError: "Failed to pause queue. Please try again.",
  handler: async (_input, { userId: adminId }) => {
    if (!isRedisConfigured()) return NO_REDIS

    await pauseQueue()

    logAuditEvent(AuditEventType.QUEUE_PAUSED, adminId)
    logger.info("Queue paused by admin", { adminId })

    revalidatePath(QUEUES_PATH)
    return ok(null)
  },
})

/** Resume the queue (admin only, audited). */
export const resumeJobQueue = adminAction({
  rateLimit: QUEUE_LIMIT,
  fallbackError: "Failed to resume queue. Please try again.",
  handler: async (_input, { userId: adminId }) => {
    if (!isRedisConfigured()) return NO_REDIS

    await resumeQueue()

    logAuditEvent(AuditEventType.QUEUE_RESUMED, adminId)
    logger.info("Queue resumed by admin", { adminId })

    revalidatePath(QUEUES_PATH)
    return ok(null)
  },
})

/**
 * Trigger a watchlist sync job for one member, or for every member who opted
 * in when `userId` is absent (admin only, audited).
 */
export const triggerWatchlistSyncJob = adminAction({
  input: z.object({ userId: userIdSchema.optional() }),
  rateLimit: QUEUE_LIMIT,
  fallbackError: "Failed to trigger sync. Please try again.",
  handler: async ({ userId }, { userId: adminId }) => {
    if (!isRedisConfigured()) return NO_REDIS

    let jobId: string
    if (userId) {
      // The job skips a member who has not opted in (NOT_OPTED_IN), and joins
      // one already waiting or running for them.
      jobId = await addWatchlistSyncUserJob({ userId, triggeredBy: "admin", triggeredByUserId: adminId })

      logAuditEvent(AuditEventType.QUEUE_SYNC_TRIGGERED, adminId, { targetUserId: userId, syncType: "user", jobId })
      logger.info("User watchlist sync job triggered by admin", { userId, jobId, adminId })
    } else {
      jobId = await addJob(JOB_TYPES.WATCHLIST_SYNC_ALL, { triggeredBy: "admin" })

      logAuditEvent(AuditEventType.QUEUE_SYNC_TRIGGERED, adminId, { syncType: "all", jobId })
      logger.info("Batch watchlist sync job triggered by admin", { jobId, adminId })
    }

    revalidatePath(QUEUES_PATH)
    return ok({ jobId })
  },
})
