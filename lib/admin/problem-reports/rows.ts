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
import { TO_ADMIN_WORDS, TRIGGER_WORDS } from "@/lib/admin/problem-reports/fix-words"
import { FIX_WORDS, type FixAction } from "@/lib/problem-reports/fixes"
import { problemLabel } from "@/lib/problem-reports/taxonomy"
import {
  closedEventDataSchema,
  fixedEventDataSchema,
  fixStartedDataSchema,
  reportEventDataSchema,
  toAdminDataSchema,
  type DeviceAnswer,
} from "@/lib/validations/problem-reports"

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

/** What a fix that worked did, after "Fixed: ". */
const FIXED_WORDS: Record<FixAction, string> = {
  SWAP: "a different copy is on the server",
  BETTER_COPY: "a better copy is on the server",
  LOOK_FOR_MISSING: "the missing episodes are on the server",
  FIX_MATCH: "Plex has the title Radarr or Sonarr has",
  REFRESH: "Plex read the details again",
  REMOVE_AND_SEARCH: "a new copy is on the server",
}

/** After a replacement's words: whether the bad copy's release is on the blocklist, when that was checked. */
const BLOCKLIST_WORDS = { true: ". The old release is on the blocklist", false: ". The old release isn't on the blocklist, so it could be grabbed again" } as const

/** The server admin's mark, or the words for what a fix did: "Fixed: a different copy is on the server (Heat.1995.1080p.BluRay-GRP)". */
function fixedWords(data: unknown): string {
  const fixed = fixedEventDataSchema.safeParse(data).data
  if (fixed?.reason !== "fix") return "Marked fixed"
  if (!fixed.action) return "Fixed"
  const release = fixed.release ? ` (${fixed.release})` : ""
  const blocklist = typeof fixed.blocklisted === "boolean" ? BLOCKLIST_WORDS[`${fixed.blocklisted}`] : ""
  return `Fixed: ${FIXED_WORDS[fixed.action]}${release}${blocklist}`
}

const CLOSED_WORDS = { cancelled: "Cancelled", admin: "Closed", no_better_copy: "Closed: no better copy right now" } as const

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
      return { ...base, words: fixedWords(event.data) }
    case "REOPENED":
      return { ...base, words: "Asked the server admin to take a look" }
    case "FIX_STARTED": {
      const started = fixStartedDataSchema.safeParse(event.data)
      return { ...base, words: started.success ? `${FIX_WORDS[started.data.action].started}${TRIGGER_WORDS[started.data.trigger]}` : "Started a fix" }
    }
    case "TO_ADMIN": {
      const handed = toAdminDataSchema.safeParse(event.data)
      return { ...base, words: handed.success ? TO_ADMIN_WORDS[handed.data.reason] : "Sent to the server admin" }
    }
    case "CLOSED": {
      const closed = closedEventDataSchema.safeParse(event.data)
      return { ...base, words: closed.success ? CLOSED_WORDS[closed.data.reason] : "Closed" }
    }
    default:
      return { ...base, words: event.kind }
  }
}
