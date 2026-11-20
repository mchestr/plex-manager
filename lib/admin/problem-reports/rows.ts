/**
 * The admin Problem reports pages' rows, from stored reports and events: the
 * statuses behind each filter, how many other members reported a title, and
 * each timeline step in words. Event data is parsed on read, and data of the
 * wrong shape reads as nothing. Pure, so the loaders stay thin.
 *
 * @module lib/admin/problem-reports/rows
 */

import type { ProblemReportFilter } from "@/lib/admin/routes"
import type { ProblemReportStatus } from "@/lib/generated/prisma/client"
import { problemLabel } from "@/lib/problem-reports/taxonomy"
import { closedEventDataSchema, reportEventDataSchema, type DeviceAnswer } from "@/lib/validations/problem-reports"

/** The statuses each filter lists: Needs you is the server admin's; a report sent to run on its own counts as fixing. */
export const FILTER_STATUSES: Record<ProblemReportFilter, readonly ProblemReportStatus[]> = {
  "needs-you": ["WITH_ADMIN"],
  fixing: ["SENT", "FIXING"],
  fixed: ["FIXED"],
  closed: ["CLOSED"],
}

/** Each filter's count, from the counts per status. */
export function filterCounts(byStatus: Partial<Record<ProblemReportStatus, number>>): Record<ProblemReportFilter, number> {
  const count = (filter: ProblemReportFilter) => FILTER_STATUSES[filter].reduce((sum, status) => sum + (byStatus[status] ?? 0), 0)
  return { "needs-you": count("needs-you"), fixing: count("fixing"), fixed: count("fixed"), closed: count("closed") }
}

/** The members besides the reporter who reported or follow the title, each once; a removed member's event has no actor. */
export function otherReporters(reporterId: string, actorIds: readonly (string | null)[]): number {
  return new Set(actorIds.filter((id): id is string => id !== null && id !== reporterId)).size
}

export interface Person {
  id: string
  name: string
}

/** What Tautulli said about how the title played, when the member reported it. */
export interface EvidenceLines {
  lastPlay: { player: string | null; transcoded: boolean; at: Date } | null
  /** Played to the end for anyone since its file was added; null when Tautulli couldn't say. */
  playedToEnd: boolean | null
}

export interface TimelineStep {
  id: string
  at: Date
  /** "Reported: Won't start", "Also reported: No sound", "Following", "Cancelled", "Closed", "Marked fixed". */
  words: string
  actor: Person | null
  /** The member's own words, shown as plain text. */
  note: string | null
  /** Their answer to "Does anything else play on {player}?". */
  device: string | null
  evidence: EvidenceLines | null
}

const DEVICE_WORDS: Record<DeviceAnswer, string> = {
  others_play: "Other titles play fine on their player",
  nothing_plays: "Nothing plays on their player",
  not_tried: "They haven't tried another title",
}

/** A member's step: what they reported, in their words, with their answer and the evidence. */
function memberStep(kind: "REPORTED" | "ALSO_REPORTED", data: unknown) {
  const parsed = reportEventDataSchema.safeParse(data)
  const said = parsed.success ? parsed.data : null
  const problem = said?.problem
  const evidence = said?.evidence
  const words =
    kind === "REPORTED" ? (problem ? `Reported: ${problemLabel(problem)}` : "Reported") : problem ? `Also reported: ${problemLabel(problem)}` : "Following"
  return {
    words,
    note: said?.note ?? null,
    device: said?.device ? DEVICE_WORDS[said.device] : null,
    evidence: evidence ? { lastPlay: evidence.lastPlay && { ...evidence.lastPlay, at: new Date(evidence.lastPlay.at) }, playedToEnd: evidence.playedToEnd } : null,
  }
}

/** One stored event as a timeline step; a kind this build doesn't know keeps its name. */
export function timelineStep(event: { id: string; kind: string; data: unknown; createdAt: Date; actor: Person | null }): TimelineStep {
  const base = { id: event.id, at: event.createdAt, actor: event.actor, note: null, device: null, evidence: null }
  switch (event.kind) {
    case "REPORTED":
    case "ALSO_REPORTED":
      return { ...base, ...memberStep(event.kind, event.data) }
    case "FIXED":
      return { ...base, words: "Marked fixed" }
    case "CLOSED": {
      const closed = closedEventDataSchema.safeParse(event.data)
      return { ...base, words: closed.success && closed.data.reason === "cancelled" ? "Cancelled" : "Closed" }
    }
    default:
      return { ...base, words: event.kind }
  }
}
