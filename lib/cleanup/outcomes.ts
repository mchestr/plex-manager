/**
 * Why a title left Leaving soon (TS 11.4), as stored in `CleanupOutcome.kind`,
 * `.reason` and `.detail`, with the words of History, the exits line and the
 * rule card footer. Also the hold codes of an item that cannot go now, and
 * the unknown causes of TS 4.5. Client-safe.
 *
 * A stored code that a newer build wrote shows raw.
 *
 * @module lib/cleanup/outcomes
 */

import { z } from "zod"

import type { UnknownCause } from "@/lib/cleanup/engine/types"
import { issuePaths, logParseDropped } from "@/lib/cleanup/schema/snapshot"
import { SERVICES, type Service } from "@/lib/validations/cleanup-vocabulary"

export const OUTCOME_KINDS = ["deleted", "failed", "rescued", "released"] as const
export type OutcomeKind = (typeof OUTCOME_KINDS)[number]

export const OUTCOME_REASONS = ["played", "kept", "excluded", "markedKeepForever", "requested", "protected", "newContent",
  "conditionFailed", "notManaged", "recordChanged", "notInLibrary", "ruleOff", "libraryRemoved", "showDeleted", "deleted", "failed"] as const
export type OutcomeReason = (typeof OUTCOME_REASONS)[number]

/** `CleanupOutcome.detail`. Ids and codes only. */
export const outcomeDetailSchema = z.object({
  conditionId: z.string().optional(),
  protectionId: z.string().optional(),
  code: z.string().max(40).optional(),
  service: z.enum(SERVICES).optional(),
  stillUnmonitored: z.enum(["radarr", "sonarr"]).optional(), // a failed delete left the arr record unmonitored (8.9 step 6)
})
export type OutcomeDetail = z.infer<typeof outcomeDetailSchema>

/** A stored detail, or `{}` when it is missing or does not parse (logged by issue path). Never throws. */
export function parseOutcomeDetail(raw: unknown): OutcomeDetail {
  if (raw === null || raw === undefined) return {}
  const parsed = outcomeDetailSchema.safeParse(raw)
  if (parsed.success) return parsed.data
  logParseDropped("outcomeDetail", 1, issuePaths(parsed.error))
  return {}
}

/** The fixed words of each reason. A Map, so a stored reason such as "toString" never reads an Object member. */
const REASON_WORDS = new Map<string, string>([
  ["played", "A member played it."],
  ["kept", "A member kept it."],
  ["excluded", "You excluded it."],
  ["markedKeepForever", "A member marked it Keep forever."],
  ["requested", "A member requested it."],
  ["newContent", "New episodes arrived."],
  ["notManaged", "Radarr or Sonarr no longer matches it."],
  ["recordChanged", "Its Radarr or Sonarr record changed."],
  ["notInLibrary", "It left Plex."],
  ["ruleOff", "Its rule left Leaving soon."],
  ["libraryRemoved", "Its library left the rule."],
  ["showDeleted", "Its show was deleted."],
  ["deleted", "Deleted."],
] satisfies [OutcomeReason, string][])

export interface OutcomeWords {
  service: (service: Service) => string
  /** The sentence of a protection: a global protection (UX 5.4.1) or a rule protection. */
  protection: (protectionId: string) => string
  /** The field label of a condition of the rule ("Last played"). */
  condition: (conditionId: string) => string
  /** The words of a failure code (`lib/ui/error-copy.ts`). */
  failure: (code: string) => string
}

/** The words of an outcome (History, the rule card footer). */
export function outcomeWords(reason: string, detail: OutcomeDetail, words: OutcomeWords): string {
  let text: string
  if (reason === "protected") text = detail.protectionId ? words.protection(detail.protectionId) : "A protection keeps it safe."
  else if (reason === "conditionFailed") text = detail.conditionId ? `It no longer matches: ${words.condition(detail.conditionId)}.` : "It no longer matches."
  else if (reason === "failed") text = detail.code ? words.failure(detail.code) : "The delete failed."
  else text = REASON_WORDS.get(reason) ?? reason
  return detail.stillUnmonitored ? `${text} Still unmonitored in ${words.service(detail.stillUnmonitored)}.` : text
}

/** A bucket of the 7-day exits line (TS 11.4). */
export type ExitBucket = "played" | "kept" | "other"
export interface ExitCounts {
  played: number
  kept: number
  other: number
}

/** The exits line bucket of a reason, or null for a deletion or a failure (not an exit from Leaving soon). */
export function exitBucket(reason: string): ExitBucket | null {
  if (reason === "deleted" || reason === "showDeleted" || reason === "failed") return null
  if (reason === "played") return "played"
  if (reason === "kept" || reason === "markedKeepForever") return "kept"
  return "other"
}

/** "In the last 7 days, 3 titles left Leaving soon: 1 kept by a member, 1 played, 1 for other reasons." Null at 0. */
export function exitsLine(counts: ExitCounts): string | null {
  const total = counts.kept + counts.played + counts.other
  if (total === 0) return null
  const clauses: string[] = []
  if (counts.kept > 0) clauses.push(`${counts.kept} kept by ${counts.kept === 1 ? "a member" : "members"}`)
  if (counts.played > 0) clauses.push(`${counts.played} played`)
  if (counts.other > 0) clauses.push(`${counts.other} for other reasons`)
  return `In the last 7 days, ${total} ${total === 1 ? "title" : "titles"} left Leaving soon: ${clauses.join(", ")}.`
}

export interface CauseWords {
  service: (service: Service) => string
  /** The read time of the failed source ("3:07 AM"), when known. */
  readAt?: string | null
}

/** The words of an unknown cause (TS 4.5), as a sentence. */
export function unknownCauseText(cause: UnknownCause, words: CauseWords): string {
  if (cause.kind === "sourceFailed") {
    const service = words.service(cause.service)
    return words.readAt ? `${service} did not answer at ${words.readAt}.` : `${service} did not answer.`
  }
  switch (cause.what) {
    case "history":
      return "Tautulli history has no start date."
    case "access":
      return "Plex did not answer, so access is unknown."
    case "requester":
      return "The requester has no Plex account in Overseerr."
    case "size":
      return "Size unknown."
    case "season":
      return "No season number."
    case "date":
      return "Date unknown."
  }
}

const NO_VALUES = ["date", "size", "season", "requester", "access", "history"] as const
const isService = (value: string): value is Service => (SERVICES as readonly string[]).includes(value)

/**
 * The words of a hold code (`CleanupItem.holdCode`, status "On hold"), as a
 * status sub with no final period: `sourceFailed:<service>`, `noValue:<what>`,
 * `noValue:g12`, `matchUnknown` and `plexMissing`. An unknown code shows raw.
 */
export function holdCodeWords(code: string, words: CauseWords): string {
  const [kind, value = ""] = code.split(":", 2)
  let text: string | null = null
  if (code === "noValue:g12") text = "Too many recent plays of the show to check"
  else if (code === "plexMissing") text = "Plex does not list it now"
  else if (code === "matchUnknown") text = "Radarr or Sonarr did not answer"
  else if (kind === "sourceFailed" && isService(value)) text = unknownCauseText({ kind: "sourceFailed", service: value }, words)
  else if (kind === "noValue") {
    const what = NO_VALUES.find((v) => v === value)
    if (what) text = unknownCauseText({ kind: "noValue", what }, words)
  }
  return text === null ? code : text.replace(/\.$/, "")
}
