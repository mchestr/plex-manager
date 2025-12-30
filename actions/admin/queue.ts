"use server"

import { requireAdmin } from "@/lib/admin"
import { createLogger } from "@/lib/utils/logger"
import {
  getQueueStats,
  getJobs,
  getJob,
  retryJob,
  removeJob,
  pauseQueue,
  resumeQueue,
  isQueuePaused,
  addJob,
  getJobSchedulers,
  scheduleRepeatingJob,
  removeScheduledJob,
} from "@/lib/queue/client"
import { isRedisConfigured, isRedisHealthy } from "@/lib/queue/connection"
import { JOB_TYPES, JobStatus, JobMetadata, QueueStats, QueueHealth } from "@/lib/queue/types"
import { isRegisteredJobType } from "@/lib/queue/jobs"
import { isWorkerRunning } from "@/lib/queue/worker"
import { isWatchlistSyncEnabled, getWatchlistSyncInterval } from "@/lib/watchlist/lock"
import { logAuditEvent, AuditEventType } from "@/lib/security/audit-log"
import { z } from "zod"

const logger = createLogger("ADMIN_QUEUE_ACTIONS")

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

const getJobsSchema = z.object({
  status: z.enum(["waiting", "active", "completed", "failed", "delayed"]).optional(),
  jobType: z.string().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(50),
})

const jobIdSchema = z.object({
  jobId: z.string().min(1),
})

const triggerSyncSchema = z.object({
  userId: z.string().optional(),
})

const updateScheduleSchema = z.object({
  intervalMinutes: z.number().min(1).max(1440),
})

// =============================================================================
// Types
// =============================================================================

export interface QueueDashboardData {
  stats: QueueStats
  isPaused: boolean
  workerRunning: boolean
  redisConnected: boolean
  schedulers: Array<{
    id: string
    pattern: string
    next: Date | null
  }>
}

export interface JobsResponse {
  jobs: JobMetadata[]
  page: number
  limit: number
  hasMore: boolean
}

// =============================================================================
// Dashboard Actions
// =============================================================================

/**
 * Get queue dashboard data including stats, status, and schedulers
 */
export async function getQueueDashboardData(): Promise<
  | { success: true; data: QueueDashboardData }
  | { success: false; error: string }
> {
  try {
    await requireAdmin()
  } catch {
    return { success: false, error: "Unauthorized" }
  }

  // Check if Redis is configured
  if (!isRedisConfigured()) {
    return {
      success: false,
      error: "Redis is not configured. Set REDIS_URL environment variable.",
    }
  }

  try {
    const [stats, isPaused, redisConnected, schedulers] = await Promise.all([
      getQueueStats(),
      isQueuePaused(),
      isRedisHealthy(),
      getJobSchedulers(),
    ])

    const workerRunning = isWorkerRunning()

    return {
      success: true,
      data: {
        stats,
        isPaused,
        workerRunning,
        redisConnected,
        schedulers: schedulers
          .filter((s) => s.id && s.pattern)
          .map((s) => ({
            id: s.id as string,
            pattern: s.pattern as string,
            next: s.next ? new Date(s.next) : null,
          })),
      },
    }
  } catch (error) {
    logger.error("Error fetching queue dashboard data", error)
    return {
      success: false,
      error: "Failed to load queue dashboard. Please try again.",
    }
  }
}

/**
 * Get queue health status for quick checks
 */
export async function getQueueHealth(): Promise<
  | { success: true; data: QueueHealth }
  | { success: false; error: string }
> {
  try {
    await requireAdmin()
  } catch {
    return { success: false, error: "Unauthorized" }
  }

  if (!isRedisConfigured()) {
    return {
      success: true,
      data: {
        redisConnected: false,
        workerRunning: false,
        isPaused: false,
        stats: {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          paused: 0,
          prioritized: 0,
        },
      },
    }
  }

  try {
    const [stats, isPaused, redisConnected] = await Promise.all([
      getQueueStats(),
      isQueuePaused(),
      isRedisHealthy(),
    ])

    return {
      success: true,
      data: {
        stats,
        isPaused,
        workerRunning: isWorkerRunning(),
        redisConnected,
      },
    }
  } catch (error) {
    logger.error("Error fetching queue health", error)
    return {
      success: false,
      error: "Failed to load queue health. Please try again.",
    }
  }
}

// =============================================================================
// Job Management Actions
// =============================================================================

/**
 * Get jobs with pagination and optional filtering
 */
export async function getQueueJobs(
  input: unknown
): Promise<{ success: true; data: JobsResponse } | { success: false; error: string }> {
  try {
    await requireAdmin()
  } catch {
    return { success: false, error: "Unauthorized" }
  }

  const validated = getJobsSchema.safeParse(input)
  if (!validated.success) {
    return { success: false, error: "Invalid input" }
  }

  if (!isRedisConfigured()) {
    return { success: false, error: "Redis is not configured" }
  }

  const { status, jobType, page, limit } = validated.data

  try {
    const start = (page - 1) * limit
    const end = start + limit - 1

    // Validate jobType if provided
    const validJobType = jobType && isRegisteredJobType(jobType) ? jobType : undefined

    const jobs = await getJobs({
      status: status as JobStatus | undefined,
      jobType: validJobType as (typeof JOB_TYPES)[keyof typeof JOB_TYPES] | undefined,
      start,
      end,
    })

    return {
      success: true,
      data: {
        jobs,
        page,
        limit,
        hasMore: jobs.length === limit,
      },
    }
  } catch (error) {
    logger.error("Error fetching jobs", error)
    return { success: false, error: "Failed to fetch jobs" }
  }
}

/**
 * Get a single job by ID
 */
export async function getQueueJob(
  input: unknown
): Promise<{ success: true; data: JobMetadata } | { success: false; error: string }> {
  try {
    await requireAdmin()
  } catch {
    return { success: false, error: "Unauthorized" }
  }

  const validated = jobIdSchema.safeParse(input)
  if (!validated.success) {
    return { success: false, error: "Invalid job ID" }
  }

  if (!isRedisConfigured()) {
    return { success: false, error: "Redis is not configured" }
  }

  try {
    const job = await getJob(validated.data.jobId)
    if (!job) {
      return { success: false, error: "Job not found" }
    }
    return { success: true, data: job }
  } catch (error) {
    logger.error("Error fetching job", error, { jobId: validated.data.jobId })
    return { success: false, error: "Failed to fetch job" }
  }
}

/**
 * Retry a failed job
 */
export async function retryQueueJob(
  input: unknown
): Promise<{ success: true } | { success: false; error: string }> {
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

  const validated = jobIdSchema.safeParse(input)
  if (!validated.success) {
    return { success: false, error: "Invalid job ID" }
  }

  if (!isRedisConfigured()) {
    return { success: false, error: "Redis is not configured" }
  }

  try {
    await retryJob(validated.data.jobId)

    logAuditEvent(AuditEventType.QUEUE_JOB_RETRIED, adminId, {
      jobId: validated.data.jobId,
    })
    logger.info("Job retried by admin", { jobId: validated.data.jobId, adminId })

    return { success: true }
  } catch (error) {
    logger.error("Error retrying job", error, { jobId: validated.data.jobId })
    return { success: false, error: "Failed to retry job. Please try again." }
  }
}

/**
 * Remove a job from the queue
 */
export async function removeQueueJob(
  input: unknown
): Promise<{ success: true } | { success: false; error: string }> {
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

  const validated = jobIdSchema.safeParse(input)
  if (!validated.success) {
    return { success: false, error: "Invalid job ID" }
  }

  if (!isRedisConfigured()) {
    return { success: false, error: "Redis is not configured" }
  }

  try {
    await removeJob(validated.data.jobId)

    logAuditEvent(AuditEventType.QUEUE_JOB_REMOVED, adminId, {
      jobId: validated.data.jobId,
    })
    logger.info("Job removed by admin", { jobId: validated.data.jobId, adminId })

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
export async function pauseJobQueue(): Promise<
  { success: true } | { success: false; error: string }
> {
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

  try {
    await pauseQueue()

    logAuditEvent(AuditEventType.QUEUE_PAUSED, adminId)
    logger.info("Queue paused by admin", { adminId })

    return { success: true }
  } catch (error) {
    logger.error("Error pausing queue", error)
    return { success: false, error: "Failed to pause queue. Please try again." }
  }
}

/**
 * Resume the queue
 */
export async function resumeJobQueue(): Promise<
  { success: true } | { success: false; error: string }
> {
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

  try {
    await resumeQueue()

    logAuditEvent(AuditEventType.QUEUE_RESUMED, adminId)
    logger.info("Queue resumed by admin", { adminId })

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

  const validated = triggerSyncSchema.safeParse(input)
  if (!validated.success) {
    return { success: false, error: "Invalid input" }
  }

  if (!isRedisConfigured()) {
    return { success: false, error: "Redis is not configured" }
  }

  try {
    const { userId } = validated.data

    if (userId) {
      // Sync specific user
      const jobId = await addJob(JOB_TYPES.WATCHLIST_SYNC_USER, {
        userId,
        triggeredBy: "admin",
      })

      logAuditEvent(AuditEventType.QUEUE_SYNC_TRIGGERED, adminId, {
        targetUserId: userId,
        syncType: "user",
        jobId,
      })
      logger.info("User watchlist sync job triggered by admin", { userId, jobId, adminId })

      return { success: true, data: { jobId } }
    } else {
      // Sync all enabled users
      const jobId = await addJob(JOB_TYPES.WATCHLIST_SYNC_ALL, {
        triggeredBy: "admin",
      })

      logAuditEvent(AuditEventType.QUEUE_SYNC_TRIGGERED, adminId, {
        syncType: "all",
        jobId,
      })
      logger.info("Batch watchlist sync job triggered by admin", { jobId, adminId })

      return { success: true, data: { jobId } }
    }
  } catch (error) {
    logger.error("Error triggering sync job", error)
    return { success: false, error: "Failed to trigger sync. Please try again." }
  }
}

/**
 * Update the watchlist sync schedule
 */
export async function updateWatchlistSyncSchedule(
  input: unknown
): Promise<{ success: true } | { success: false; error: string }> {
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

  const validated = updateScheduleSchema.safeParse(input)
  if (!validated.success) {
    return { success: false, error: "Invalid interval" }
  }

  if (!isRedisConfigured()) {
    return { success: false, error: "Redis is not configured" }
  }

  try {
    const { intervalMinutes } = validated.data
    const intervalMs = intervalMinutes * 60 * 1000

    // Check if sync is enabled
    const syncEnabled = await isWatchlistSyncEnabled()

    if (syncEnabled) {
      // Update or create the scheduler
      await scheduleRepeatingJob(
        "watchlist-sync-scheduled",
        JOB_TYPES.WATCHLIST_SYNC_ALL,
        { triggeredBy: "scheduled" },
        intervalMs
      )

      logAuditEvent(AuditEventType.QUEUE_SCHEDULE_UPDATED, adminId, {
        intervalMinutes,
        action: "updated",
      })
      logger.info("Watchlist sync schedule updated", { intervalMinutes, adminId })
    } else {
      // Remove the scheduler if sync is disabled
      await removeScheduledJob("watchlist-sync-scheduled")

      logAuditEvent(AuditEventType.QUEUE_SCHEDULE_UPDATED, adminId, {
        action: "removed",
        reason: "sync_disabled",
      })
      logger.info("Watchlist sync schedule removed (sync disabled)", { adminId })
    }

    return { success: true }
  } catch (error) {
    logger.error("Error updating sync schedule", error)
    return { success: false, error: "Failed to update schedule. Please try again." }
  }
}

/**
 * Get watchlist sync scheduler status
 */
export async function getWatchlistSyncSchedulerStatus(): Promise<
  | {
      success: true
      data: {
        enabled: boolean
        intervalMinutes: number
        nextRun: Date | null
      }
    }
  | { success: false; error: string }
> {
  try {
    await requireAdmin()
  } catch {
    return { success: false, error: "Unauthorized" }
  }

  try {
    const [syncEnabled, intervalMinutes, schedulers] = await Promise.all([
      isWatchlistSyncEnabled(),
      getWatchlistSyncInterval(),
      isRedisConfigured() ? getJobSchedulers() : Promise.resolve([]),
    ])

    const scheduler = schedulers.find((s) => s.id === "watchlist-sync-scheduled")

    return {
      success: true,
      data: {
        enabled: syncEnabled,
        intervalMinutes,
        nextRun: scheduler?.next ? new Date(scheduler.next) : null,
      },
    }
  } catch (error) {
    logger.error("Error fetching scheduler status", error)
    return { success: false, error: "Failed to fetch scheduler status" }
  }
}
