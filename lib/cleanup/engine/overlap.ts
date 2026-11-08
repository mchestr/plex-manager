/**
 * Overlapping rules (TS 6.8, E21): the merged settings of the live rules that
 * hold one item, its leave date, the show floor and the overlap counts of the
 * rule card footer. Pure and client-safe. Day keys move with `addDays()`.
 *
 * `showLeaveFloor()` is the pure part of the show floor. The database read of
 * the season rows (`leaving`, `approved` and `deleting`) is
 * `readShowLeaveFloor()` in `lib/cleanup/run/show-raise.ts` (safety-r8-2).
 *
 * @module lib/cleanup/engine/overlap
 */

import { addDays } from "@/lib/ui/date-range"
import type { RuleThen } from "@/lib/validations/cleanup-rule"
import { ACTION_CARE, type ActionId, type Mode } from "@/lib/validations/cleanup-vocabulary"

/** A live rule that holds the item. */
export interface HoldingRule {
  id: string
  mode: Mode
  createdAt: Date | string
  then: RuleThen
}

export interface MergedHolding {
  /** The highest `ACTION_CARE`. Equal care keeps the earlier rule's action. */
  action: ActionId
  /** For a delete action, true when one holding delete rule has it on. Always false for an unmonitor action. */
  importListExclusion: boolean
  /** One holding rule in Review first. */
  needsApproval: boolean
  /** The first holding Review first rule by `createdAt`: the batch `deletion-<ruleId>`. Null without one. */
  batchRuleId: string | null
}

const time = (value: Date | string) => (typeof value === "string" ? Date.parse(value) : value.getTime())
const later = (a: string, b: string | null | undefined): string => (b && b > a ? b : a)
const isDelete = (action: ActionId) => action.endsWith(".delete")

/** The merged action, exclusion, approval and batch of the holding rules (TS 6.8). Null for no rule. */
export function mergeHoldingRules(rules: readonly HoldingRule[]): MergedHolding | null {
  const ordered = [...rules].sort((a, b) => time(a.createdAt) - time(b.createdAt) || (a.id < b.id ? -1 : 1)) // rule ids are unique
  if (ordered.length === 0) return null
  let action = ordered[0].then.action
  for (const rule of ordered) if (ACTION_CARE[rule.then.action] > ACTION_CARE[action]) action = rule.then.action
  const batchRule = ordered.find((rule) => rule.mode === "reviewFirst")
  return {
    action,
    importListExclusion: isDelete(action) && ordered.some((rule) => isDelete(rule.then.action) && rule.then.importListExclusion),
    needsApproval: batchRule !== undefined,
    batchRuleId: batchRule?.id ?? null,
  }
}

const longestGrace = (rules: readonly Pick<HoldingRule, "then">[]) => Math.max(0, ...rules.map((rule) => rule.then.graceDays))

/**
 * The leave date at entry (TS 6.8, 8.5): `max(today + the longest grace of the
 * entering rules, holdUntil)`. A show item also starts at its show floor (E21).
 */
export function entryLeaveOn(rules: readonly Pick<HoldingRule, "then">[], today: string, holdUntil: string | null, showFloor: string | null = null): string {
  return later(later(addDays(today, longestGrace(rules)), holdUntil), showFloor)
}

/** Rules that join later: `max(leaveOn, enteredDay + their grace)`. It never moves earlier (TS 6.8, 8.4 step 6.3). */
export function joinedLeaveOn(leaveOn: string, enteredDay: string, joined: readonly Pick<HoldingRule, "then">[]): string {
  return joined.length === 0 ? leaveOn : later(leaveOn, addDays(enteredDay, longestGrace(joined)))
}

/**
 * The show floor (E21): a show item never leaves before a season of it in
 * Leaving soon. The latest of the show's own date and its seasons' dates. A
 * held season has no date and does not count. So it never moves a show earlier.
 */
export function showLeaveFloor(showLeaveOn: string | null, seasonLeaveOns: readonly (string | null)[]): string | null {
  let floor = showLeaveOn
  for (const day of seasonLeaveOns) if (day !== null) floor = floor === null ? day : later(floor, day)
  return floor
}

export type OverlapKind = "same" | "inShow" | "hasSeasons"

/** The items a rule matches. `showKey` is the show's item key of a season item, else null. */
export interface RuleMatches {
  ruleId: string
  items: readonly { key: string; showKey: string | null }[]
}

/** One entry of `RuleStats.lastEval.overlaps`. */
export interface RuleOverlap {
  ruleId: string
  count: number
  kind: OverlapKind
}

const KIND_ORDER: readonly OverlapKind[] = ["same", "inShow", "hasSeasons"]

/**
 * The overlaps of a rule's matches with each other rule (TS 6.8). `same`: the
 * other rule matches the item. `inShow`: the item is a season of a show that
 * the other rule matches. `hasSeasons`: the item is a show with a season that
 * the other rule matches. Counts above 0 only, the largest first.
 */
export function ruleOverlaps(rule: RuleMatches, others: readonly RuleMatches[]): RuleOverlap[] {
  const result: RuleOverlap[] = []
  for (const other of others) {
    if (other.ruleId === rule.ruleId) continue
    const keys = new Set(other.items.map((item) => item.key))
    const shows = new Set(other.items.flatMap((item) => (item.showKey === null ? [] : [item.showKey])))
    const counts: Record<OverlapKind, number> = { same: 0, inShow: 0, hasSeasons: 0 }
    for (const item of rule.items) {
      if (keys.has(item.key)) counts.same += 1
      if (item.showKey !== null && keys.has(item.showKey)) counts.inShow += 1
      if (shows.has(item.key)) counts.hasSeasons += 1
    }
    for (const kind of KIND_ORDER) if (counts[kind] > 0) result.push({ ruleId: other.ruleId, count: counts[kind], kind })
  }
  return result.sort((a, b) => b.count - a.count)
}
