/**
 * Queue Type Definitions
 *
 * Provides type-safe job definitions for all queue operations.
 * Add new job types here as the system grows.
 */

import { reviewJobId } from "@/lib/judge/job-id"
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
  // Plex access (P11.11)
  PLEX_ACCESS_GRANT: "plex:access:grant",
  PLEX_ACCESS_REVOKE: "plex:access:revoke",
  // Discord linked-role metadata (P4.18)
  DISCORD_ROLE_SYNC: "discord:role:sync",
  DISCORD_ROLE_RECONCILE: "discord:role:reconcile",
  // The daily retention sweep (P11.14)
  RETENTION_SWEEP: "retention:sweep",
  // Server stats in Discord channel names, and request limits from watch time
  DISCORD_CHANNEL_STATS: "discord:channel-stats",
  REQUEST_TIER_SYNC: "request-tiers:sync",
  // Each member's last seen from Tautulli, then the opt-in inactivity sweep
  MEMBER_ACTIVITY: "members:activity",
  // Stored secrets under the primary key (P11.1)
  SECRETS_REENCRYPT: "secrets:reencrypt",
  // One conversation judge review (lib/queue/jobs/conversation-review.ts)
  CONVERSATION_REVIEW: "judge:review",
  // The nightly sweep that queues them (lib/judge/sweep.ts)
  CONVERSATION_REVIEW_SWEEP: "judge:sweep",
  // An admin's test email (lib/email/send-test-email.ts)
  EMAIL_TEST: "email:test",
  // One warning email before the inactivity sweep removes a member (lib/queue/jobs/inactivity-notice.ts)
  INACTIVITY_NOTICE: "members:notice",
  // The admins' Discord alert about a member's new problem reports (lib/queue/jobs/problem-report-notify.ts)
  PROBLEM_REPORT_NOTIFY: "problem-report:notify",
  // One run of a problem report's fix, which waits by delaying itself (lib/queue/jobs/problem-report-fix.ts)
  PROBLEM_REPORT_FIX: "problem-report:fix",
  // One member's DM when a report they made or follow is fixed or closed (lib/queue/jobs/problem-report-update.ts)
  PROBLEM_REPORT_UPDATE: "problem-report:update",
  // Rewind batch jobs (P2.6), on the `rewind-batch` queue
  REWIND_SERVER_AGGREGATE: "rewind:server-aggregate",
  REWIND_METADATA_WARM: "rewind:metadata-warm",
  REWIND_GENERATE_USER: "rewind:generate:user",
  REWIND_STALE_SWEEP: "rewind:stale:sweep",
  // Season console (P7.8), on `rewind-batch`
  REWIND_SEASON_PREPARE: "rewind:season:prepare",
  REWIND_GENERATE_ALL: "rewind:generate:all",
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
  [JOB_TYPES.PLEX_ACCESS_GRANT]: "Member access grant",
  [JOB_TYPES.PLEX_ACCESS_REVOKE]: "Member access removal",
  [JOB_TYPES.DISCORD_ROLE_SYNC]: "Discord role sync",
  [JOB_TYPES.DISCORD_ROLE_RECONCILE]: "Discord role check",
  [JOB_TYPES.RETENTION_SWEEP]: "Retention sweep",
  [JOB_TYPES.DISCORD_CHANNEL_STATS]: "Discord channel stats",
  [JOB_TYPES.REQUEST_TIER_SYNC]: "Request limit tiers",
  [JOB_TYPES.MEMBER_ACTIVITY]: "Last seen and inactivity",
  [JOB_TYPES.SECRETS_REENCRYPT]: "Secret re-encryption",
  [JOB_TYPES.CONVERSATION_REVIEW]: "Conversation review",
  [JOB_TYPES.CONVERSATION_REVIEW_SWEEP]: "Conversation review sweep",
  [JOB_TYPES.EMAIL_TEST]: "Test email",
  [JOB_TYPES.INACTIVITY_NOTICE]: "Inactivity email",
  [JOB_TYPES.PROBLEM_REPORT_NOTIFY]: "Problem report alert",
  [JOB_TYPES.PROBLEM_REPORT_FIX]: "Problem report fix",
  [JOB_TYPES.PROBLEM_REPORT_UPDATE]: "Problem report update",
  [JOB_TYPES.REWIND_SERVER_AGGREGATE]: "Rewind server totals",
  [JOB_TYPES.REWIND_METADATA_WARM]: "Rewind metadata warm-up",
  [JOB_TYPES.REWIND_GENERATE_USER]: "Rewind generation",
  [JOB_TYPES.REWIND_STALE_SWEEP]: "Rewind stale sweep",
  [JOB_TYPES.REWIND_SEASON_PREPARE]: "Rewind season prepare",
  [JOB_TYPES.REWIND_GENERATE_ALL]: "Rewind generate all",
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
  JOB_TYPES.RETENTION_SWEEP,
  JOB_TYPES.DISCORD_CHANNEL_STATS,
  JOB_TYPES.REQUEST_TIER_SYNC,
  JOB_TYPES.MEMBER_ACTIVITY,
  JOB_TYPES.SECRETS_REENCRYPT,
  JOB_TYPES.CONVERSATION_REVIEW,
  JOB_TYPES.CONVERSATION_REVIEW_SWEEP,
  JOB_TYPES.EMAIL_TEST,
  JOB_TYPES.INACTIVITY_NOTICE,
  JOB_TYPES.PROBLEM_REPORT_NOTIFY,
  JOB_TYPES.PROBLEM_REPORT_FIX,
  JOB_TYPES.PROBLEM_REPORT_UPDATE,
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
/**
 * One run of a problem report's fix (lib/problem-reports/run.ts). The job
 * delays itself between steps, and the step and what it waits for travel in
 * the payload.
 */
/** What Look for a better copy watches once its search is sent (`lib/problem-reports/steps/better-copy.ts`). */
export interface BetterCopyWatch {
  service: "radarr" | "sonarr"
  /** The Radarr movie or the Sonarr series. */
  titleId: number
  /** The file the run started with: a new file is the better copy, imported. */
  fileId: number
  /** Sonarr: the file's episodes. */
  episodeIds: number[]
  /** The search command, or null when the step ran again after a crash and didn't send it. */
  commandId: number | null
  /** When the search was sent, in epoch milliseconds; only later history counts. */
  since: number
  /** Plex's library section and the file's folder, scanned once the new copy is in. */
  sectionId: string | null
  folder: string
}

export interface ProblemReportFixPayload {
  reportId: string
  /** The report's `runToken` when this run was claimed; a newer run stops this one. */
  runToken: number
  step: "start" | "wait"
  trigger: "automatic" | "web" | "mcp"
  /** Who asked: the reporter for an automatic run, else the admin. */
  actorUserId: string | null
  /** The Sonarr episode ids the run waits for, once it has started. */
  targets?: number[]
  /** When the run gives up waiting, in epoch milliseconds. */
  deadline?: number
  /** When the run last asked Plex to scan for files Sonarr has, in epoch milliseconds. */
  scannedAt?: number
  /** Look for a better copy: what it waits on. */
  watch?: BetterCopyWatch
}

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
 * Payload for granting a member access after a successful checkout or a comp
 * grant: a Plex share (P11.11). Keyed by the app user id; the processor reads
 * the member's Plex identity at run time.
 */
export interface PlexAccessGrantPayload {
  userId: string
}

/**
 * Payload for removing a member's Plex share after cancellation (P11.11).
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
  | "access_granted"
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
  step?: "fan-out" | "done"
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
 * `rewind:notify:{year}:{userId}:{kind}`: `kind` is the generation's, a
 * season run or the member's own.
 */
export interface RewindNotifyPayload {
  wrappedId: string
  userId: string
  year: number
  kind: "season" | "member"
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
  [JOB_TYPES.RETENTION_SWEEP]: { triggeredBy: "scheduled" }
  [JOB_TYPES.DISCORD_CHANNEL_STATS]: { triggeredBy: "scheduled" | "admin" }
  [JOB_TYPES.REQUEST_TIER_SYNC]: { triggeredBy: "scheduled" | "admin" }
  /**
   * An admin run names the admin (the audit actor) and, when the sweep is on,
   * the members they confirmed: the run removes no one if any other member
   * qualifies. The worker honours the confirmation only on the job's first
   * attempt, within 15 minutes, and while the admin still is one
   * (`lib/queue/jobs/member-activity.ts`).
   */
  [JOB_TYPES.MEMBER_ACTIVITY]: { triggeredBy: "scheduled" | "admin"; triggeredByUserId?: string; confirmedUserIds?: string[] }
  [JOB_TYPES.SECRETS_REENCRYPT]: { triggeredBy: "scheduled" }
  [JOB_TYPES.CONVERSATION_REVIEW]: { reviewId: string }
  [JOB_TYPES.CONVERSATION_REVIEW_SWEEP]: { triggeredBy: "scheduled" }
  /** The admin who asked; the job reads their address when it runs. */
  [JOB_TYPES.EMAIL_TEST]: { userId: string }
  /** The notice row (`InactivityNotice`) to send; the job reads everything else when it runs. */
  [JOB_TYPES.INACTIVITY_NOTICE]: { noticeId: string }
  /** A new report; the job alerts about every report of that member still waiting for an alert. */
  [JOB_TYPES.PROBLEM_REPORT_NOTIFY]: { reportId: string }
  /** The run (`runToken`) and the step it is on; lib/problem-reports/run.ts reads everything else when it runs. */
  [JOB_TYPES.PROBLEM_REPORT_FIX]: ProblemReportFixPayload
  /** The member to tell, and the state the report reached. */
  [JOB_TYPES.PROBLEM_REPORT_UPDATE]: { reportId: string; userId: string; status: "FIXED" | "CLOSED" }
  [JOB_TYPES.REWIND_SERVER_AGGREGATE]: RewindServerAggregatePayload
  [JOB_TYPES.REWIND_METADATA_WARM]: RewindMetadataWarmPayload
  [JOB_TYPES.REWIND_GENERATE_USER]: RewindGenerateUserPayload
  [JOB_TYPES.REWIND_STALE_SWEEP]: Record<string, never>
  [JOB_TYPES.REWIND_SEASON_PREPARE]: RewindSeasonPreparePayload
  [JOB_TYPES.REWIND_GENERATE_ALL]: RewindGenerateAllPayload
  [JOB_TYPES.REWIND_CARD_PREWARM]: RewindCardPrewarmPayload
  [JOB_TYPES.REWIND_CARD_SWEEP]: Record<string, never>
  [JOB_TYPES.REWIND_DRY_RUN]: RewindDryRunPayload
  [JOB_TYPES.REWIND_NOTIFY]: RewindNotifyPayload
  [JOB_TYPES.REWIND_SEASON_OPEN]: RewindSeasonOpenPayload
}

// =============================================================================
// Job ids (BP-20, P11.3)
// =============================================================================

/**
 * How a job type gets its id, so a repeated trigger never adds a second job:
 *
 * - `deduplication`: BullMQ's deduplication id, which holds while a job with
 *   it is waiting or running, so a trigger then joins that job;
 * - `jobId`: a deterministic job id, kept while BullMQ keeps the job;
 * - `fromCaller`: the caller names the id, because what makes it unique (a
 *   Stripe event, an admin's grant, a Rewind generation row) is not in the
 *   payload. The value says what the id carries; `addJob` refuses such a job
 *   without one.
 *
 * Scheduled jobs get BullMQ's scheduler ids (`repeat:<scheduler>:<time>`),
 * one per tick. The Rewind queues are filled by their own producers
 * (`lib/rewind/*`, `lib/queue/jobs/rewind-*.ts`), which set the ids named here.
 */
export type JobIdPolicy<T> =
  | { deduplication: (data: T) => string }
  | { jobId: (data: T) => string }
  | { fromCaller: string }

/** Every job type's id rule; `lib/queue/__tests__/job-id-policy.test.ts` checks each type has one. */
export const JOB_ID_POLICY: { [K in JobType]: JobIdPolicy<JobPayloadMap[K]> } = {
  [JOB_TYPES.WATCHLIST_SYNC_USER]: { deduplication: (data) => `watchlist:user:${data.userId}` },
  [JOB_TYPES.WATCHLIST_SYNC_ALL]: { deduplication: () => "watchlist:all" },
  [JOB_TYPES.STRIPE_WEBHOOK]: { fromCaller: "the Stripe event id" },
  [JOB_TYPES.PLEX_ACCESS_GRANT]: { fromCaller: "the member and the event that granted access" },
  [JOB_TYPES.PLEX_ACCESS_REVOKE]: { fromCaller: "the member and the event that removed access" },
  [JOB_TYPES.DISCORD_ROLE_SYNC]: { deduplication: (data) => `discord:role:${data.userId}` },
  [JOB_TYPES.DISCORD_ROLE_RECONCILE]: { deduplication: () => "discord:role:reconcile" },
  [JOB_TYPES.RETENTION_SWEEP]: { deduplication: () => "retention:sweep" },
  [JOB_TYPES.DISCORD_CHANNEL_STATS]: { deduplication: () => "discord:channel-stats" },
  [JOB_TYPES.REQUEST_TIER_SYNC]: { deduplication: () => "request-tiers:sync" },
  [JOB_TYPES.MEMBER_ACTIVITY]: { deduplication: () => "members:activity" },
  [JOB_TYPES.SECRETS_REENCRYPT]: { fromCaller: "secrets:reencrypt:<kid>:<fields hash>, from enqueueSecretsReencrypt" },
  // Not deduplication: the review row dedupes, and a kept completed job would swallow a repeat id
  [JOB_TYPES.CONVERSATION_REVIEW]: { jobId: (data) => reviewJobId(data.reviewId) },
  [JOB_TYPES.CONVERSATION_REVIEW_SWEEP]: { fromCaller: "the judge-review-sweep scheduler" },
  [JOB_TYPES.EMAIL_TEST]: { deduplication: (data) => `email:test:${data.userId}` },
  [JOB_TYPES.INACTIVITY_NOTICE]: { deduplication: (data) => `members:notice:${data.noticeId}` },
  // Deduplication, not a job id: a report sent back to the admins later can be alerted again
  [JOB_TYPES.PROBLEM_REPORT_NOTIFY]: { deduplication: (data) => `problem-report:notify:${data.reportId}` },
  // Job ids, kept while BullMQ keeps the finished job (24 hours): a run, or a member's DM about one state, happens once
  [JOB_TYPES.PROBLEM_REPORT_FIX]: { jobId: (data) => `problem-report:fix:${data.reportId}:${data.runToken}` },
  [JOB_TYPES.PROBLEM_REPORT_UPDATE]: { jobId: (data) => `problem-report:update:${data.reportId}:${data.userId}:${data.status}` },
  [JOB_TYPES.REWIND_SERVER_AGGREGATE]: { fromCaller: "the parent run's step id" },
  [JOB_TYPES.REWIND_METADATA_WARM]: { deduplication: (data) => `rewind:meta:${data.batch}` },
  [JOB_TYPES.REWIND_GENERATE_USER]: { fromCaller: "the RewindGeneration id" },
  [JOB_TYPES.REWIND_STALE_SWEEP]: { fromCaller: "the rewind-stale-sweep scheduler" },
  [JOB_TYPES.REWIND_SEASON_PREPARE]: { fromCaller: "rewind:prepare-now:<year>:<through>, or the season-open run" },
  [JOB_TYPES.REWIND_GENERATE_ALL]: { fromCaller: "the parent run's step id; BullMQ's own id for the console button, which never joins a run" },
  [JOB_TYPES.REWIND_CARD_PREWARM]: { fromCaller: "rewind:cards:<wrappedId>:<facts hash>" },
  [JOB_TYPES.REWIND_CARD_SWEEP]: { fromCaller: "the rewind-card-sweep scheduler" },
  [JOB_TYPES.REWIND_DRY_RUN]: { jobId: (data) => data.previewId },
  [JOB_TYPES.REWIND_NOTIFY]: { deduplication: (data) => `rewind:notify:${data.year}:${data.userId}:${data.kind}` },
  [JOB_TYPES.REWIND_SEASON_OPEN]: { deduplication: (data) => `rewind:open:${data.year}` },
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
