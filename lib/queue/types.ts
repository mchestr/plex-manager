/**
 * Queue Type Definitions
 *
 * Provides type-safe job definitions for all queue operations.
 * Add new job types here as the system grows.
 */

/**
 * Job Type Registry
 * Add new job types here when extending the queue system
 */
export const JOB_TYPES = {
  WATCHLIST_SYNC_USER: "watchlist:sync:user",
  WATCHLIST_SYNC_ALL: "watchlist:sync:all",
  STRIPE_WEBHOOK: "stripe:webhook",
  PLEX_ACCESS_GRANT: "plex:access:grant",
  PLEX_ACCESS_REVOKE: "plex:access:revoke",
  // Rewind batch jobs (P2.6), on the `rewind-batch` queue
  REWIND_SERVER_AGGREGATE: "rewind:server-aggregate",
  REWIND_METADATA_WARM: "rewind:metadata-warm",
} as const

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES]

/**
 * Job trigger source - who/what initiated the job
 */
type JobTrigger = "manual" | "scheduled" | "admin"

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
// Stripe Subscription Job Types
// =============================================================================

/**
 * Payload for processing a Stripe webhook event.
 *
 * Only the Stripe `event.id` is carried on the queue; the processor re-fetches
 * the full event from Stripe so it acts on Stripe's current truth and the queue
 * payload stays tiny.
 */
export interface StripeWebhookPayload {
  eventId: string
}

/**
 * Payload for granting a user Plex server access after a successful checkout.
 *
 * Keyed by the app user id; the processor loads the active Plex server and the
 * user's email at run time. (Plex effects are implemented in a later step.)
 */
export interface PlexAccessGrantPayload {
  userId: string
}

/**
 * Payload for revoking a user's Plex server access after cancellation.
 *
 * (Plex effects are implemented in a later step.)
 */
export interface PlexAccessRevokePayload {
  userId: string
}

/**
 * Result from processing a Stripe webhook event.
 */
export interface StripeWebhookResult {
  eventId: string
  eventType: string
  handled: boolean
}

/**
 * Result from a Plex access grant job.
 */
export interface PlexAccessGrantResult {
  userId: string
  granted: boolean
}

/**
 * Result from a Plex access revoke job.
 */
export interface PlexAccessRevokeResult {
  userId: string
  revoked: boolean
}

// =============================================================================
// Rewind Batch Job Types (P2.6)
// =============================================================================

/** The server-wide aggregate for one batch: `through` is its last day of data, `YYYY-MM-DD`. */
export interface RewindServerAggregatePayload {
  year: number
  through: string
}

/**
 * One metadata warm job: up to 200 film and series rating keys. `batch` names
 * the job in its deduplication id (`<year>:<index>`, or `refresh:<hash>` for
 * stale rows); `topSeries` are the keys whose season episode counts it adds.
 */
export interface RewindMetadataWarmPayload {
  batch: string
  keys: string[]
  topSeries: string[]
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
  [JOB_TYPES.STRIPE_WEBHOOK]: StripeWebhookPayload
  [JOB_TYPES.PLEX_ACCESS_GRANT]: PlexAccessGrantPayload
  [JOB_TYPES.PLEX_ACCESS_REVOKE]: PlexAccessRevokePayload
  [JOB_TYPES.REWIND_SERVER_AGGREGATE]: RewindServerAggregatePayload
  [JOB_TYPES.REWIND_METADATA_WARM]: RewindMetadataWarmPayload
}

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
