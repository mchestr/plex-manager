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
 * - {@link auditMemberRead} and {@link auditMemberListed} record admin reads of
 *   member content, at most once an hour per admin, member and surface, through
 *   the `audit:read` rate limit, so browsing does not flood the table.
 *
 * @module lib/security/audit-log
 */

import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { consume } from "@/lib/security/rate-limit"
import { sanitizeValue } from "@/lib/utils/log-redaction"
import { createLogger } from "@/lib/utils/logger"

export enum AuditEventType {
  ADMIN_PRIVILEGE_GRANTED = "ADMIN_PRIVILEGE_GRANTED",
  ADMIN_PRIVILEGE_REVOKED = "ADMIN_PRIVILEGE_REVOKED",
  // An admin assigned or removed a user's role (lib/permissions). Details carry
  // the target user id and the previous and new role.
  USER_ROLE_CHANGED = "USER_ROLE_CHANGED",
  // A user below admin ran an assistant tool, or was refused one. Details carry
  // the tool name, call id and (for a refusal) the reason, never arguments or output.
  ASSISTANT_TOOL_CALLED = "ASSISTANT_TOOL_CALLED",
  ASSISTANT_TOOL_DENIED = "ASSISTANT_TOOL_DENIED",
  USER_CREATED = "USER_CREATED",
  // Every session of a user was ended (User.sessionVersion bumped). Details carry
  // the reason, such as "unshared", "demoted", "disabled" or "subscription_revoked".
  SESSIONS_REVOKED = "SESSIONS_REVOKED",
  // An admin disabled or re-enabled a user's account (User.disabledAt).
  USER_DISABLED = "USER_DISABLED",
  USER_ENABLED = "USER_ENABLED",
  // An admin turned a member's Jellyfin account off or on (P11.10). Details
  // carry the target user id and their Jellyfin user id.
  JELLYFIN_ACCESS_DISABLED = "JELLYFIN_ACCESS_DISABLED",
  JELLYFIN_ACCESS_ENABLED = "JELLYFIN_ACCESS_ENABLED",
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
  // An affiliate invite refused a redemption. Details carry the invite id and
  // the reason; the target is the affiliate whose invite it was.
  AFFILIATE_REDEMPTION_REFUSED = "AFFILIATE_REDEMPTION_REFUSED",
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
  /**
   * @public A prompt template or Rewind style guide was created, edited, activated
   * or deleted (P5.9). Kept so stored rows stay known; the Prompts page was removed.
   */
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
  /**
   * @public P8.5's Run final cut press (year, last data day, estimate, job id).
   * Kept so stored rows stay known; the final cut was removed.
   */
  REWIND_FINAL_CUT_STARTED = "REWIND_FINAL_CUT_STARTED",
  // An admin opened a member's stored Rewind (P7.9, GAP-33). Details carry the
  // target user, the year and the wrapped id.
  REWIND_ADMIN_VIEWED = "REWIND_ADMIN_VIEWED",
  // The admin assistant read app data for an admin through a tool. Details carry
  // the tool name and the conversation, never the arguments' values or the result.
  ASSISTANT_DATA_READ = "ASSISTANT_DATA_READ",
  // The admin assistant called a tool on an MCP server. Details carry the server
  // id and the tool name, never the arguments or the result.
  ASSISTANT_MCP_CALL = "ASSISTANT_MCP_CALL",
  // An admin added, changed or removed an MCP server or knowledge base source.
  // Details carry the kind, the action and the row id, never a secret.
  ASSISTANT_SOURCE_CHANGED = "ASSISTANT_SOURCE_CHANGED",
  // An admin restored a member's previous Rewind (P7.9). Details carry the
  // target user, the year, the source generation and the new one.
  REWIND_ROLLED_BACK = "REWIND_ROLLED_BACK",
  // An admin removed a member's share of the Plex server (P11.16, GAP-33).
  // Details carry whether the share was already gone.
  MEMBER_UNSHARED = "MEMBER_UNSHARED",
  // An admin imported the Plex server's members (P11.16, GAP-33). Details carry
  // the counts and the created user ids.
  MEMBERS_IMPORTED = "MEMBERS_IMPORTED",
  // An admin read one member's content (P11.16, GAP-33): one row per admin,
  // member and surface per hour. Details carry the surface.
  MEMBER_CONTENT_VIEWED = "MEMBER_CONTENT_VIEWED",
  // An admin opened a page listing many members' content (P11.16): one row per
  // admin and surface per hour. Details carry the surface and the filters.
  MEMBER_CONTENT_LISTED = "MEMBER_CONTENT_LISTED",
  // The duplicate active service rows were deactivated (P11.31). Details carry
  // the kept and deactivated ids per table and where the dump taken first lives.
  SERVICE_ROWS_DEDUPED = "SERVICE_ROWS_DEDUPED",
  // A credential, settings or setup change. Details carry the redacted diff
  // from lib/security/config-diff.ts: changed field names, whether a secret
  // changed, and URL origins only.
  CONFIG_CHANGED = "CONFIG_CHANGED",
  // A browser claimed the server before first-run setup (P11.32, SEC-30).
  // Details carry the method (code or token) and the masked IP, never the code.
  SETUP_CLAIMED = "SETUP_CLAIMED",
  // An optional setup step was skipped (P10.24). Details carry the step id.
  SETUP_STEP_SKIPPED = "SETUP_STEP_SKIPPED",
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

/** The admin surfaces that show one member's content (GAP-33's inventory, as it stands after P11.5). */
export type MemberReadSurface =
  | "activity-timeline"
  | "llm-usage-detail"
  | "llm-conversation"
  | "rewind-history"
  | "chatbot-tautulli"

/** The admin pages that list many members' content. */
export type MemberListSurface = "discord-activity" | "watchlist-history"

/** True the first time `key` is seen in the hour; a limiter failure counts as first, so a read is never lost. */
async function firstThisHour(key: string): Promise<boolean> {
  try {
    return (await consume("audit:read", key)).ok
  } catch (error) {
    auditLogger.warn("audit.read_limit_failed", { error: String(error) })
    return true
  }
}

/**
 * Record that admin `actorUserId` read `targetUserId`'s content on `surface`
 * (`MEMBER_CONTENT_VIEWED`). Writes at most one row per admin, member and
 * surface per hour; later reads in the hour write nothing. Never throws.
 */
export async function auditMemberRead(
  surface: MemberReadSurface,
  targetUserId: string,
  actorUserId: string
): Promise<void> {
  if (!(await firstThisHour(`${actorUserId}:${surface}:${targetUserId}`))) return
  logAuditEvent(AuditEventType.MEMBER_CONTENT_VIEWED, actorUserId, { targetUserId, surface })
}

/**
 * Record that admin `actorUserId` opened a page listing many members' content
 * (`MEMBER_CONTENT_LISTED`), with the page's filters. One row per admin and
 * surface per hour, whatever the filters. Never throws.
 */
export async function auditMemberListed(
  surface: MemberListSurface,
  actorUserId: string,
  filters: Record<string, unknown> = {}
): Promise<void> {
  if (!(await firstThisHour(`${actorUserId}:${surface}`))) return
  logAuditEvent(AuditEventType.MEMBER_CONTENT_LISTED, actorUserId, { surface, filters })
}
