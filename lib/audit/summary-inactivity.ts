/**
 * The one-line summaries of the inactivity sweep audit events, which
 * `lib/audit/summary.ts` spreads into its table. Each one reads only the keys
 * named below, and its words come from closed lists (statuses, reasons and
 * block codes), a count or a formatted date. Free text in the details never
 * reaches the line, so Support can read it.
 *
 * | Event                          | Details read                                   | Summary                                                                          |
 * |--------------------------------|------------------------------------------------|----------------------------------------------------------------------------------|
 * | `MEMBER_UNSHARED`              | `status`, `reason`, `lastSeenAt`, `offboarded` | "Removed for inactivity, last seen Mar 3, 2026"                                  |
 * | `INACTIVITY_SWEEP_RUN`         | `qualified`, `removed`, `failed`, `blocked`    | "Removed 2 of 3 inactive members", "Removed no one: Another run was in progress" |
 * | `INACTIVITY_SETTINGS_CHANGED`  | `section`, `changedFields`, `after`            | "Turned on, 180 days", "Threshold 90 days", "Warning emails turned on, 30, 7 and 1 days before removal" |
 * | `INACTIVITY_EXCLUSION_CHANGED` | `excluded`                                     | "Excluded from the inactivity sweep"                                             |
 * | `ACTIVITY_SYNC_TRIGGERED`      | `queued`, `confirmedRemovals`                  | "Queued, 3 removals confirmed"                                                   |
 *
 * A block code shows only when `lib/inactivity/blocks.ts` knows it, and a date
 * only formatted. A removal whose clean-up failed (`offboarded: false`) ends
 * ", clean-up not finished". Details that do not have the expected shape give
 * no summary (null).
 *
 * @module lib/audit/summary-inactivity
 */

import type { AuditEventName } from "@/lib/audit/events"
import type { Summarize, SummaryFormat } from "@/lib/audit/summary"
import { type InactivityBlock, INACTIVITY_BLOCKS, inactivityBlockLabel } from "@/lib/inactivity/blocks"

type Details = Record<string, unknown>

const isRecord = (value: unknown): value is Details => typeof value === "object" && value !== null && !Array.isArray(value)

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0

const isInstant = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value))

const isBlock = (value: unknown): value is InactivityBlock => (INACTIVITY_BLOCKS as readonly unknown[]).includes(value)

const counted = (f: SummaryFormat, n: number, one: string, many: string) => `${f.number(n)} ${n === 1 ? one : many}`

function unshared(details: Details, f: SummaryFormat): string | null {
  if (details.status === "already_removed") return "Share was already gone"
  if (details.status !== "removed") return null
  if (details.reason !== "inactivity") return "Share removed"
  if (details.lastSeenAt === null) return "Removed for inactivity, never seen"
  return isInstant(details.lastSeenAt) ? `Removed for inactivity, last seen ${f.date(details.lastSeenAt)}` : "Removed for inactivity"
}

function memberUnshared(details: Details, f: SummaryFormat): string | null {
  const line = unshared(details, f)
  return line && details.offboarded === false ? `${line}, clean-up not finished` : line
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

/** "30, 7 and 1 days" from whole counts, or null for anything else. */
function leadDays(value: unknown, f: SummaryFormat): string | null {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isCount)) return null
  const shown = value.map((n) => f.number(n))
  const list = shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`
  return `${list} ${value.length === 1 && value[0] === 1 ? "day" : "days"}`
}

function warningSettings(changedFields: unknown[], after: Details, f: SummaryFormat): string | null {
  const days = leadDays(after.warningDays, f)
  if (changedFields.includes("warningsEnabled") && typeof after.warningsEnabled === "boolean") {
    if (!after.warningsEnabled) return "Warning emails turned off"
    return days ? `Warning emails turned on, ${days} before removal` : "Warning emails turned on"
  }
  return changedFields.includes("warningDays") && days ? `Warning emails ${days} before removal` : null
}

function inactivitySettings({ section, changedFields, after }: Details, f: SummaryFormat): string | null {
  if (!Array.isArray(changedFields) || !isRecord(after)) return null
  if (section === "inactivity-warnings") return warningSettings(changedFields, after, f)
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

/** The inactivity summaries, by event type. */
export const INACTIVITY_SUMMARIES: Partial<Record<AuditEventName, Summarize>> = {
  MEMBER_UNSHARED: memberUnshared,
  INACTIVITY_SWEEP_RUN: sweepRun,
  INACTIVITY_SETTINGS_CHANGED: inactivitySettings,
  INACTIVITY_EXCLUSION_CHANGED: inactivityExclusion,
  ACTIVITY_SYNC_TRIGGERED: activitySync,
}
