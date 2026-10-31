/**
 * The words the audit log shows for each stored event type: a short label and
 * the category it is filed under. Client-safe: the event type enum is read as
 * a type only, since `lib/security/audit-log.ts` writes to the database.
 *
 * | Category        | Covers                                                                        |
 * |-----------------|-------------------------------------------------------------------------------|
 * | `members`       | Accounts, admin rights, roles, removal and import                             |
 * | `access`        | Plex share removals, Jellyfin access and the inactivity sweep                 |
 * | `sessions`      | Every session of a user ended                                                 |
 * | `invites`       | Admin invites and their redemption                                            |
 * | `affiliates`    | Applications, decisions, blocks and affiliate invites                         |
 * | `billing`       | Subscriptions, exemptions and failed Stripe events                            |
 * | `rewind`        | Shares, hidden titles, prompts, regeneration and the season console           |
 * | `assistant`     | Assistant tool calls, refusals and sources                                    |
 * | `discord`       | Discord links, refused commands and the bot settings                          |
 * | `announcements` | Announcements                                                                 |
 * | `jobs`          | The job queues                                                                |
 * | `settings`      | Settings, the time zone, LLM providers and the inactivity settings            |
 * | `setup`         | First-run setup                                                               |
 * | `reads`         | Reads of member content and Rewinds, the assistant's app data reads, this log |
 *
 * `AUDIT_EVENTS` is a `Record` over every member of `AuditEventType`, retired
 * ones included, so a new event type does not compile until it has words here.
 * A stored type the enum does not know (a retired or test type) shows as its
 * raw string and has no category.
 *
 * @module lib/audit/events
 */

import type { AuditEventType } from "@/lib/security/audit-log"

export const AUDIT_CATEGORIES = [
  "members",
  "access",
  "sessions",
  "invites",
  "affiliates",
  "billing",
  "rewind",
  "assistant",
  "discord",
  "announcements",
  "jobs",
  "settings",
  "setup",
  "reads",
] as const

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number]

/** A stored event type the enum knows, as its string value. */
export type AuditEventName = `${AuditEventType}`

export const CATEGORY_LABELS: Record<AuditCategory, string> = {
  members: "Members and roles",
  access: "Plex and Jellyfin access",
  sessions: "Sign-in sessions",
  invites: "Invites",
  affiliates: "Affiliates",
  billing: "Billing",
  rewind: "Rewind",
  assistant: "Assistant",
  discord: "Discord",
  announcements: "Announcements",
  jobs: "Job queues",
  settings: "Settings",
  setup: "First-run setup",
  reads: "Admin reads",
}

interface EventWords {
  label: string
  category: AuditCategory
}

const AUDIT_EVENTS: Record<AuditEventName, EventWords> = {
  USER_CREATED: { label: "Account created", category: "members" },
  ADMIN_PRIVILEGE_GRANTED: { label: "Admin rights given", category: "members" },
  ADMIN_PRIVILEGE_REVOKED: { label: "Admin rights removed", category: "members" },
  USER_ROLE_CHANGED: { label: "Role changed", category: "members" },
  USER_DISABLED: { label: "Account disabled", category: "members" },
  USER_ENABLED: { label: "Account enabled", category: "members" },
  MEMBER_ERASED: { label: "Member and their data removed", category: "members" },
  MEMBERS_IMPORTED: { label: "Members imported from Plex", category: "members" },

  MEMBER_UNSHARED: { label: "Plex access removed", category: "access" },
  JELLYFIN_ACCESS_DISABLED: { label: "Jellyfin access turned off", category: "access" },
  JELLYFIN_ACCESS_ENABLED: { label: "Jellyfin access turned on", category: "access" },
  INACTIVITY_SWEEP_RUN: { label: "Inactivity sweep ran", category: "access" },
  INACTIVITY_EXCLUSION_CHANGED: { label: "Inactivity exclusion changed", category: "access" },
  ACTIVITY_SYNC_TRIGGERED: { label: "Last seen check started", category: "access" },

  SESSIONS_REVOKED: { label: "Signed out everywhere", category: "sessions" },

  INVITE_CREATED: { label: "Invite created", category: "invites" },
  INVITE_DELETED: { label: "Invite deleted", category: "invites" },
  INVITE_CONSUMED: { label: "Invite used", category: "invites" },
  INVITE_PLEX_FAILURE: { label: "Invite failed on Plex", category: "invites" },
  INVITE_JELLYFIN_FAILURE: { label: "Invite failed on Jellyfin", category: "invites" },
  INVITE_ROLLBACK: { label: "Invite use undone", category: "invites" },
  INVITE_ROLLBACK_FAILED: { label: "Invite use not undone", category: "invites" },
  INVITE_TRANSACTION_CONFLICT: { label: "Invite used twice at once", category: "invites" },

  AFFILIATE_APPLIED: { label: "Applied to be an affiliate", category: "affiliates" },
  AFFILIATE_APPROVED: { label: "Affiliate application approved", category: "affiliates" },
  AFFILIATE_REFUSED: { label: "Affiliate application refused", category: "affiliates" },
  AFFILIATE_REVOKED: { label: "Affiliate status revoked", category: "affiliates" },
  AFFILIATE_ENDED: { label: "Affiliate status ended", category: "affiliates" },
  AFFILIATE_OVERRIDE_CHANGED: { label: "Affiliate invite limit changed", category: "affiliates" },
  AFFILIATE_ACCOUNT_BLOCKED: { label: "Plex account blocked", category: "affiliates" },
  AFFILIATE_ACCOUNT_UNBLOCKED: { label: "Plex account unblocked", category: "affiliates" },
  AFFILIATE_INVITE_CREATED: { label: "Affiliate invite made", category: "affiliates" },
  AFFILIATE_INVITE_CANCELLED: { label: "Affiliate invite cancelled", category: "affiliates" },
  AFFILIATE_REDEMPTION_REFUSED: { label: "Affiliate invite refused", category: "affiliates" },

  SUBSCRIPTION_CANCELED: { label: "Subscription cancelled", category: "billing" },
  SUBSCRIPTION_ACCESS_GRANTED: { label: "Access granted and made exempt", category: "billing" },
  SUBSCRIPTION_EXEMPT_CHANGED: { label: "Exemption changed", category: "billing" },
  STRIPE_EVENT_FAILED: { label: "Stripe event failed", category: "billing" },

  REWIND_SHARE_CREATED: { label: "Rewind shared", category: "rewind" },
  REWIND_SHARE_UPDATED: { label: "Rewind share changed", category: "rewind" },
  REWIND_SHARE_ROTATED: { label: "Rewind share link replaced", category: "rewind" },
  REWIND_SHARE_REVOKED: { label: "Rewind share stopped", category: "rewind" },
  SHARE_LINK_REVOKED: { label: "Old Rewind share link revoked", category: "rewind" },
  REWIND_TITLE_HIDDEN: { label: "Title hidden from Rewind", category: "rewind" },
  REWIND_TITLE_UNHIDDEN: { label: "Title shown in Rewind again", category: "rewind" },
  REWIND_REGENERATE_REQUESTED: { label: "Rewind regeneration asked for", category: "rewind" },
  REWIND_ROLLED_BACK: { label: "Rewind rolled back", category: "rewind" },
  REWIND_SEASON_PREPARED: { label: "Rewind season prepared", category: "rewind" },
  REWIND_SEASON_DATA_PREPARED: { label: "Rewind season data prepared", category: "rewind" },
  REWIND_GENERATE_ALL_STARTED: { label: "Rewind generation started for all", category: "rewind" },
  REWIND_RETRY_FAILED: { label: "Failed Rewinds retried", category: "rewind" },
  REWIND_FINAL_CUT_STARTED: { label: "Rewind final cut started", category: "rewind" },
  PROMPT_TEMPLATE_CHANGED: { label: "Rewind prompt changed", category: "rewind" },

  ASSISTANT_TOOL_CALLED: { label: "Assistant tool used", category: "assistant" },
  ASSISTANT_TOOL_DENIED: { label: "Assistant tool refused", category: "assistant" },
  ASSISTANT_MCP_CALL: { label: "Assistant MCP tool used", category: "assistant" },
  ASSISTANT_SOURCE_CHANGED: { label: "Assistant source changed", category: "assistant" },

  DISCORD_ACCOUNT_LINKED: { label: "Discord account linked", category: "discord" },
  DISCORD_ACCOUNT_UNLINKED: { label: "Discord account unlinked", category: "discord" },
  DISCORD_COMMAND_DENIED: { label: "Discord command refused", category: "discord" },
  DISCORD_INTEGRATION_CONFIG_CHANGED: { label: "Discord settings changed", category: "discord" },
  DISCORD_TOKEN_ROTATED: { label: "Discord bot token changed", category: "discord" },

  ANNOUNCEMENT_CREATED: { label: "Announcement created", category: "announcements" },
  ANNOUNCEMENT_UPDATED: { label: "Announcement edited", category: "announcements" },
  ANNOUNCEMENT_DELETED: { label: "Announcement deleted", category: "announcements" },
  ANNOUNCEMENT_STATUS_CHANGED: { label: "Announcement shown or hidden", category: "announcements" },

  QUEUE_PAUSED: { label: "Job queue paused", category: "jobs" },
  QUEUE_RESUMED: { label: "Job queue resumed", category: "jobs" },
  QUEUE_JOB_REMOVED: { label: "Job removed", category: "jobs" },
  QUEUE_JOB_RETRIED: { label: "Job retried", category: "jobs" },
  QUEUE_SYNC_TRIGGERED: { label: "Sync started by hand", category: "jobs" },

  CONFIG_CHANGED: { label: "Settings changed", category: "settings" },
  SERVER_TIMEZONE_CHANGED: { label: "Server time zone changed", category: "settings" },
  LLM_PROVIDER_CHANGED: { label: "LLM provider changed", category: "settings" },
  SERVICE_ROWS_DEDUPED: { label: "Duplicate services turned off", category: "settings" },
  INACTIVITY_SETTINGS_CHANGED: { label: "Inactivity settings changed", category: "settings" },

  SETUP_CLAIMED: { label: "Setup claimed", category: "setup" },
  SETUP_STEP_SKIPPED: { label: "Setup step skipped", category: "setup" },

  MEMBER_CONTENT_VIEWED: { label: "Member's content opened", category: "reads" },
  MEMBER_CONTENT_LISTED: { label: "Members' content listed", category: "reads" },
  REWIND_ADMIN_VIEWED: { label: "Member's Rewind opened", category: "reads" },
  ASSISTANT_DATA_READ: { label: "Assistant read app data", category: "reads" },
  AUDIT_LOG_VIEWED: { label: "Audit log opened", category: "reads" },
}

/** Every event type the enum knows, in the order above. */
export const AUDIT_EVENT_NAMES = Object.keys(AUDIT_EVENTS) as AuditEventName[]

export function isKnownEventType(type: string): type is AuditEventName {
  return Object.hasOwn(AUDIT_EVENTS, type)
}

/** The event's label; a type the enum does not know shows as stored. */
export function eventLabel(type: string): string {
  return isKnownEventType(type) ? AUDIT_EVENTS[type].label : type
}

/** The event's category, or null for a type the enum does not know. */
export function eventCategory(type: string): AuditCategory | null {
  return isKnownEventType(type) ? AUDIT_EVENTS[type].category : null
}

/** The event types filed under `category`. */
export function typesIn(category: AuditCategory): AuditEventName[] {
  return AUDIT_EVENT_NAMES.filter((type) => AUDIT_EVENTS[type].category === category)
}
