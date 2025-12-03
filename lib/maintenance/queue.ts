import { Queue } from "bullmq"
import Redis from "ioredis"

// Create Redis connection for BullMQ
// Set maxRetriesPerRequest: null for BullMQ compatibility
const connection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
})

// Use hash tag prefix for Redis Cluster compatibility
// The {plex-manager} tag ensures all queue keys land on the same hash slot
// This prevents "script tried accessing undeclared key" errors in cluster mode
const QUEUE_PREFIX = "{plex-manager}"

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

// Maintenance queue for scanning and finding candidates
export const maintenanceQueue = new Queue<ScanJobData>("maintenance", {
  connection,
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

// Separate deletion queue for safety (separate concurrency control)
export const deletionQueue = new Queue<DeletionJobData>("deletion", {
  connection,
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

// Note: QueueScheduler is deprecated in BullMQ v4+
// Repeatable jobs are now handled directly by the Queue class
// Use queue.add() with repeat options instead
