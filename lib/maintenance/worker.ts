import { Worker, Job } from "bullmq"
import Redis from "ioredis"
import { createLogger } from "@/lib/utils/logger"
import type { ScanJobData, DeletionJobData } from "./queue"
import { scanForCandidates } from "./scanner"
import { executeDeletions } from "./deleter"
import { syncAllRuleSchedules } from "./scheduler"

const logger = createLogger("maintenance-worker")

// Create Redis connection for workers
const connection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
})

// Use hash tag prefix for Redis Cluster compatibility
// Must match the prefix used in queue.ts
const QUEUE_PREFIX = "{plex-manager}"

// Maintenance worker - scans for candidates based on rules
export const maintenanceWorker = new Worker<ScanJobData>(
  "maintenance",
  async (job: Job<ScanJobData>) => {
    const { ruleId, manualTrigger } = job.data

    logger.info("Starting maintenance scan", {
      jobId: job.id,
      ruleId,
      manualTrigger,
    })

    await job.updateProgress(10)

    try {
      const result = await scanForCandidates(ruleId, (progress) => {
        job.updateProgress(10 + progress * 0.9)
      })

      await job.updateProgress(100)

      logger.info("Maintenance scan completed", {
        jobId: job.id,
        ruleId,
        scanId: result.scanId,
        itemsScanned: result.itemsScanned,
        itemsFlagged: result.itemsFlagged,
      })

      return { candidatesFound: result.itemsFlagged }
    } catch (error) {
      logger.error("Maintenance scan failed", {
        jobId: job.id,
        ruleId,
        error,
      })
      throw error
    }
  },
  {
    connection,
    prefix: QUEUE_PREFIX,
    concurrency: 2,
    limiter: {
      max: 10,
      duration: 60000, // 10 jobs per minute
    },
  }
)

// Deletion worker - executes deletions (separate for safety, lower concurrency)
export const deletionWorker = new Worker<DeletionJobData>(
  "deletion",
  async (job: Job<DeletionJobData>) => {
    const { candidateIds, deleteFiles, userId } = job.data

    logger.info("Starting deletion job", {
      jobId: job.id,
      candidateCount: candidateIds.length,
      deleteFiles,
      userId,
    })

    await job.updateProgress(10)

    try {
      const result = await executeDeletions(
        candidateIds,
        deleteFiles,
        userId,
        (progress) => {
          job.updateProgress(10 + progress * 0.9)
        }
      )

      await job.updateProgress(100)

      logger.info("Deletion job completed", {
        jobId: job.id,
        candidateCount: candidateIds.length,
        deletedCount: result.success,
        failedCount: result.failed,
      })

      return {
        deletedCount: result.success,
        failedCount: result.failed,
        errors: result.errors,
      }
    } catch (error) {
      logger.error("Deletion job failed", {
        jobId: job.id,
        candidateCount: candidateIds.length,
        error,
      })
      throw error
    }
  },
  {
    connection,
    prefix: QUEUE_PREFIX,
    concurrency: 1, // Safety: only one deletion job at a time
  }
)

// Event handlers for monitoring
maintenanceWorker.on("completed", (job) => {
  logger.info("Maintenance job completed", { jobId: job.id })
})

maintenanceWorker.on("failed", (job, err) => {
  logger.error("Maintenance job failed", { jobId: job?.id, error: err })
})

deletionWorker.on("completed", (job) => {
  logger.info("Deletion job completed", { jobId: job.id })
})

deletionWorker.on("failed", (job, err) => {
  logger.error("Deletion job failed", { jobId: job?.id, error: err })
})

// Initialize schedulers on startup with retry mechanism
const SCHEDULER_RETRY_DELAY_MS = 30000

const initializeSchedulers = async (isRetry = false): Promise<void> => {
  try {
    logger.info(isRetry ? "Retrying maintenance rule scheduler initialization" : "Initializing maintenance rule schedulers")
    await syncAllRuleSchedules()
    logger.info("Maintenance rule schedulers initialized")
  } catch (error) {
    logger.error("Failed to initialize maintenance rule schedulers", { error })
    if (!isRetry) {
      logger.info(`Will retry scheduler initialization in ${SCHEDULER_RETRY_DELAY_MS / 1000}s`)
      setTimeout(() => initializeSchedulers(true), SCHEDULER_RETRY_DELAY_MS)
    }
  }
}

// Run initialization (non-blocking with retry on failure)
initializeSchedulers()

// Graceful shutdown
const shutdown = async () => {
  logger.info("Shutting down maintenance workers")

  try {
    await Promise.all([
      maintenanceWorker.close(),
      deletionWorker.close(),
      connection.quit(),
    ])
    logger.info("Maintenance workers shut down successfully")
  } catch (error) {
    logger.error("Error shutting down maintenance workers", { error })
  }
}

// Register shutdown handlers
process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
