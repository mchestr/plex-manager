/**
 * Audit logging for security-sensitive operations (SEC-55).
 *
 * Every event is written twice: a line on stdout through the `AUDIT` logger, and
 * a row in the append-only `AuditLog` table. Both copies carry details that have
 * passed through the log sanitiser, so a secret that slips into `details` is
 * redacted in the database as well. No code path updates or deletes rows.
 *
 * - {@link logAuditEvent} is fire-and-forget: it never throws and never waits,
 *   so a database outage cannot fail the action it audits.
 * - {@link recordAuditEvent} awaits the write and throws when it fails, for
 *   callers that write inside a `$transaction` or must know the row landed.
 *
 * @module lib/security/audit-log
 */

import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { sanitizeValue } from "@/lib/utils/log-redaction"
import { createLogger } from "@/lib/utils/logger"

export enum AuditEventType {
  ADMIN_PRIVILEGE_GRANTED = "ADMIN_PRIVILEGE_GRANTED",
  ADMIN_PRIVILEGE_REVOKED = "ADMIN_PRIVILEGE_REVOKED",
  USER_CREATED = "USER_CREATED",
  // Every session of a user was ended (User.sessionVersion bumped). Details carry
  // the reason, such as "unshared", "demoted", "disabled" or "subscription_revoked".
  SESSIONS_REVOKED = "SESSIONS_REVOKED",
  // An admin disabled or re-enabled a user's account (User.disabledAt).
  USER_DISABLED = "USER_DISABLED",
  USER_ENABLED = "USER_ENABLED",
  // An admin removed a member and their data (P11.13). Details carry the row
  // counts, the external outcomes and the Stripe customer id, never a name or email.
  MEMBER_ERASED = "MEMBER_ERASED",
  // Invite processing events
  INVITE_CONSUMED = "INVITE_CONSUMED",
  INVITE_PLEX_FAILURE = "INVITE_PLEX_FAILURE",
  INVITE_JELLYFIN_FAILURE = "INVITE_JELLYFIN_FAILURE",
  INVITE_ROLLBACK = "INVITE_ROLLBACK",
  INVITE_ROLLBACK_FAILED = "INVITE_ROLLBACK_FAILED",
  INVITE_TRANSACTION_CONFLICT = "INVITE_TRANSACTION_CONFLICT",
  // An admin created or deleted an invite (P11.5). Details carry the invite id,
  // its server type, uses and expiry; the code is the credential, so never it.
  INVITE_CREATED = "INVITE_CREATED",
  INVITE_DELETED = "INVITE_DELETED",
  // Announcement events
  ANNOUNCEMENT_CREATED = "ANNOUNCEMENT_CREATED",
  ANNOUNCEMENT_UPDATED = "ANNOUNCEMENT_UPDATED",
  ANNOUNCEMENT_DELETED = "ANNOUNCEMENT_DELETED",
  ANNOUNCEMENT_STATUS_CHANGED = "ANNOUNCEMENT_STATUS_CHANGED",
  // Queue management events
  QUEUE_PAUSED = "QUEUE_PAUSED",
  QUEUE_RESUMED = "QUEUE_RESUMED",
  QUEUE_JOB_REMOVED = "QUEUE_JOB_REMOVED",
  QUEUE_JOB_RETRIED = "QUEUE_JOB_RETRIED",
  QUEUE_SYNC_TRIGGERED = "QUEUE_SYNC_TRIGGERED",
  // Subscription management events
  SUBSCRIPTION_CANCELED = "SUBSCRIPTION_CANCELED",
  SUBSCRIPTION_ACCESS_GRANTED = "SUBSCRIPTION_ACCESS_GRANTED",
  SUBSCRIPTION_EXEMPT_CHANGED = "SUBSCRIPTION_EXEMPT_CHANGED",
  // A Stripe webhook event failed its last attempt (SEC-40). Details carry the
  // event id and an error code; Stripe's "Resend event" retries it.
  STRIPE_EVENT_FAILED = "STRIPE_EVENT_FAILED",
  // Discord events
  // Emitted when a chatbot tool call is refused in the public Discord context
  // because the requested tool is not in the resolved Discord-safe set (or the
  // acting Discord user lacks the admin tier a server-wide tool requires). Blocks
  // prompt-injection that hallucinates an unsafe/unknown tool name and privilege
  // escalation by a non-admin member.
  DISCORD_COMMAND_DENIED = "DISCORD_COMMAND_DENIED",
  // Emitted when the Discord integration config is changed by an admin. Details
  // carry a REDACTED diff (which fields changed + whether secrets were touched),
  // never the secret values themselves.
  DISCORD_INTEGRATION_CONFIG_CHANGED = "DISCORD_INTEGRATION_CONFIG_CHANGED",
  // Emitted when a user completes the Discord OAuth link (account connected).
  DISCORD_ACCOUNT_LINKED = "DISCORD_ACCOUNT_LINKED",
  // Emitted when a Discord account is disconnected / role cleared for a user.
  DISCORD_ACCOUNT_UNLINKED = "DISCORD_ACCOUNT_UNLINKED",
  // Emitted when the Discord bot token / config version is rotated on a config
  // change. Details never carry the token value.
  DISCORD_TOKEN_ROTATED = "DISCORD_TOKEN_ROTATED",
  // v2 Rewind share links (SEC-16). P7.13 deleted the action that created one,
  // so only revocations are written. Details carry the wrapped id and year,
  // never the token, which is the credential for the public link.
  SHARE_LINK_REVOKED = "SHARE_LINK_REVOKED",
  // v3 Rewind public links (P5.11, design 6.2). Details carry the share id, the
  // year and the published pages (and a rotation's old share id), never the token.
  REWIND_SHARE_CREATED = "REWIND_SHARE_CREATED",
  REWIND_SHARE_UPDATED = "REWIND_SHARE_UPDATED",
  REWIND_SHARE_ROTATED = "REWIND_SHARE_ROTATED",
  REWIND_SHARE_REVOKED = "REWIND_SHARE_REVOKED",
  // A member hid or unhid a title in their Rewind (P7.7, FR-7). Details carry the
  // year, rating key and kind, never the title.
  REWIND_TITLE_HIDDEN = "REWIND_TITLE_HIDDEN",
  REWIND_TITLE_UNHIDDEN = "REWIND_TITLE_UNHIDDEN",
  // The server time zone (Config.timezone) changed. Details carry the old and new zone.
  SERVER_TIMEZONE_CHANGED = "SERVER_TIMEZONE_CHANGED",
  // A prompt template or Rewind style guide was created, edited, activated or
  // deleted (P5.9). Details carry the kind and changed field names, never the text.
  PROMPT_TEMPLATE_CHANGED = "PROMPT_TEMPLATE_CHANGED",
  /**
   * @public An LLM provider save, as P2.12 logged it. Kept so the type stays
   * known; saves are audited as CONFIG_CHANGED since P4.6.
   */
  LLM_PROVIDER_CHANGED = "LLM_PROVIDER_CHANGED",
  /**
   * @public P2.6's "Prepare season data" press (year, last data day, job id).
   * Kept so stored rows stay known; P7.8's Prepare season writes REWIND_SEASON_PREPARED.
   */
  REWIND_SEASON_DATA_PREPARED = "REWIND_SEASON_DATA_PREPARED",
  // An admin asked for a member's Rewind to be regenerated. Details carry the year
  // and whether a run was already queued.
  REWIND_REGENERATE_REQUESTED = "REWIND_REGENERATE_REQUESTED",
  // The season console's bulk runs (P7.8). Details carry the year, the audience,
  // the member count and the cost estimate, and the job id.
  REWIND_SEASON_PREPARED = "REWIND_SEASON_PREPARED",
  REWIND_GENERATE_ALL_STARTED = "REWIND_GENERATE_ALL_STARTED",
  REWIND_RETRY_FAILED = "REWIND_RETRY_FAILED",
  /** Run final cut enqueued `REWIND_FINAL_CUT` (P8.5). */
  REWIND_FINAL_CUT_STARTED = "REWIND_FINAL_CUT_STARTED",
  // An admin opened a member's stored Rewind (P7.9, GAP-33). Details carry the
  // target user, the year and the wrapped id.
  REWIND_ADMIN_VIEWED = "REWIND_ADMIN_VIEWED",
  // An admin restored a member's previous Rewind (P7.9). Details carry the
  // target user, the year, the source generation and the new one.
  REWIND_ROLLED_BACK = "REWIND_ROLLED_BACK",
  // A credential, settings, setup or prompt-template change. Details carry the
  // redacted diff from lib/security/config-diff.ts: changed field names, whether
  // a secret changed, and URL origins only.
  CONFIG_CHANGED = "CONFIG_CHANGED",
}

type AuditDetails = {
  targetUserId?: string
  [key: string]: unknown
}

/** The prisma client, or a transaction client, that writes the row. */
interface AuditWriter {
  auditLog: { create(args: { data: Prisma.AuditLogUncheckedCreateInput }): Promise<unknown> }
}

const auditLogger = createLogger("AUDIT")

interface AuditEntry {
  type: AuditEventType
  actorUserId: string
  targetUserId: string | null
  /** The caller's details, unsanitised: the logger and `persist` each sanitise them. */
  details: Record<string, unknown> | undefined
}

function buildEntry(type: AuditEventType, userId: string, details: AuditDetails | undefined): AuditEntry {
  const { targetUserId, ...rest } = details ?? {}
  return { type, actorUserId: userId, targetUserId: targetUserId ?? null, details: details ? rest : undefined }
}

function writeStdout(entry: AuditEntry) {
  auditLogger.info(`Audit event: ${entry.type}`, {
    type: entry.type,
    userId: entry.actorUserId,
    targetUserId: entry.targetUserId ?? undefined,
    details: entry.details,
  })
}

/** Writes the row; its details pass through the same sanitiser as the log line. */
async function persist(entry: AuditEntry, db: AuditWriter) {
  await db.auditLog.create({
    data: {
      type: entry.type,
      actorUserId: entry.actorUserId,
      targetUserId: entry.targetUserId,
      details: entry.details && (sanitizeValue(entry.details) as Prisma.InputJsonObject),
    },
  })
}

/**
 * Log an audit event to stdout and, without waiting, to the `AuditLog` table.
 * A failed write is logged as `audit.persist_failed` and never thrown.
 */
export function logAuditEvent(type: AuditEventType, userId: string, details?: AuditDetails): void {
  const entry = buildEntry(type, userId, details)
  writeStdout(entry)
  void persist(entry, prisma).catch((error: unknown) => {
    auditLogger.error("audit.persist_failed", error, { type })
  })
}

/**
 * Log an audit event and wait for its row. Pass a transaction client as `db`
 * to write the row in the same transaction as the change it records; a failed
 * write throws, so the transaction rolls back.
 */
export async function recordAuditEvent(
  type: AuditEventType,
  userId: string,
  details?: AuditDetails,
  db: AuditWriter = prisma
): Promise<void> {
  const entry = buildEntry(type, userId, details)
  writeStdout(entry)
  await persist(entry, db)
}
