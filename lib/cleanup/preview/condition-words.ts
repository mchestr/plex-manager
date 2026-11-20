/**
 * Short words about one condition and one match state, shared by the Why
 * text and the Why Sheet (TS 6.9, UX 8.5): the threshold a near miss needs,
 * the value words of a Try, and the Cannot delete causes. Pure and
 * client-safe.
 *
 * @module lib/cleanup/preview/condition-words
 */

import type { DescribeWords } from "@/lib/cleanup/engine/types"
import { anyFieldMeta, visit } from "@/lib/cleanup/fields/catalog"
import { SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import type { MatchCause, MatchState } from "@/lib/cleanup/schema/snapshot"
import type { Condition } from "@/lib/validations/cleanup-rule"

/**
 * What a condition asks for, after "Needs": "more than 365 days ago, or
 * never", "at least 3". A field with no operator, or an operator with no
 * value, reads as its whole row: "Requested in Overseerr: no", "Last played never".
 */
export function thresholdText(c: Condition, words?: DescribeWords): string {
  const tokens = visit(c, (meta, condition) => meta.tokens(condition, words))
  const colon = anyFieldMeta(c.field).colon === true
  if (tokens.operator !== undefined && tokens.value !== undefined) return [tokens.operator, tokens.value, tokens.after].filter(Boolean).join(" ")
  return [`${tokens.field}${colon ? ":" : ""}`, tokens.operator, tokens.value, tokens.after].filter(Boolean).join(" ")
}

/** The value of a Try as words, "more than 10 months", without "ago" (UX 4.5). */
export function tryValueLabel(c: Condition): string {
  const tokens = visit(c, (meta, condition) => meta.tokens(condition))
  return [tokens.operator, tokens.value].filter(Boolean).join(" ")
}

type Arr = "radarr" | "sonarr"

/** The Cannot delete cause of TS 6.9 as sentences: the first is the cause, the rest its advice. */
const CAUSE_WORDS: Record<MatchCause, (arr: string) => string[]> = {
  noIds: () => ["Plex has no external id."],
  noArrRecord: (arr) => [`No ${arr} record matches.`],
  twoArrRecords: (arr) => [`Two ${arr} records match.`, `Fix it in ${arr}.`],
  conflictingIds: (arr) => [`Two ${arr} records match.`, `Fix it in ${arr}.`],
  outsideArrPath: (arr) => [`The file is outside ${arr}'s root folders.`],
  outsideRoot: (arr) => [`The file is outside ${arr}'s root folders.`],
  noPlexFile: () => ["Plex has no file for it."],
  noSeasonNumber: () => ["The season has no number."],
  noArrSeason: () => ["Sonarr has no such season."],
  arrFailed: (arr) => [`${arr} did not answer.`],
  seasonMismatch: () => ["Plex and Sonarr number the seasons of this show differently."],
  noArrFile: (arr) => [`${arr} has no file for it.`],
}

/** The cause a match state stands for when the snapshot gives none. */
const STATE_CAUSE: Partial<Record<MatchState, MatchCause>> = {
  unmatched: "noArrRecord",
  conflicted: "twoArrRecords",
  notManaged: "outsideArrPath",
}

/** The Cannot delete sentences of an item: its match cause, else the cause its match state stands for. */
export function cannotDeleteWords(cause: MatchCause | undefined, state: MatchState, arr: Arr): string[] {
  const code = cause ?? STATE_CAUSE[state] ?? "noArrRecord"
  return CAUSE_WORDS[code](SERVICE_NAMES[arr])
}
