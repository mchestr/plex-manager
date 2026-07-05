/**
 * Audit logging for security-sensitive operations
 * Logs admin privilege changes and other critical security events
 */

export enum AuditEventType {
  ADMIN_PRIVILEGE_GRANTED = "ADMIN_PRIVILEGE_GRANTED",
  ADMIN_PRIVILEGE_REVOKED = "ADMIN_PRIVILEGE_REVOKED",
  ADMIN_PRIVILEGE_CHANGED = "ADMIN_PRIVILEGE_CHANGED",
  CONFIG_CHANGED = "CONFIG_CHANGED",
  USER_CREATED = "USER_CREATED",
  USER_UPDATED = "USER_UPDATED",
  // Invite processing events
  INVITE_CONSUMED = "INVITE_CONSUMED",
  INVITE_PLEX_FAILURE = "INVITE_PLEX_FAILURE",
  INVITE_JELLYFIN_FAILURE = "INVITE_JELLYFIN_FAILURE",
  INVITE_ROLLBACK = "INVITE_ROLLBACK",
  INVITE_ROLLBACK_FAILED = "INVITE_ROLLBACK_FAILED",
  INVITE_TRANSACTION_CONFLICT = "INVITE_TRANSACTION_CONFLICT",
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
  QUEUE_SCHEDULE_UPDATED = "QUEUE_SCHEDULE_UPDATED",
  // Subscription management events
  SUBSCRIPTION_CANCELED = "SUBSCRIPTION_CANCELED",
  SUBSCRIPTION_ACCESS_GRANTED = "SUBSCRIPTION_ACCESS_GRANTED",
  SUBSCRIPTION_EXEMPT_CHANGED = "SUBSCRIPTION_EXEMPT_CHANGED",
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
}

export interface AuditLogEntry {
  type: AuditEventType
  userId: string
  targetUserId?: string
  details?: Record<string, unknown>
  timestamp: Date
}

import { createLogger } from "@/lib/utils/logger"

const auditLogger = createLogger("AUDIT")

/**
 * Log an audit event
 * In production, this should write to a secure audit log system
 */
export function logAuditEvent(
  type: AuditEventType,
  userId: string,
  details?: {
    targetUserId?: string
    [key: string]: unknown
  }
) {
  const entry: AuditLogEntry = {
    type,
    userId,
    targetUserId: details?.targetUserId,
    details: details ? { ...details, targetUserId: undefined } : undefined,
    timestamp: new Date(),
  }

  // Log audit event (in production, use a proper audit log system)
  auditLogger.info(`Audit event: ${type}`, {
    type,
    userId,
    targetUserId: entry.targetUserId,
    details: entry.details,
  })

  // TODO: In production, write to:
  // - Database audit log table
  // - External audit log service (e.g., CloudWatch, Datadog)
  // - Immutable log storage
}

