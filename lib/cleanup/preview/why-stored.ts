/**
 * The Why Sheet from History (TS 6.9, UX 4.5 item 3): the stored
 * `WhySnapshot` of an outcome, read only, with `fromRun`. The stored facts
 * hold no member id and no name, so a requester reads only as a member or a
 * former member. A threshold shows when the rule still has that condition.
 * Pure and client-safe.
 *
 * @module lib/cleanup/preview/why-stored
 */

import type { DescribeWords } from "@/lib/cleanup/engine/types"
import { anyFieldMeta } from "@/lib/cleanup/fields/catalog"
import { dateWords, SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import { thresholdText } from "@/lib/cleanup/preview/condition-words"
import { protectionLabel } from "@/lib/cleanup/preview/protection-words"
import type { WhySnapshot } from "@/lib/cleanup/schema/why"
import type { ItemRef, WhySheetData, WhySheetState } from "@/lib/cleanup/types/preview"
import { DEFAULT_LOCALE, formatBytes, formatDate } from "@/lib/utils/format"
import type { ProtectionsOptions } from "@/lib/validations/cleanup-options"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"
import { FIELD_SOURCES, type FieldId, LEVEL_ARR, type Level } from "@/lib/validations/cleanup-vocabulary"

type Facts = WhySnapshot["facts"]

const month = (t: number, zone: string) => formatDate(t * 1000, "month-year-short", { timeZone: zone, locale: DEFAULT_LOCALE })
const date = (t: number, zone: string) => dateWords(new Date(t * 1000).toISOString(), zone)
const ORDINALS = ["", "", "2nd", "3rd"]
const ordinal = (n: number) => ORDINALS[n] ?? `${n}th`

/** The fact phrase of a field from the stored facts (TS 4.5), or none when the run did not know it. */
export function storedFact(field: FieldId, facts: Facts, level: Level, zone: string): string[] {
  const newestRequest = facts.requests.reduce<number | null>((best, r) => (best === null || r.at > best ? r.at : best), null)
  const nobody = facts.importList ? "Came from an import list." : "Nobody requested it."
  switch (field) {
    case "watch.lastPlayed":
      if (facts.countedTotal === null) return []
      if (facts.lastCountedAt !== null) return [`Last played ${date(facts.lastCountedAt, zone)}.`]
      return facts.historyStartAt === null ? ["Never played."] : ["Never played.", `No counted play since Tautulli history starts on ${date(facts.historyStartAt, zone)}.`]
    case "watch.plays":
      if (facts.countedTotal === null) return []
      return [facts.countedTotal === 0 ? "No counted play." : `${facts.countedTotal} ${facts.countedTotal === 1 ? "play" : "plays"} in total.`]
    case "request.exists":
    case "request.age":
      return [newestRequest === null ? nobody : `Requested ${month(newestRequest, zone)}.`]
    case "request.by":
    case "request.requesters":
      if (facts.requests.length === 0) return ["Nobody requested it."]
      return facts.requests.every((r) => r.requester === "former") ? ["Requested only by a former member."] : ["Requested by a member."]
    case "library.added": {
      const texts = [facts.addedPlex === null ? null : `Added to Plex ${date(facts.addedPlex, zone)}.`,
        facts.addedArr === null ? null : `Added to ${SERVICE_NAMES[LEVEL_ARR[level]]} ${date(facts.addedArr, zone)}.`].filter((t): t is string => t !== null)
      return texts.length > 0 ? texts : ["Added date unknown."]
    }
    case "file.size":
      return [facts.sizeBytes === null ? "Size unknown." : `${formatBytes(facts.sizeBytes)}.`]
    case "show.status":
      return [facts.showStatus === null ? "Status unknown." : `${facts.showStatus.charAt(0).toUpperCase()}${facts.showStatus.slice(1)}.`]
    case "show.lastEpisodeAdded":
      return [facts.lastEpisodeAddedAt === null ? "No episode in Plex." : `Last episode added ${month(facts.lastEpisodeAddedAt, zone)}.`]
    case "show.seasonsOnDisk":
      return facts.seasonsOnDisk === null ? [] : [`${facts.seasonsOnDisk} ${facts.seasonsOnDisk === 1 ? "season" : "seasons"} on disk.`]
    case "season.position":
      if (facts.position === null) return ["No season number."]
      return [facts.position === 1 ? "The newest season." : `${ordinal(facts.position)} newest season.`]
  }
}

/** The outcome columns that the Sheet reads. */
export interface StoredOutcome {
  ref: ItemRef
  kind: string
  runId: string | null
}

/** The state of a stored check: deleted, else a failed delete was a match, else the stored verdicts decide. */
function storedState(kind: string, why: WhySnapshot): WhySheetState {
  if (kind === "deleted") return "deleted"
  if (kind === "failed") return "match"
  if (why.protections.some((p) => p.verdict === "protects")) return "protected"
  if (why.conditions.some((c) => c.verdict === "fail")) return "nearMiss"
  if (why.conditions.some((c) => c.verdict === "unknown") || why.match.state === "unknown") return "missing"
  return why.match.state === "matched" ? "match" : "cannotDelete"
}

export interface StoredWhyInput {
  outcome: StoredOutcome
  why: WhySnapshot
  /** The rule as it is now, for thresholds and rule protection labels, or null when it is gone. */
  definition: RuleDefinition | null
  protections: ProtectionsOptions
  words: DescribeWords
  zone: string
}

/** The Why Sheet data of an outcome, from the stored Why (TS 10.5 `fromRun`). */
export function storedWhy({ outcome, why, definition, protections, words, zone }: StoredWhyInput): WhySheetData {
  const level = outcome.ref.level
  const current = new Map((definition?.conditions ?? []).flatMap((c) => ("kind" in c ? c.conditions : [c])).map((c) => [c.id, c]))
  const labels = { protections, ruleProtections: definition?.protections ?? [], level, words }
  return {
    item: outcome.ref,
    state: storedState(outcome.kind, why),
    links: { plexUrl: null, arrUrl: null },
    conditions: why.conditions.map((row) => {
      const c = current.get(row.id)
      return {
        id: row.id,
        label: anyFieldMeta(row.field).label(level),
        verdict: row.verdict,
        value: storedFact(row.field, why.facts, level, zone).map((text) => ({ text })),
        threshold: c && c.field === row.field ? thresholdText(c, words) : "",
        sources: why.sources.filter((s) => FIELD_SOURCES[row.field][level].includes(s.service)),
      }
    }),
    hints: [],
    protections: why.protections.map((p) => ({ id: p.id, label: protectionLabel(p.id, labels), verdict: p.verdict, value: [] })),
    otherRules: [],
    sources: [...why.sources],
    fromRun: { runId: outcome.runId, at: why.checkedAt },
  }
}
