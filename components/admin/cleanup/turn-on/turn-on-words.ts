/**
 * The words of the turn-on page that depend on the chosen mode (UX 4.6,
 * 8.7, TS 4.4, X14): the title, the start mode, the button, the note under
 * it, the mode cards and the reason a press cannot go through. Every
 * deletion text comes from `actionWords()`. Client-safe.
 *
 * Turn on: a Dry run rule. Change mode: a rule in Review first or
 * Automatic, whose titles are already in Leaving soon.
 *
 * @module components/admin/cleanup/turn-on/turn-on-words
 */

import { actionWords, buttonNoteText, plural } from "@/lib/cleanup/action-words"
import { nounWord } from "@/lib/cleanup/fields/words"
import { checkStops } from "@/lib/cleanup/turn-on"
import type { TurnOnCheck } from "@/lib/cleanup/types/rule-parts"
import type { CleanupTurnOnData } from "@/lib/cleanup/types/screens"

export type TurnOnChoice = CleanupTurnOnData["mode"]

/** The mode names (UX 2). */
export const MODE_NAMES: Record<TurnOnChoice, string> = { reviewFirst: "Review first", automatic: "Automatic" }

/** The Redis reason of TS 9.5 item 4: without the job queue, "Turn on" is disabled. @internal Exported for tests. */
export const REDIS_REASON = "Redis is not set up. Library reads and runs need the job queue."

/** True for Change mode: the rule is live, and its titles are in Leaving soon. */
export const isChangeMode = (data: CleanupTurnOnData): boolean => data.rule.mode !== "dryRun"

/** "Turn on {rule}" or "Change the mode of {rule}" (UX 8.7). */
export const titleText = (data: CleanupTurnOnData): string =>
  isChangeMode(data) ? `Change the mode of ${data.rule.name}` : `Turn on ${data.rule.name}`

const allowed = (data: CleanupTurnOnData, mode: TurnOnChoice) => data.modes.find((m) => m.mode === mode)?.allowed ?? mode === "reviewFirst"

/** The preselected mode, or Review first when Automatic is not allowed. */
export const startMode = (data: CleanupTurnOnData): TurnOnChoice => (allowed(data, data.mode) ? data.mode : "reviewFirst")

/** True when the mode card can be chosen. */
export const modeAllowed = allowed

/** The words of the rule action for the set (TS 4.4). */
const ruleWords = (data: CleanupTurnOnData) =>
  actionWords(data.rule.action, { exclusion: data.rule.importListExclusion, count: data.count, level: data.rule.level })

/** The button names the result (UX 4.6 item 4, 8.7). */
export function buttonLabel(data: CleanupTurnOnData, mode: TurnOnChoice): string {
  if (isChangeMode(data)) return `Switch to ${MODE_NAMES[mode]}`
  return `Put ${plural(data.count, data.rule.level)} in Leaving soon`
}

/** The muted note under the button (UX 8.7 "Button note"). */
export function noteText(data: CleanupTurnOnData, mode: TurnOnChoice): string {
  return mode === "automatic" ? buttonNoteText(ruleWords(data)) : "At the leave date: Review first. Nothing is deleted until you approve."
}

/** "On Dec 8" from Dry run. In Change mode the titles have their own leave dates. */
const leaveWords = (data: CleanupTurnOnData, day: string): string => (isChangeMode(data) ? "At each leave date" : `On ${day}`)

/** The text of a mode card (UX 8.7 "Mode cards"). */
export function modeCardText(data: CleanupTurnOnData, mode: TurnOnChoice, day: string): string {
  const when = leaveWords(data, day)
  if (mode === "reviewFirst") return `${when} the batch waits for you on the Leaving soon tab. Nothing is deleted until you approve it.`
  return `${when} ${ruleWords(data).modeSentence}, inside the daily budget. You can still exclude or postpone any ${nounWord(1, data.rule.level)} before then.`
}

/** The label of the typed approval field (UX 8.7 "Typed field"). */
export const typedLabel = (count: number): string => `Type ${count} to turn on Automatic`

/** Why the press cannot go through, in the order of UX 11.3 item 9.5. */
export type BlockReason =
  | { kind: "redis"; text: string }
  | { kind: "check"; check: TurnOnCheck }
  | { kind: "sameMode"; text: string }
  | { kind: "typed"; text: string }

export interface ReasonInput {
  data: CleanupTurnOnData
  mode: TurnOnChoice
  redis: boolean
  typed: string
}

/** The count to type, or null: Automatic above 50 items (UX 4.6 item 3). */
export const typedCount = (data: CleanupTurnOnData, mode: TurnOnChoice): number | null => (mode === "automatic" ? data.typedApprovalCount : null)

/** The first reason that keeps the button disabled, or null. */
export function blockReason({ data, mode, redis, typed }: ReasonInput): BlockReason | null {
  if (!redis) return { kind: "redis", text: REDIS_REASON }
  const check = data.checks.find((c) => checkStops(c, mode))
  if (check) return { kind: "check", check }
  if (isChangeMode(data) && data.rule.mode === mode) return { kind: "sameMode", text: `This rule is already in ${MODE_NAMES[mode]}.` }
  const count = typedCount(data, mode)
  if (count !== null && typed.trim() !== String(count)) return { kind: "typed", text: `${typedLabel(count)}.` }
  return null
}

/** The checks that stop a press in this mode: they also show at the top of the page below `lg` (UX 4.6 item 6). */
export const stoppingChecks = (data: CleanupTurnOnData, mode: TurnOnChoice): TurnOnCheck[] => data.checks.filter((c) => checkStops(c, mode))

/** The numbers that make a review stale when they change (E28, E34). */
export const numbersOf = (data: CleanupTurnOnData): string => `${data.revision}|${data.count}|${data.keysHash}`
