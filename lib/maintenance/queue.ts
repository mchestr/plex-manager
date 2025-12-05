import { Queue } from "bullmq"
import Redis from "ioredis"

// Job data interfaces
export interface ScanJobData {
  ruleId: string
  manualTrigger?: boolean
}

export interface DeletionJobData {
  candidateIds: string[]
  deleteFiles: boolean
  userId: string
}

// Check if Redis is configured (REDIS_URL is set)
// Skip queue operations in environments without Redis (e.g., E2E tests, local dev without Redis)
export function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL
}

// Use hash tag prefix for Redis Cluster compatibility
// The {plex-manager} tag ensures all queue keys land on the same hash slot
// This prevents "script tried accessing undeclared key" errors in cluster mode
const QUEUE_PREFIX = "{plex-manager}"

// Lazy initialization for Redis connection and queues
// This prevents connection errors in environments without Redis
let connection: Redis | null = null
let _maintenanceQueue: Queue<ScanJobData> | null = null
let _deletionQueue: Queue<DeletionJobData> | null = null

function getConnection(): Redis {
  if (!connection) {
    connection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    })
  }
  return connection
}

// Maintenance queue for scanning and finding candidates
export const maintenanceQueue = {
  get queue(): Queue<ScanJobData> {
    if (!_maintenanceQueue) {
      _maintenanceQueue = new Queue<ScanJobData>("maintenance", {
        connection: getConnection(),
        prefix: QUEUE_PREFIX,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
          removeOnComplete: {
            count: 100,
            age: 24 * 3600, // 24 hours
          },
          removeOnFail: {
            count: 1000,
            age: 7 * 24 * 3600, // 7 days
          },
        },
      })
    }
    return _maintenanceQueue
  },

  async add(...args: Parameters<Queue<ScanJobData>["add"]>) {
    if (!isRedisConfigured()) return null
    return this.queue.add(...args)
  },

  async upsertJobScheduler(...args: Parameters<Queue<ScanJobData>["upsertJobScheduler"]>) {
    if (!isRedisConfigured()) return
    return this.queue.upsertJobScheduler(...args)
  },

  async removeJobScheduler(...args: Parameters<Queue<ScanJobData>["removeJobScheduler"]>) {
    if (!isRedisConfigured()) return false
    return this.queue.removeJobScheduler(...args)
  },

  async getJobSchedulers(...args: Parameters<Queue<ScanJobData>["getJobSchedulers"]>) {
    if (!isRedisConfigured()) return []
    return this.queue.getJobSchedulers(...args)
  },
}

// Separate deletion queue for safety (separate concurrency control)
export const deletionQueue = {
  get queue(): Queue<DeletionJobData> {
    if (!_deletionQueue) {
      _deletionQueue = new Queue<DeletionJobData>("deletion", {
        connection: getConnection(),
        prefix: QUEUE_PREFIX,
        defaultJobOptions: {
          attempts: 2,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
          removeOnComplete: {
            count: 100,
            age: 24 * 3600, // 24 hours
          },
          removeOnFail: {
            count: 1000,
            age: 30 * 24 * 3600, // 30 days (keep deletion failures longer)
          },
        },
      })
    }
    return _deletionQueue
  },

  async add(...args: Parameters<Queue<DeletionJobData>["add"]>) {
    if (!isRedisConfigured()) return null
    return this.queue.add(...args)
  },
}

// Note: QueueScheduler is deprecated in BullMQ v4+
// Repeatable jobs are now handled directly by the Queue class
// Use queue.add() with repeat options instead
