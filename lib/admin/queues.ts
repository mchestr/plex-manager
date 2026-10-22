import "server-only"

import {
  getJobPage,
  getJobSchedulers,
  getQueueStats,
  getWorkerCount,
  isQueuePaused,
  type ListedJobStatus,
} from "@/lib/queue/client"
import { getRequestPathRedis, isRedisConfigured, readyWithin } from "@/lib/queue/connection"
import { jobTypeLabel, type JobType, type QueueStats } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("ADMIN_QUEUES")

const REDIS_WAIT_MS = 2000

export interface QueueScheduler {
  id: string
  jobLabel: string
  /** `every` in ms, or a cron pattern. */
  everyMs: number | null
  pattern: string | null
  tz: string | null
  /** ISO time of the next run. */
  next: string | null
}

export interface QueueDashboard {
  redisConfigured: boolean
  redisConnected: boolean
  /** At least one worker connection is registered in Redis. */
  workerRunning: boolean
  /** `null` when Redis did not answer. */
  paused: boolean | null
  stats: QueueStats | null
  schedulers: QueueScheduler[]
}

const OFFLINE = { redisConnected: false, workerRunning: false, paused: null, stats: null, schedulers: [] }

/** Whether Redis answers within 2 s, on the fail-fast request-path client so the page never hangs. */
async function redisAnswers(): Promise<boolean> {
  try {
    const client = getRequestPathRedis()
    return (await readyWithin(client, REDIS_WAIT_MS)) && (await client.ping()) === "PONG"
  } catch {
    return false
  }
}

/** Workers registered in Redis; a Redis that refuses CLIENT LIST reads as none, with a warning. */
async function workersRunning(): Promise<boolean> {
  try {
    return (await getWorkerCount()) > 0
  } catch (error) {
    logger.warn("Could not list queue workers", { error: String(error) })
    return false
  }
}

/**
 * The queues page's state (P10.3): Redis, the workers as BullMQ registers
 * them in Redis (so it stays right once the workers leave the web process,
 * P11.3), pause, counts and schedulers.
 */
export async function getQueueDashboard(): Promise<QueueDashboard> {
  if (!isRedisConfigured()) return { redisConfigured: false, ...OFFLINE }
  if (!(await redisAnswers())) return { redisConfigured: true, ...OFFLINE }

  try {
    const [stats, paused, workerRunning, schedulers] = await Promise.all([
      getQueueStats(),
      isQueuePaused(),
      workersRunning(),
      getJobSchedulers(),
    ])
    return {
      redisConfigured: true,
      redisConnected: true,
      workerRunning,
      paused,
      stats,
      schedulers: schedulers.map((s) => ({
        id: s.id ?? s.key,
        jobLabel: jobTypeLabel(s.name),
        everyMs: s.every ?? null,
        pattern: s.pattern ?? null,
        tz: s.tz ?? null,
        next: s.next ? new Date(s.next).toISOString() : null,
      })),
    }
  } catch (error) {
    logger.error("Could not read the queue", error)
    return { redisConfigured: true, ...OFFLINE }
  }
}

/** One job as the jobs table shows it; never the payload or the result. */
export interface QueueJobRow {
  id: string
  typeLabel: string
  status: ListedJobStatus
  attempts: number
  maxAttempts: number
  createdAt: string
  durationMs: number | null
  error: string | null
}

export async function listQueueJobs(filters: {
  status?: ListedJobStatus
  jobType?: JobType
  page: number
  pageSize: number
}): Promise<{ rows: QueueJobRow[]; total: number }> {
  const { jobs, total } = await getJobPage(filters)
  return {
    total,
    rows: jobs.map((job) => ({
      id: job.jobId,
      typeLabel: jobTypeLabel(job.jobType),
      status: job.status as ListedJobStatus,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      createdAt: job.createdAt.toISOString(),
      durationMs: job.startedAt && job.finishedAt ? job.finishedAt.getTime() - job.startedAt.getTime() : null,
      error: job.error ?? null,
    })),
  }
}
