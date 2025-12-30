/**
 * Queue Client
 *
 * Provides type-safe queue operations for adding and managing jobs.
 * All queue interactions should go through this module.
 */

import { Queue, QueueEvents, JobsOptions } from "bullmq"
import { getRedisConnection } from "./connection"
import { JobType, JobPayloadMap, JobMetadata, QueueStats, JobStatus } from "./types"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("QUEUE_CLIENT")

export const QUEUE_NAME = "plex-wrapped"

/**
 * Default job options applied to all jobs
 */
const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5000, // Start with 5s, then 10s, 20s...
  },
  removeOnComplete: {
    age: 24 * 60 * 60, // Keep completed jobs for 24 hours
    count: 1000, // Keep last 1000 completed jobs
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
  },
}

// Singleton instances
let queue: Queue | null = null
let queueEvents: QueueEvents | null = null

/**
 * Get the queue instance (creates if needed)
 */
export function getQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    })
  }
  return queue
}

/**
 * Get the queue events instance (creates if needed)
 * Useful for listening to job completion/failure events
 */
export function getQueueEvents(): QueueEvents {
  if (!queueEvents) {
    queueEvents = new QueueEvents(QUEUE_NAME, {
      connection: getRedisConnection(),
    })
  }
  return queueEvents
}

/**
 * Add a job to the queue with type safety
 *
 * @param jobType - The type of job to add
 * @param data - Job payload (type-checked based on jobType)
 * @param options - Optional job options to override defaults
 * @returns The job ID
 */
export async function addJob<T extends JobType>(
  jobType: T,
  data: JobPayloadMap[T],
  options?: Partial<JobsOptions>
): Promise<string> {
  const q = getQueue()

  const jobId = options?.jobId ?? `${jobType}:${Date.now()}`
  const job = await q.add(jobType, data, {
    ...options,
    jobId,
  })

  logger.info("Job added to queue", {
    jobId: job.id,
    jobType,
    data,
  })

  return job.id!
}

/**
 * Schedule a repeating job using BullMQ's job scheduler
 *
 * @param schedulerId - Unique ID for this scheduler
 * @param jobType - The type of job to schedule
 * @param data - Job payload
 * @param every - Interval in milliseconds
 * @param options - Optional job options
 */
export async function scheduleRepeatingJob<T extends JobType>(
  schedulerId: string,
  jobType: T,
  data: JobPayloadMap[T],
  every: number,
  options?: Partial<JobsOptions>
): Promise<void> {
  const q = getQueue()

  await q.upsertJobScheduler(
    schedulerId,
    { every },
    {
      name: jobType,
      data,
      opts: options,
    }
  )

  logger.info("Repeating job scheduled", {
    schedulerId,
    jobType,
    everyMs: every,
  })
}

/**
 * Remove a scheduled job
 */
export async function removeScheduledJob(schedulerId: string): Promise<boolean> {
  const q = getQueue()
  return q.removeJobScheduler(schedulerId)
}

/**
 * Get all job schedulers
 */
export async function getJobSchedulers() {
  const q = getQueue()
  return q.getJobSchedulers()
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<QueueStats> {
  const q = getQueue()
  const counts = await q.getJobCounts()

  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
    paused: counts.paused ?? 0,
    prioritized: counts.prioritized ?? 0,
  }
}

/**
 * Get jobs with pagination and optional filtering
 */
export async function getJobs(options: {
  status?: JobStatus
  jobType?: JobType
  start?: number
  end?: number
}): Promise<JobMetadata[]> {
  const q = getQueue()
  const { status, jobType, start = 0, end = 49 } = options

  // Get jobs by status or all statuses
  const statusTypes = status
    ? [status]
    : (["waiting", "active", "completed", "failed", "delayed"] as const)

  const allJobs = await Promise.all(statusTypes.map((s) => q.getJobs([s], start, end)))

  const jobs = allJobs
    .flat()
    .filter((job) => !jobType || job.name === jobType)
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))

  return Promise.all(
    jobs.map(async (job) => ({
      jobId: job.id!,
      jobType: job.name,
      status: (await job.getState()) as JobStatus,
      data: job.data,
      result: job.returnvalue,
      error: job.failedReason,
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? 3,
      createdAt: new Date(job.timestamp ?? Date.now()),
      startedAt: job.processedOn ? new Date(job.processedOn) : undefined,
      finishedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      progress: job.progress,
    }))
  )
}

/**
 * Get a single job by ID
 */
export async function getJob(jobId: string): Promise<JobMetadata | null> {
  const q = getQueue()
  const job = await q.getJob(jobId)

  if (!job) {
    return null
  }

  return {
    jobId: job.id!,
    jobType: job.name,
    status: (await job.getState()) as JobStatus,
    data: job.data,
    result: job.returnvalue,
    error: job.failedReason,
    attempts: job.attemptsMade,
    maxAttempts: job.opts.attempts ?? 3,
    createdAt: new Date(job.timestamp ?? Date.now()),
    startedAt: job.processedOn ? new Date(job.processedOn) : undefined,
    finishedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    progress: job.progress,
  }
}

/**
 * Retry a failed job
 */
export async function retryJob(jobId: string): Promise<void> {
  const q = getQueue()
  const job = await q.getJob(jobId)

  if (!job) {
    throw new Error(`Job ${jobId} not found`)
  }

  await job.retry()
  logger.info("Job retried", { jobId })
}

/**
 * Remove a job from the queue
 */
export async function removeJob(jobId: string): Promise<void> {
  const q = getQueue()
  const job = await q.getJob(jobId)

  if (!job) {
    throw new Error(`Job ${jobId} not found`)
  }

  await job.remove()
  logger.info("Job removed", { jobId })
}

/**
 * Pause the queue (stops processing new jobs)
 */
export async function pauseQueue(): Promise<void> {
  const q = getQueue()
  await q.pause()
  logger.info("Queue paused")
}

/**
 * Resume the queue
 */
export async function resumeQueue(): Promise<void> {
  const q = getQueue()
  await q.resume()
  logger.info("Queue resumed")
}

/**
 * Check if the queue is paused
 */
export async function isQueuePaused(): Promise<boolean> {
  const q = getQueue()
  return q.isPaused()
}

/**
 * Drain the queue (remove all jobs)
 * Use with caution!
 */
export async function drainQueue(): Promise<void> {
  const q = getQueue()
  await q.drain()
  logger.warn("Queue drained - all jobs removed")
}

/**
 * Clean old jobs from the queue
 */
export async function cleanQueue(options: {
  grace?: number // Time in ms to keep jobs
  limit?: number // Max jobs to remove
  status?: "completed" | "failed"
}): Promise<string[]> {
  const q = getQueue()
  const { grace = 0, limit = 1000, status = "completed" } = options

  const removed = await q.clean(grace, limit, status)
  logger.info("Queue cleaned", { removed: removed.length, status })
  return removed
}

/**
 * Close queue connections gracefully
 * Should be called during application shutdown
 */
export async function closeQueue(): Promise<void> {
  if (queue) {
    await queue.close()
    queue = null
  }
  if (queueEvents) {
    await queueEvents.close()
    queueEvents = null
  }
  logger.info("Queue closed")
}
