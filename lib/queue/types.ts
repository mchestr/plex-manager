/**
 * Queue Type Definitions
 *
 * Provides type-safe job definitions for all queue operations.
 * Add new job types here as the system grows.
 */

import type { JobMeta } from "@/lib/queue/job-meta"
import type { DryRunInput } from "@/lib/rewind/dry-run/input"
import type { SessionRevocationReason } from "@/lib/session-revocation"
import type { GenerationAudience } from "@/lib/wrapped/pipeline/eligibility"
import type { WatchlistSkipCode } from "@/lib/watchlist/skip"

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
  // Discord linked-role metadata (P4.18)
  DISCORD_ROLE_SYNC: "discord:role:sync",
  DISCORD_ROLE_RECONCILE: "discord:role:reconcile",
  // Rewind batch jobs (P2.6), on the `rewind-batch` queue
  REWIND_SERVER_AGGREGATE: "rewind:server-aggregate",
  REWIND_METADATA_WARM: "rewind:metadata-warm",
  REWIND_GENERATE_USER: "rewind:generate:user",
  REWIND_STALE_SWEEP: "rewind:stale:sweep",
  // Season console (P7.8), on `rewind-batch`
  REWIND_SEASON_PREPARE: "rewind:season:prepare",
  REWIND_GENERATE_ALL: "rewind:generate:all",
  // The final cut (P8.5), on `rewind-batch`
  REWIND_FINAL_CUT: "rewind:final-cut",
  // Share cards (P5.10), on `rewind-aux`
  REWIND_CARD_PREWARM: "rewind:card:prewarm",
  REWIND_CARD_SWEEP: "rewind:card:sweep",
  // Admin dry runs (P7.10), on `rewind-aux`
  REWIND_DRY_RUN: "rewind:dry-run",
  // Ready notifications (P7.14), on `rewind-aux`
  REWIND_NOTIFY: "rewind:notify",
  // The season open's audience switch (P8.2), on `rewind-aux`
  REWIND_SEASON_OPEN: "rewind:season:open",
} as const

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES]

/** What the admin queues page calls each job type (P10.3). */
export const JOB_TYPE_LABELS: Record<JobType, string> = {
  [JOB_TYPES.WATCHLIST_SYNC_USER]: "Watchlist sync, one member",
  [JOB_TYPES.WATCHLIST_SYNC_ALL]: "Watchlist sync, everyone",
  [JOB_TYPES.STRIPE_WEBHOOK]: "Stripe event",
  [JOB_TYPES.PLEX_ACCESS_GRANT]: "Plex access grant",
  [JOB_TYPES.PLEX_ACCESS_REVOKE]: "Plex access removal",
  [JOB_TYPES.DISCORD_ROLE_SYNC]: "Discord role sync",
  [JOB_TYPES.DISCORD_ROLE_RECONCILE]: "Discord role check",
  [JOB_TYPES.REWIND_SERVER_AGGREGATE]: "Rewind server totals",
  [JOB_TYPES.REWIND_METADATA_WARM]: "Rewind metadata warm-up",
  [JOB_TYPES.REWIND_GENERATE_USER]: "Rewind generation",
  [JOB_TYPES.REWIND_STALE_SWEEP]: "Rewind stale sweep",
  [JOB_TYPES.REWIND_SEASON_PREPARE]: "Rewind season prepare",
  [JOB_TYPES.REWIND_GENERATE_ALL]: "Rewind generate all",
  [JOB_TYPES.REWIND_FINAL_CUT]: "Rewind final cut",
  [JOB_TYPES.REWIND_CARD_PREWARM]: "Rewind card prewarm",
  [JOB_TYPES.REWIND_CARD_SWEEP]: "Rewind card sweep",
  [JOB_TYPES.REWIND_DRY_RUN]: "Rewind dry run",
  [JOB_TYPES.REWIND_NOTIFY]: "Rewind ready notice",
  [JOB_TYPES.REWIND_SEASON_OPEN]: "Rewind season open",
}

/** The job types that run on the main `plex-wrapped` queue, in the order the filter lists them. */
export const MAIN_QUEUE_JOB_TYPES = [
  JOB_TYPES.WATCHLIST_SYNC_USER,
  JOB_TYPES.WATCHLIST_SYNC_ALL,
  JOB_TYPES.STRIPE_WEBHOOK,
  JOB_TYPES.PLEX_ACCESS_GRANT,
  JOB_TYPES.PLEX_ACCESS_REVOKE,
  JOB_TYPES.DISCORD_ROLE_SYNC,
  JOB_TYPES.DISCORD_ROLE_RECONCILE,
] as const satisfies readonly JobType[]

/** A job's label, or its raw name for a type this build does not know. */
export function jobTypeLabel(name: string): string {
  return (JOB_TYPE_LABELS as Record<string, string | undefined>)[name] ?? name
}

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
  /** Set when the job did not sync, with why (P4.5, P4.13). */
  skipped?: WatchlistSkipCode
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
 * Only the Stripe `event.id` is carried on the queue, so the payload stays tiny.
 * The processor fetches the event (a snapshot from event time) and re-reads the
 * subscription it names for the live state.
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
  /** Why the live re-check skipped the grant (SEC-38), when it did. */
  skipped?: string
}

/**
 * Result from a Plex access revoke job.
 */
export interface PlexAccessRevokeResult {
  userId: string
  revoked: boolean
}

// =============================================================================
// Discord Role Job Types (P4.18)
// =============================================================================

/**
 * Why a member's linked-role metadata is re-synced: every reason their
 * sessions end (through `endUserSessions`), plus the access changes that do
 * not end a session, and the daily reconcile.
 */
export type RoleSyncReason =
  | SessionRevocationReason
  | "enabled"
  | "access_granted"
  | "comp_granted"
  | "exemption_changed"
  | "subscription_changed"
  | "subscription_canceled"
  | "reconcile"

/**
 * Payload for re-syncing one member's linked-role metadata. Only the daily
 * reconcile sets `refreshHours`, which recomputes the watched hours from
 * Tautulli; every other sync pushes the stored hours.
 */
export interface DiscordRoleSyncPayload {
  userId: string
  reason: RoleSyncReason
  refreshHours: boolean
}

/** Result of a role sync: skipped when the integration is off or the member is not linked. */
export interface DiscordRoleSyncResult {
  userId: string
  synced: boolean
  skipped?: "DISCORD_DISABLED" | "NOT_LINKED"
}

/** Result of the daily reconcile: how many stale connections it queued. */
export interface DiscordRoleReconcileResult {
  enqueued: number
  stale: number
  skipped?: "DISCORD_DISABLED"
}

// =============================================================================
// Rewind Batch Job Types (P2.6)
// =============================================================================

/** The server-wide aggregate for one batch: `through` is its last day of data, `YYYY-MM-DD`. */
export interface RewindServerAggregatePayload {
  year: number
  through: string
  /**
   * `return` hands the warm batches back in the job's result instead of
   * enqueuing them, so `REWIND_SEASON_PREPARE` adds them as its children.
   */
  warm?: "enqueue" | "return"
  /** The full-year window with an earlier `through`: a staging rehearsal of the final cut (P8.5). */
  finalCut?: true
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
// Rewind Generation Job Types (they run on the Rewind queues, lib/queue/rewind-queues.ts)
// =============================================================================

/**
 * Payload for one member's Rewind generation. The `RewindGeneration` row the
 * request created carries everything else (kind, copy policy).
 */
export interface RewindGenerateUserPayload {
  generationId: string
  userId: string
  year: number
  /** A hide or unhide's regeneration (P7.7): it waits out a held lock and runs again when a hide arrived mid-run. */
  exclusion?: true
  /** How many times an exclusion run has waited for the member's lock. */
  lockWaits?: number
  /** Set by the season fan-out (P7.8): whose Rewinds it generates, and the batch's last data day. */
  audience?: GenerationAudience
  through?: string
  /** The final cut's full-year window, set by its fan-out (P8.5); with an early `through` only on staging. */
  finalCut?: true
}

/**
 * The season console's runs (P7.8). `audience` is `all` for the scheduled
 * season-open run and `config` for the buttons; `step` is the step-job
 * pattern's progress, so a retry resumes where it stopped.
 */
export interface RewindSeasonPreparePayload {
  year: number
  through: string
  audience: GenerationAudience
  triggeredBy: "scheduled" | "admin"
  step?: "aggregate" | "warm" | "generate" | "done"
}

/** Fans out one `REWIND_GENERATE_USER` per member; `scope: 'failed'` only those whose latest run failed. */
export interface RewindGenerateAllPayload {
  year: number
  through: string
  audience: GenerationAudience
  scope: "all" | "failed"
  /** `final-cut` children keep unchanged slots (`copyPolicy: 'changed-slots'`, P8.5); `season` when absent. */
  kind?: "season" | "final-cut"
  finalCut?: true
  step?: "fan-out" | "done"
}

/**
 * The final cut (P8.5): the full-year aggregate, the warm batches, then a
 * `final-cut` fan-out. `through` is `YYYY-12-31`, or an earlier day on a
 * staging rehearsal (`REWIND_STAGING=1`), which still reads the full-year window.
 */
export interface RewindFinalCutPayload {
  year: number
  through: string
  triggeredBy: "scheduled" | "admin" | "script"
  step?: "aggregate" | "warm" | "generate" | "done"
}

/** Renders the cover, centrefold and back cover of one completed Rewind with the member's saved options. */
export interface RewindCardPrewarmPayload {
  wrappedId: string
}

/** One admin dry run (P7.10): its preview id (also the job id), the admin, and the parsed input. */
export interface RewindDryRunPayload {
  previewId: string
  adminId: string
  input: DryRunInput
}

/**
 * One "your Rewind is ready" message (P7.14), deduplicated on
 * `rewind:notify:{year}:{userId}:{kind}`. `final-cut` tells December's
 * readers that their issue now includes December (P8.5).
 */
export interface RewindNotifyPayload {
  wrappedId: string
  userId: string
  year: number
  kind: "season" | "member" | "final-cut"
}

/**
 * The season open's audience switch (P8.2): at 08:00 on the opening day in
 * the server zone, Rewind opens to everyone once the season-open generation
 * is clean.
 */
export interface RewindSeasonOpenPayload {
  year: number
  triggeredBy: "scheduled"
}

// =============================================================================
// Type Mapping
// =============================================================================

/**
 * Maps job types to their payload types, each with the optional `_meta` a
 * job added in a request carries (`lib/queue/job-meta.ts`, P11.4)
 */
export type JobPayloadMap = { [K in keyof JobPayloads]: JobPayloads[K] & { _meta?: JobMeta } }

interface JobPayloads {
  [JOB_TYPES.WATCHLIST_SYNC_USER]: WatchlistSyncUserPayload
  [JOB_TYPES.WATCHLIST_SYNC_ALL]: WatchlistSyncAllPayload
  [JOB_TYPES.STRIPE_WEBHOOK]: StripeWebhookPayload
  [JOB_TYPES.PLEX_ACCESS_GRANT]: PlexAccessGrantPayload
  [JOB_TYPES.PLEX_ACCESS_REVOKE]: PlexAccessRevokePayload
  [JOB_TYPES.DISCORD_ROLE_SYNC]: DiscordRoleSyncPayload
  [JOB_TYPES.DISCORD_ROLE_RECONCILE]: Record<string, never>
  [JOB_TYPES.REWIND_SERVER_AGGREGATE]: RewindServerAggregatePayload
  [JOB_TYPES.REWIND_METADATA_WARM]: RewindMetadataWarmPayload
  [JOB_TYPES.REWIND_GENERATE_USER]: RewindGenerateUserPayload
  [JOB_TYPES.REWIND_STALE_SWEEP]: Record<string, never>
  [JOB_TYPES.REWIND_SEASON_PREPARE]: RewindSeasonPreparePayload
  [JOB_TYPES.REWIND_GENERATE_ALL]: RewindGenerateAllPayload
  [JOB_TYPES.REWIND_FINAL_CUT]: RewindFinalCutPayload
  [JOB_TYPES.REWIND_CARD_PREWARM]: RewindCardPrewarmPayload
  [JOB_TYPES.REWIND_CARD_SWEEP]: Record<string, never>
  [JOB_TYPES.REWIND_DRY_RUN]: RewindDryRunPayload
  [JOB_TYPES.REWIND_NOTIFY]: RewindNotifyPayload
  [JOB_TYPES.REWIND_SEASON_OPEN]: RewindSeasonOpenPayload
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
