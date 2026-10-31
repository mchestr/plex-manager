/**
 * One line about an audit event, built only from known keys of its stored
 * details and from closed vocabularies (section and field names, reasons,
 * statuses, roles, surfaces, block codes). Free text in the details, such as
 * an exemption note, never reaches the line, so it is safe to show to Support,
 * who never see the details themselves.
 *
 * | Event                          | Details read                                  | Summary                                                  |
 * |--------------------------------|-----------------------------------------------|----------------------------------------------------------|
 * | `MEMBER_UNSHARED`              | `status`, `reason`, `lastSeenAt`              | "Removed for inactivity, last seen Mar 3, 2026"          |
 * | `INACTIVITY_SWEEP_RUN`         | `qualified`, `removed`, `failed`, `blocked`   | "Removed 2 of 3 inactive members"                        |
 * | `INACTIVITY_SETTINGS_CHANGED`  | `changedFields`, `after`                      | "Turned on, 180 days", "Turned off", "Threshold 90 days" |
 * | `INACTIVITY_EXCLUSION_CHANGED` | `excluded`                                    | "Excluded from the inactivity sweep"                     |
 * | `ACTIVITY_SYNC_TRIGGERED`      | `queued`, `confirmedRemovals`                 | "Queued, 3 removals confirmed"                           |
 * | `CONFIG_CHANGED`               | `section`, `changedFields`, `secretChanged`   | "plex: url, a secret"                                    |
 * | `SESSIONS_REVOKED`             | `reason`                                      | "Reason: Account disabled"                               |
 * | `USER_ROLE_CHANGED`            | `previousRole`, `newRole`                     | "Given the Support role", "Support role removed"         |
 * | `MEMBER_CONTENT_VIEWED`        | `surface`                                     | "Activity timeline"                                      |
 * | `MEMBER_CONTENT_LISTED`        | `surface`                                     | "Watchlist sync page"                                    |
 * | `AUDIT_LOG_VIEWED`             | which `filters` are set, never their values   | "No filters", "Filters: category, member"                |
 *
 * A section or field name shows only when it looks like code (`setup.plex`,
 * `apiKey`), a block code only when `lib/inactivity/blocks.ts` knows it, and a
 * date only formatted. An `AUDIT_LOG_VIEWED` row for one event page reads
 * "Opened one event". Any other type, or details that do not have the
 * expected shape, has no summary (null).
 *
 * @module lib/audit/summary
 */

import { type AuditEventName, isKnownEventType } from "@/lib/audit/events"
import { type InactivityBlock, INACTIVITY_BLOCKS, inactivityBlockLabel } from "@/lib/inactivity/blocks"
import { parseRole, ROLES } from "@/lib/permissions"
import type { MemberListSurface, MemberReadSurface } from "@/lib/security/audit-log"
import type { SessionRevocationReason } from "@/lib/session-revocation"
import type { BoundFormat } from "@/lib/utils/format"

/** The formatters a summary uses; `bindFormat`'s result fits. */
type SummaryFormat = Pick<BoundFormat, "date" | "number">

type Details = Record<string, unknown>
type Summarize = (details: Details, f: SummaryFormat) => string | null

const isRecord = (value: unknown): value is Details => typeof value === "object" && value !== null && !Array.isArray(value)

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0

const isInstant = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value))

const isBlock = (value: unknown): value is InactivityBlock => (INACTIVITY_BLOCKS as readonly unknown[]).includes(value)

/** A section or field name as code writes it (`setup.plex`, `apiKey`); free text never matches. */
const CODE_NAME = /^[A-Za-z][\w.-]{0,63}$/
const isCodeName = (value: unknown): value is string => typeof value === "string" && CODE_NAME.test(value)

const counted = (f: SummaryFormat, n: number, one: string, many: string) => `${f.number(n)} ${n === 1 ? one : many}`

function memberUnshared(details: Details, f: SummaryFormat): string | null {
  if (details.status === "already_removed") return "Share was already gone"
  if (details.status !== "removed") return null
  if (details.reason !== "inactivity") return "Share removed"
  if (details.lastSeenAt === null) return "Removed for inactivity, never seen"
  return isInstant(details.lastSeenAt) ? `Removed for inactivity, last seen ${f.date(details.lastSeenAt)}` : "Removed for inactivity"
}

function sweepRun({ qualified, removed, failed, blocked }: Details, f: SummaryFormat): string | null {
  if (!isCount(qualified) || !isCount(removed) || !isCount(failed)) return null
  const reason = isBlock(blocked) ? `: ${inactivityBlockLabel(blocked)}` : ""
  const blockedRun = blocked !== null && blocked !== undefined
  if (blockedRun && removed === 0) return `Removed no one${reason}`
  if (qualified === 0) return "Found no inactive members"
  const done = `Removed ${f.number(removed)} of ${counted(f, qualified, "inactive member", "inactive members")}`
  if (blockedRun) return `${done}, then stopped${reason}`
  return failed > 0 ? `${done}, ${f.number(failed)} failed` : done
}

function inactivitySettings({ changedFields, after }: Details, f: SummaryFormat): string | null {
  if (!Array.isArray(changedFields) || !isRecord(after)) return null
  const days = isCount(after.thresholdDays) ? counted(f, after.thresholdDays, "day", "days") : null
  if (changedFields.includes("enabled") && typeof after.enabled === "boolean") {
    if (!after.enabled) return "Turned off"
    return days ? `Turned on, ${days}` : "Turned on"
  }
  return changedFields.includes("thresholdDays") && days ? `Threshold ${days}` : null
}

function inactivityExclusion({ excluded }: Details): string | null {
  if (typeof excluded !== "boolean") return null
  return excluded ? "Excluded from the inactivity sweep" : "Included in the inactivity sweep again"
}

function activitySync({ queued, confirmedRemovals }: Details, f: SummaryFormat): string | null {
  if (typeof queued !== "boolean") return null
  const start = queued ? "Queued" : "Ran at once"
  return isCount(confirmedRemovals) && confirmedRemovals > 0
    ? `${start}, ${counted(f, confirmedRemovals, "removal", "removals")} confirmed`
    : start
}

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
  "llm-usage-detail": "LLM request",
  "llm-conversation": "LLM conversation",
  "rewind-history": "Rewind history",
  "chatbot-tautulli": "Assistant Tautulli lookup",
  "discord-activity": "Discord activity page",
  "watchlist-history": "Watchlist sync page",
  affiliates: "Affiliates page",
}

function surface(details: Details): string | null {
  return typeof details.surface === "string" && Object.hasOwn(SURFACES, details.surface)
    ? SURFACES[details.surface as keyof typeof SURFACES]
    : null
}

/** The audit log's filters in words, by their `auditLogViewed` keys; `to` goes with `from`. */
const FILTER_WORDS = { category: "category", type: "event", actor: "who did it", member: "member", run: "run", from: "dates" }

function auditLogViewed({ filters }: Details): string | null {
  if (!isRecord(filters)) return null
  if (filters.event !== undefined) return "Opened one event"
  const used = Object.entries(FILTER_WORDS).flatMap(([key, words]) => (filters[key] ? [words] : []))
  return used.length > 0 ? `Filters: ${used.join(", ")}` : "No filters"
}

const SUMMARIES: Partial<Record<AuditEventName, Summarize>> = {
  MEMBER_UNSHARED: memberUnshared,
  INACTIVITY_SWEEP_RUN: sweepRun,
  INACTIVITY_SETTINGS_CHANGED: inactivitySettings,
  INACTIVITY_EXCLUSION_CHANGED: inactivityExclusion,
  ACTIVITY_SYNC_TRIGGERED: activitySync,
  CONFIG_CHANGED: configChanged,
  SESSIONS_REVOKED: sessionsRevoked,
  USER_ROLE_CHANGED: roleChanged,
  MEMBER_CONTENT_VIEWED: surface,
  MEMBER_CONTENT_LISTED: surface,
  AUDIT_LOG_VIEWED: auditLogViewed,
}

/** The event's one-line summary, or null when its type has none or its details do not fit. */
export function auditSummary(type: string, details: unknown, f: SummaryFormat): string | null {
  const summarize = isKnownEventType(type) ? SUMMARIES[type] : undefined
  return summarize && isRecord(details) ? summarize(details, f) : null
}
