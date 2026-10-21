"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireAdmin } from "@/lib/admin"
import { addJob, addWatchlistSyncUserJob, pauseQueue, removeJob, resumeQueue, retryJob } from "@/lib/queue/client"
import { isRedisConfigured } from "@/lib/queue/connection"
import { JOB_TYPES } from "@/lib/queue/types"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("ADMIN_QUEUE_ACTIONS")

/**
 * The page these actions change. Revalidating it refreshes the open page, so
 * no client reloads or `router.refresh()` calls are needed (BP-31). The page's
 * reads live in `lib/admin/queues.ts`.
 */
const QUEUES_PATH = "/admin/queues"

// =============================================================================
// Rate Limiting for Server Actions
// =============================================================================

interface RateLimitEntry {
  count: number
  resetTime: number
}

const actionRateLimitStore = new Map<string, RateLimitEntry>()

// Rate limit config: 30 actions per minute per admin user
const RATE_LIMIT_WINDOW_MS = 60000
const RATE_LIMIT_MAX = 30

/**
 * Check if an admin action is rate limited
 * Returns true if rate limit exceeded
 */
function isRateLimited(adminId: string): boolean {
  const now = Date.now()
  const key = `queue:${adminId}`
  const entry = actionRateLimitStore.get(key)

  if (!entry || now > entry.resetTime) {
    actionRateLimitStore.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS })
    return false
  }

  entry.count++
  if (entry.count > RATE_LIMIT_MAX) {
    return true
  }

  return false
}

// =============================================================================
// Validation Schemas
// =============================================================================

const jobIdSchema = z.object({
  jobId: z.string().min(1),
})

const triggerSyncSchema = z.object({
  userId: z.string().optional(),
})

type ActionResult = { success: true } | { success: false; error: string }

/** The admin's id, or the failure to return: signed out, rate limited or no Redis. */
async function guard(): Promise<{ adminId: string } | { success: false; error: string }> {
  let session: Awaited<ReturnType<typeof requireAdmin>>
  try {
    session = await requireAdmin()
  } catch {
    return { success: false, error: "Unauthorized" }
  }

  const adminId = session.user.id
  if (isRateLimited(adminId)) {
    return { success: false, error: "Too many requests. Please try again later." }
  }
  if (!isRedisConfigured()) {
    return { success: false, error: "Redis is not configured" }
  }
  return { adminId }
}

// =============================================================================
// Job Management Actions
// =============================================================================

/**
 * Retry a failed job
 */
export async function retryQueueJob(input: unknown): Promise<ActionResult> {
  const guarded = await guard()
  if (!("adminId" in guarded)) return guarded
  const { adminId } = guarded

  const validated = jobIdSchema.safeParse(input)
  if (!validated.success) {
    return { success: false, error: "Invalid job ID" }
  }

  try {
    await retryJob(validated.data.jobId)

    logAuditEvent(AuditEventType.QUEUE_JOB_RETRIED, adminId, {
      jobId: validated.data.jobId,
    })
    logger.info("Job retried by admin", { jobId: validated.data.jobId, adminId })

    revalidatePath(QUEUES_PATH)
    return { success: true }
  } catch (error) {
    logger.error("Error retrying job", error, { jobId: validated.data.jobId })
    return { success: false, error: "Failed to retry job. Please try again." }
  }
}

/**
 * Remove a job from the queue
 */
export async function removeQueueJob(input: unknown): Promise<ActionResult> {
  const guarded = await guard()
  if (!("adminId" in guarded)) return guarded
  const { adminId } = guarded

  const validated = jobIdSchema.safeParse(input)
  if (!validated.success) {
    return { success: false, error: "Invalid job ID" }
  }

  try {
    await removeJob(validated.data.jobId)

    logAuditEvent(AuditEventType.QUEUE_JOB_REMOVED, adminId, {
      jobId: validated.data.jobId,
    })
    logger.info("Job removed by admin", { jobId: validated.data.jobId, adminId })

    revalidatePath(QUEUES_PATH)
    return { success: true }
  } catch (error) {
    logger.error("Error removing job", error, { jobId: validated.data.jobId })
    return { success: false, error: "Failed to remove job. Please try again." }
  }
}

// =============================================================================
// Queue Control Actions
// =============================================================================

/**
 * Pause the queue (stops processing new jobs)
 */
export async function pauseJobQueue(): Promise<ActionResult> {
  const guarded = await guard()
  if (!("adminId" in guarded)) return guarded
  const { adminId } = guarded

  try {
    await pauseQueue()

    logAuditEvent(AuditEventType.QUEUE_PAUSED, adminId)
    logger.info("Queue paused by admin", { adminId })

    revalidatePath(QUEUES_PATH)
    return { success: true }
  } catch (error) {
    logger.error("Error pausing queue", error)
    return { success: false, error: "Failed to pause queue. Please try again." }
  }
}

/**
 * Resume the queue
 */
export async function resumeJobQueue(): Promise<ActionResult> {
  const guarded = await guard()
  if (!("adminId" in guarded)) return guarded
  const { adminId } = guarded

  try {
    await resumeQueue()

    logAuditEvent(AuditEventType.QUEUE_RESUMED, adminId)
    logger.info("Queue resumed by admin", { adminId })

    revalidatePath(QUEUES_PATH)
    return { success: true }
  } catch (error) {
    logger.error("Error resuming queue", error)
    return { success: false, error: "Failed to resume queue. Please try again." }
  }
}

// =============================================================================
// Watchlist Sync Actions
// =============================================================================

/**
 * Trigger a watchlist sync job (single user or all enabled users)
 */
export async function triggerWatchlistSyncJob(
  input: unknown
): Promise<{ success: true; data: { jobId: string } } | { success: false; error: string }> {
  const guarded = await guard()
  if (!("adminId" in guarded)) return guarded
  const { adminId } = guarded

  const validated = triggerSyncSchema.safeParse(input)
  if (!validated.success) {
    return { success: false, error: "Invalid input" }
  }

  try {
    const { userId } = validated.data
    let jobId: string

    if (userId) {
      // Sync specific user. The job skips a member who has not opted in
      // (NOT_OPTED_IN), and joins one already waiting or running for them.
      jobId = await addWatchlistSyncUserJob({
        userId,
        triggeredBy: "admin",
        triggeredByUserId: adminId,
      })

      logAuditEvent(AuditEventType.QUEUE_SYNC_TRIGGERED, adminId, {
        targetUserId: userId,
        syncType: "user",
        jobId,
      })
      logger.info("User watchlist sync job triggered by admin", { userId, jobId, adminId })
    } else {
      // Sync all enabled users
      jobId = await addJob(JOB_TYPES.WATCHLIST_SYNC_ALL, {
        triggeredBy: "admin",
      })

      logAuditEvent(AuditEventType.QUEUE_SYNC_TRIGGERED, adminId, {
        syncType: "all",
        jobId,
      })
      logger.info("Batch watchlist sync job triggered by admin", { jobId, adminId })
    }

    revalidatePath(QUEUES_PATH)
    return { success: true, data: { jobId } }
  } catch (error) {
    logger.error("Error triggering sync job", error)
    return { success: false, error: "Failed to trigger sync. Please try again." }
  }
}
