/**
 * Queue Client
 *
 * Provides type-safe queue operations for adding and managing jobs.
 * All queue interactions should go through this module.
 */

import { Queue, QueueEvents, JobsOptions, type Job } from "bullmq"
import { getRedisConnection } from "./connection"
import { sanitizeJobId } from "./job-id"
import { traceQueue } from "./job-meta"
import { JOB_TYPES, JobType, JobPayloadMap, JobMetadata, QueueStats, JobStatus } from "./types"
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
function getQueue(): Queue {
  if (!queue) {
    // Jobs added in a request carry its id (lib/queue/job-meta.ts)
    queue = traceQueue(
      new Queue(QUEUE_NAME, {
        connection: getRedisConnection(),
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      })
    )
  }
  return queue
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

  const jobId = sanitizeJobId(options?.jobId ?? `${jobType}:${Date.now()}`)
  const job = await q.add(jobType, data, {
    ...options,
    jobId,
  })

  // Log only safe fields to avoid exposing sensitive data
  const dataRecord = data as unknown as Record<string, unknown>
  logger.info("Job added to queue", {
    jobId: job.id,
    jobType,
    userId: typeof dataRecord.userId === "string" ? dataRecord.userId : undefined,
    triggeredBy: typeof dataRecord.triggeredBy === "string" ? dataRecord.triggeredBy : undefined,
  })

  return job.id!
}

/**
 * Queue one member's watchlist sync. BullMQ deduplicates on
 * `watchlist:user:<userId>` while a job for the member is waiting or running,
 * so repeated triggers (the member's, an admin's) collapse into that job and
 * get its id back (P4.13).
 */
export function addWatchlistSyncUserJob(
  data: JobPayloadMap[typeof JOB_TYPES.WATCHLIST_SYNC_USER]
): Promise<string> {
  return addJob(JOB_TYPES.WATCHLIST_SYNC_USER, data, {
    deduplication: { id: `watchlist:user:${data.userId}` },
  })
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
 * Schedule a job on a cron pattern in a time zone, through BullMQ's job
 * scheduler. Upserting the same `schedulerId` again replaces the schedule.
 *
 * @param schedulerId - Unique ID for this scheduler
 * @param jobType - The type of job to schedule
 * @param data - Job payload
 * @param repeat - Cron `pattern` and IANA `tz`
 * @param options - Optional job options
 */
export async function scheduleCronJob<T extends JobType>(
  schedulerId: string,
  jobType: T,
  data: JobPayloadMap[T],
  repeat: { pattern: string; tz: string },
  options?: Partial<JobsOptions>
): Promise<void> {
  await getQueue().upsertJobScheduler(schedulerId, repeat, { name: jobType, data, opts: options })
  logger.info("Cron job scheduled", { schedulerId, jobType, ...repeat })
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

/** The states the admin page lists, newest job first. */
export const LISTED_JOB_STATUSES = ["waiting", "active", "completed", "failed", "delayed"] as const
export type ListedJobStatus = (typeof LISTED_JOB_STATUSES)[number]

function toMetadata(job: Job, status: JobStatus): JobMetadata {
  return {
    jobId: job.id!,
    jobType: job.name,
    status,
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
 * One page of jobs, newest first, and how many jobs match in all (UI-23).
 *
 * The total comes from `getJobCounts` for the filtered states. BullMQ cannot
 * count one job type, so with `jobType` every job in those states is read and
 * the matches are counted; BullMQ keeps at most a day of completed jobs and a
 * week of failed ones, so that stays small.
 */
export async function getJobPage(options: {
  status?: ListedJobStatus
  jobType?: JobType
  page: number
  pageSize: number
}): Promise<{ jobs: JobMetadata[]; total: number }> {
  const q = getQueue()
  const { status, jobType, page, pageSize } = options
  const statuses: readonly ListedJobStatus[] = status ? [status] : LISTED_JOB_STATUSES
  const start = (page - 1) * pageSize
  const end = start + pageSize - 1

  const read = async (from: number, to: number) => {
    const lists = await Promise.all(statuses.map(async (s) => (await q.getJobs([s], from, to)).map((job) => toMetadata(job, s))))
    return lists.flat().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  if (jobType) {
    const matching = (await read(0, -1)).filter((job) => job.jobType === jobType)
    return { jobs: matching.slice(start, end + 1), total: matching.length }
  }

  const counts = await q.getJobCounts(...statuses)
  const total = statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0)
  // One state pages in Redis; several merge their first `end + 1` jobs and slice.
  const jobs = status ? await read(start, end) : (await read(0, end)).slice(start, end + 1)
  return { jobs, total }
}

/**
 * How many workers are connected to the queue, read from the connections
 * BullMQ registers in Redis rather than from this process, so the answer holds
 * when the workers run elsewhere (P11.3).
 */
export async function getWorkerCount(): Promise<number> {
  return (await getQueue().getWorkers()).length
}

/**
 * Look up a job by the id it was added with, or `undefined` once BullMQ has
 * dropped it (completed jobs after a day, failed ones after seven).
 */
export async function findJob(jobId: string): Promise<Job | undefined> {
  return getQueue().getJob(sanitizeJobId(jobId))
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
 * Removes the job a deduplication id points at, when it is still waiting or
 * delayed, and frees the id. A running job cannot be removed and is left to
 * finish. Returns whether a job was removed.
 */
export async function removeDeduplicatedJob(deduplicationId: string): Promise<boolean> {
  const q = getQueue()
  const jobId = await q.getDeduplicationJobId(deduplicationId)
  if (!jobId) return false
  const removed = await q.remove(jobId)
  if (removed > 0) await q.removeDeduplicationKey(deduplicationId)
  return removed > 0
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
