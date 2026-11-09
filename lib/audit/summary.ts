/**
 * One line about an audit event, built only from known keys of its stored
 * details and from closed vocabularies (section and field names, reasons,
 * statuses, roles, surfaces, block codes, assistant source kinds and actions).
 * Free text in the details, such as an exemption note, never reaches the line,
 * so it is safe to show to Support, who never see the details themselves.
 *
 * | Event                          | Details read                                   | Summary                                                                          |
 * |--------------------------------|------------------------------------------------|----------------------------------------------------------------------------------|
 * | `CONFIG_CHANGED`               | `section`, `changedFields`, `secretChanged`    | "plex: url, a secret"                                                            |
 * | `SESSIONS_REVOKED`             | `reason`                                       | "Reason: Account disabled"                                                       |
 * | `USER_ROLE_CHANGED`            | `previousRole`, `newRole`                      | "Given the Support role", "Support role removed"                                 |
 * | `MEMBER_CONTENT_VIEWED`        | `surface`                                      | "Activity timeline"                                                              |
 * | `MEMBER_CONTENT_LISTED`        | `surface`                                      | "Watchlist sync page"                                                            |
 * | `AUDIT_LOG_VIEWED`             | which `filters` are set, never their values    | "No filters", "Filters: category, member"                                        |
 * | `ASSISTANT_SOURCE_CHANGED`     | `kind`, `action`                               | "Skill source refreshed", "MCP server removed"                                   |
 * | `CLEANUP_SETTINGS_CHANGED`     | as `CONFIG_CHANGED`                            | "cleanup-budget: items, bytes"                                                   |
 * | `EMAIL_TEST_SENT`              | `status`, `smtpCode`                           | "Sent", "Not sent, the mail server did not take it (554)"                        |
 * | `EMAIL_PREFERENCE_CHANGED`     | `enabled`, `via`                               | "Access reminders turned off, with the link in an email"                         |
 *
 * The inactivity sweep events (`MEMBER_UNSHARED`, `INACTIVITY_*` and
 * `ACTIVITY_SYNC_TRIGGERED`) have their summaries in
 * `lib/audit/summary-inactivity.ts`. The media cleanup events (`CLEANUP_*`)
 * other than `CLEANUP_SETTINGS_CHANGED` have theirs in
 * `lib/audit/summary-cleanup.ts` (TS 11.3). Both tables are spread into
 * `SUMMARIES`.
 *
 * A section or field name shows only when it looks like code (`setup.plex`,
 * `apiKey`). An `AUDIT_LOG_VIEWED` row for one event page reads "Opened one
 * event". Any other type, or details that do not have the expected shape, has
 * no summary (null).
 *
 * @module lib/audit/summary
 */

import { type AuditEventName, isKnownEventType } from "@/lib/audit/events"
import { CLEANUP_SUMMARIES } from "@/lib/audit/summary-cleanup"
import { INACTIVITY_SUMMARIES } from "@/lib/audit/summary-inactivity"
import { parseRole, ROLES } from "@/lib/permissions"
import type { MemberListSurface, MemberReadSurface } from "@/lib/security/audit-log"
import type { SessionRevocationReason } from "@/lib/session-revocation"
import type { BoundFormat } from "@/lib/utils/format"

/** The formatters a summary uses; `bindFormat`'s result fits. */
export type SummaryFormat = Pick<BoundFormat, "date" | "number" | "dayKey">

type Details = Record<string, unknown>
/** One event type's summary, from its stored details. */
export type Summarize = (details: Details, f: SummaryFormat) => string | null

const isRecord = (value: unknown): value is Details => typeof value === "object" && value !== null && !Array.isArray(value)

/** Whether `value` is one of `map`'s own keys, so neither free text nor `toString` matches. */
const isKeyOf = <K extends string>(map: Record<K, string>, value: unknown): value is K => typeof value === "string" && Object.hasOwn(map, value)

/** A section or field name as code writes it (`setup.plex`, `apiKey`); free text never matches. */
const CODE_NAME = /^[A-Za-z][\w.-]{0,63}$/
const isCodeName = (value: unknown): value is string => typeof value === "string" && CODE_NAME.test(value)

/** Field names shown before the rest are counted. */
const MAX_FIELDS = 5

function configChanged({ section, changedFields, secretChanged }: Details, f: SummaryFormat): string | null {
  if (!isCodeName(section)) return null
  const fields = Array.isArray(changedFields) ? changedFields.filter(isCodeName) : []
  const parts = fields.slice(0, MAX_FIELDS)
  if (fields.length > MAX_FIELDS) parts.push(`${f.number(fields.length - MAX_FIELDS)} more`)
  if (secretChanged === true) parts.push("a secret")
  return parts.length > 0 ? `${section}: ${parts.join(", ")}` : section
}

const SESSION_REASONS: Record<SessionRevocationReason, string> = {
  unshared: "Plex access removed",
  demoted: "Admin rights or role removed",
  disabled: "Account disabled",
  subscription_revoked: "Subscription access ended",
  removed: "Member removed",
}

function sessionsRevoked({ reason }: Details): string | null {
  return typeof reason === "string" && Object.hasOwn(SESSION_REASONS, reason)
    ? `Reason: ${SESSION_REASONS[reason as SessionRevocationReason]}`
    : null
}

function roleChanged({ previousRole, newRole }: Details): string | null {
  const next = parseRole(newRole)
  if (next) return `Given the ${ROLES[next].label} role`
  if (newRole !== null) return null
  const previous = parseRole(previousRole)
  return previous ? `${ROLES[previous].label} role removed` : "Role removed"
}

const SURFACES: Record<MemberReadSurface | MemberListSurface, string> = {
  "activity-timeline": "Activity timeline",
  "llm-usage-detail": "AI request",
  "llm-conversation": "LLM conversation",
  "rewind-history": "Rewind history",
  "chatbot-tautulli": "Assistant Tautulli lookup",
  "conversation-review": "Conversation review",
  "discord-activity": "Discord activity page",
  "watchlist-history": "Watchlist sync page",
  affiliates: "Affiliates page",
  "conversation-findings": "Conversation findings",
  "cleanup-requesters": "Media cleanup requesters",
  "cleanup-keeps": "Media cleanup Keeps",
}

function surface(details: Details): string | null {
  return typeof details.surface === "string" && Object.hasOwn(SURFACES, details.surface)
    ? SURFACES[details.surface as keyof typeof SURFACES]
    : null
}

const SOURCE_KINDS: Record<"mcp" | "knowledge" | "skill", string> = { mcp: "MCP server", knowledge: "Knowledge base", skill: "Skill source" }
const SOURCE_ACTIONS: Record<"saved" | "deleted" | "refreshed", string> = { saved: "saved", deleted: "removed", refreshed: "refreshed" }

/** "Skill source refreshed": the kind and the action, never the row id. */
function sourceChanged({ kind, action }: Details): string | null {
  return isKeyOf(SOURCE_KINDS, kind) && isKeyOf(SOURCE_ACTIONS, action) ? `${SOURCE_KINDS[kind]} ${SOURCE_ACTIONS[action]}` : null
}

/** The audit log's filters in words, by their `auditLogViewed` keys; `to` goes with `from`. */
const FILTER_WORDS = { category: "category", type: "event", actor: "who did it", member: "member", run: "run", from: "dates" }

function auditLogViewed({ filters }: Details): string | null {
  if (!isRecord(filters)) return null
  if (filters.event !== undefined) return "Opened one event"
  const used = Object.entries(FILTER_WORDS).flatMap(([key, words]) => (filters[key] ? [words] : []))
  return used.length > 0 ? `Filters: ${used.join(", ")}` : "No filters"
}

const TEST_EMAIL_STATUSES: Record<"sent" | "failed" | "not_configured" | "no_address", string> = {
  sent: "Sent",
  failed: "Not sent, the mail server did not take it",
  not_configured: "Not sent, email is not set up",
  no_address: "Not sent, no email address on file",
}

/** "Sent", or why the test email was not sent, with the reply code when there is one. */
function emailTest({ status, smtpCode }: Details): string | null {
  if (!isKeyOf(TEST_EMAIL_STATUSES, status)) return null
  const code = status === "failed" && typeof smtpCode === "number" && Number.isInteger(smtpCode) ? ` (${smtpCode})` : ""
  return `${TEST_EMAIL_STATUSES[status]}${code}`
}

const PREFERENCE_VIA = { account: "on Account", link: "with the link in an email", one_click: "with the mail app's unsubscribe button" }

/** "Access reminders turned off, on Account": the new value and where it changed. */
const emailPreference: Summarize = ({ enabled, via }) =>
  typeof enabled === "boolean" && isKeyOf(PREFERENCE_VIA, via) ? `Access reminders turned ${enabled ? "on" : "off"}, ${PREFERENCE_VIA[via]}` : null

const SUMMARIES: Partial<Record<AuditEventName, Summarize>> = {
  ...INACTIVITY_SUMMARIES,
  CONFIG_CHANGED: configChanged,
  SESSIONS_REVOKED: sessionsRevoked,
  USER_ROLE_CHANGED: roleChanged,
  MEMBER_CONTENT_VIEWED: surface,
  MEMBER_CONTENT_LISTED: surface,
  AUDIT_LOG_VIEWED: auditLogViewed,
  ASSISTANT_SOURCE_CHANGED: sourceChanged,
  ...CLEANUP_SUMMARIES,
  // Section and field names, as CONFIG_CHANGED (TS 11.3)
  CLEANUP_SETTINGS_CHANGED: configChanged,
  EMAIL_TEST_SENT: emailTest,
  EMAIL_PREFERENCE_CHANGED: emailPreference,
}

/** The event's one-line summary, or null when its type has none or its details do not fit. */
export function auditSummary(type: string, details: unknown, f: SummaryFormat): string | null {
  const summarize = isKnownEventType(type) ? SUMMARIES[type] : undefined
  return summarize && isRecord(details) ? summarize(details, f) : null
}
