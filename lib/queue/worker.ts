/**
 * Queue Worker
 *
 * Processes jobs from the queue. Runs within the Next.js server process.
 * Uses a dispatcher pattern to route jobs to appropriate handlers.
 */

import { Worker, Job } from "bullmq"
import { getRedisConnection } from "./connection"
import { getJobProcessor, getRegisteredJobTypes } from "./jobs"
import { QUEUE_NAME } from "./client"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("QUEUE_WORKER")

// Worker singleton
let worker: Worker | null = null

/**
 * Get worker concurrency from environment
 */
function getWorkerConcurrency(): number {
  const envConcurrency = process.env.QUEUE_WORKER_CONCURRENCY
  if (envConcurrency) {
    const parsed = parseInt(envConcurrency, 10)
    if (!isNaN(parsed) && parsed > 0) {
      return parsed
    }
  }
  return 5 // Default concurrency
}

/**
 * Start the queue worker
 * Safe to call multiple times - will only start once
 */
export async function startWorker(): Promise<void> {
  if (worker) {
    logger.debug("Worker already running")
    return
  }

  const concurrency = getWorkerConcurrency()
  const registeredTypes = getRegisteredJobTypes()

  logger.info("Starting queue worker", {
    concurrency,
    registeredJobTypes: registeredTypes,
  })

  worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const startTime = Date.now()
      const processor = getJobProcessor(job.name)

      if (!processor) {
        logger.error("No processor found for job type", undefined, {
          jobType: job.name,
          jobId: job.id,
        })
        throw new Error(`Unknown job type: ${job.name}`)
      }

      logger.debug("Processing job", {
        jobId: job.id,
        jobType: job.name,
        attempt: job.attemptsMade + 1,
      })

      try {
        const result = await processor(job)
        const duration = Date.now() - startTime

        logger.debug("Job processed successfully", {
          jobId: job.id,
          jobType: job.name,
          durationMs: duration,
        })

        return result
      } catch (error) {
        const duration = Date.now() - startTime

        logger.error("Job processing failed", error, {
          jobId: job.id,
          jobType: job.name,
          attempt: job.attemptsMade + 1,
          maxAttempts: job.opts.attempts,
          durationMs: duration,
        })

        throw error
      }
    },
    {
      connection: getRedisConnection(),
      concurrency,
      limiter: {
        max: 10, // Max 10 jobs
        duration: 1000, // per second
      },
    }
  )

  // Event handlers for monitoring
  worker.on("completed", (job, result) => {
    logger.info("Job completed", {
      jobId: job.id,
      jobType: job.name,
      result: summarizeResult(result),
    })
  })

  worker.on("failed", (job, error) => {
    const willRetry = job && job.attemptsMade < (job.opts.attempts ?? 3)
    logger.error("Job failed", error, {
      jobId: job?.id,
      jobType: job?.name,
      attempts: job?.attemptsMade,
      maxAttempts: job?.opts.attempts,
      willRetry,
    })
  })

  worker.on("error", (error) => {
    logger.error("Worker error", error)
  })

  worker.on("stalled", (jobId) => {
    logger.warn("Job stalled", { jobId })
  })

  worker.on("active", (job) => {
    logger.debug("Job started", {
      jobId: job.id,
      jobType: job.name,
    })
  })

  logger.info("Queue worker started", { concurrency })
}

/**
 * Stop the queue worker gracefully
 * Waits for current jobs to complete (with timeout)
 */
export async function stopWorker(): Promise<void> {
  if (!worker) {
    return
  }

  logger.info("Stopping queue worker...")

  try {
    // Close waits for current jobs to finish (30s timeout by default)
    await worker.close()
    worker = null
    logger.info("Queue worker stopped")
  } catch (error) {
    logger.error("Error stopping worker", error)
    // Force close if graceful close fails
    if (worker) {
      await worker.close(true)
      worker = null
    }
  }
}

/**
 * Check if the worker is running
 */
export function isWorkerRunning(): boolean {
  return worker !== null && !worker.closing
}

/**
 * Get worker status for monitoring
 */
export function getWorkerStatus(): {
  running: boolean
  closing: boolean
  concurrency: number
} {
  return {
    running: worker !== null,
    // worker.closing is a Promise when close is in progress, undefined otherwise
    closing: worker?.closing !== undefined,
    concurrency: getWorkerConcurrency(),
  }
}

/**
 * Summarize job result for logging (avoid logging large objects)
 */
function summarizeResult(result: unknown): unknown {
  if (result === null || result === undefined) {
    return result
  }

  if (typeof result === "object") {
    // For objects, just log key counts/success status
    const obj = result as Record<string, unknown>
    if ("success" in obj) {
      return { success: obj.success, ...countKeys(obj) }
    }
    return countKeys(obj)
  }

  return result
}

/**
 * Count numeric keys in an object for summary
 */
function countKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "number") {
      summary[key] = value
    } else if (typeof value === "boolean") {
      summary[key] = value
    }
  }
  return summary
}
