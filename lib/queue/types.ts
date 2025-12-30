/**
 * Queue Type Definitions
 *
 * Provides type-safe job definitions for all queue operations.
 * Add new job types here as the system grows.
 */

import { Job } from "bullmq"

/**
 * Job Type Registry
 * Add new job types here when extending the queue system
 */
export const JOB_TYPES = {
  WATCHLIST_SYNC_USER: "watchlist:sync:user",
  WATCHLIST_SYNC_ALL: "watchlist:sync:all",
} as const

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES]

/**
 * Job trigger source - who/what initiated the job
 */
export type JobTrigger = "manual" | "scheduled" | "admin"

// =============================================================================
// Watchlist Sync Job Types
// =============================================================================

/**
 * Payload for syncing a single user's watchlist
 */
export interface WatchlistSyncUserPayload {
  userId: string
  triggeredBy: JobTrigger
  triggeredByUserId?: string
}

/**
 * Payload for syncing all enabled users
 */
export interface WatchlistSyncAllPayload {
  triggeredBy: "scheduled" | "admin"
  triggeredByUserId?: string
}

/**
 * Result from syncing a single user's watchlist
 */
export interface WatchlistSyncUserResult {
  success: boolean
  itemsSynced: number
  itemsRequested: number
  itemsSkipped: number
  itemsFailed: number
  errors?: string[]
}

/**
 * Result from syncing all enabled users
 */
export interface WatchlistSyncAllResult {
  usersProcessed: number
  usersSucceeded: number
  usersFailed: number
}

// =============================================================================
// Type Mapping
// =============================================================================

/**
 * Maps job types to their payload types
 */
export interface JobPayloadMap {
  [JOB_TYPES.WATCHLIST_SYNC_USER]: WatchlistSyncUserPayload
  [JOB_TYPES.WATCHLIST_SYNC_ALL]: WatchlistSyncAllPayload
}

/**
 * Maps job types to their result types
 */
export interface JobResultMap {
  [JOB_TYPES.WATCHLIST_SYNC_USER]: WatchlistSyncUserResult
  [JOB_TYPES.WATCHLIST_SYNC_ALL]: WatchlistSyncAllResult
}

/**
 * Generic typed job - provides type safety for job data and results
 */
export type TypedJob<T extends JobType> = Job<JobPayloadMap[T], JobResultMap[T]>

// =============================================================================
// Job Metadata (for admin UI)
// =============================================================================

/**
 * Job status enum matching BullMQ states
 */
export type JobStatus =
  | "waiting"
  | "active"
  | "completed"
  | "failed"
  | "delayed"
  | "prioritized"
  | "waiting-children"

/**
 * Serializable job metadata for API responses and admin UI
 */
export interface JobMetadata {
  jobId: string
  jobType: string
  status: JobStatus
  data: unknown
  result?: unknown
  error?: string
  attempts: number
  maxAttempts: number
  createdAt: Date
  startedAt?: Date
  finishedAt?: Date
  processedOn?: number
  finishedOn?: number
  progress?: number | string | object | boolean
}

/**
 * Queue statistics
 */
export interface QueueStats {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
  paused: number
  prioritized: number
}

/**
 * Queue health status for admin dashboard
 */
export interface QueueHealth {
  redisConnected: boolean
  workerRunning: boolean
  isPaused: boolean
  stats: QueueStats
}
