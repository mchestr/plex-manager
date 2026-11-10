/**
 * The impact of a live rule's draft on Leaving soon (TS 10.6 step 7, UX 7.7,
 * UX 8.6), with the verdict steps of reconcile (TS 8.4 steps 2.2 and 3).
 * Pure and client-safe.
 *
 * For each Leaving soon item of the rule (`leaving` or `approved`):
 *
 * 1. The draft drops the rule from it when the draft's scope leaves it out
 *    (E32, owner-r4-1), or, without blocks, when a protection protects it, a
 *    clause fails, or its match state is unmatched, conflicted or not
 *    managed. An Unknown verdict keeps the rule.
 * 2. With no live rule left, the item leaves (`leave`).
 * 3. Else it keeps its date (`keep`). Its merged action over the rules that
 *    still hold it (`mergeHoldingRules()`) can get less careful, or turn
 *    the import list exclusion on: that also counts in `actionChange`.
 *
 * `join` counts the draft's matches with no item row: they join at the next
 * run, through the entry check, on `joinLeaveOn`. `items` holds the 50
 * largest titles of each group: the new action first, then leave, then join.
 *
 * @module lib/cleanup/preview/impact
 */

import { RESULTS_PAGE_SIZE } from "@/lib/cleanup/constants"
import { entryLeaveOn, type HoldingRule, mergeHoldingRules } from "@/lib/cleanup/engine/overlap"
import { ruleCoversItem } from "@/lib/cleanup/engine/scope"
import type { CompiledRule, ItemResult } from "@/lib/cleanup/engine/types"
import type { Evaluated } from "@/lib/cleanup/preview/results"
import { itemRef } from "@/lib/cleanup/preview/rows"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { ImpactChange, ImpactItem, ItemRef, PreviewImpact } from "@/lib/cleanup/types/preview"
import type { RuleThen } from "@/lib/validations/cleanup-rule"
import { ACTION_CARE, type ActionId, type Level } from "@/lib/validations/cleanup-vocabulary"

/** The `CleanupItem` columns the impact reads. */
export interface ImpactRow {
  itemKey: string
  level: Level
  sectionId: string
  ratingKey: string
  title: string
  year: number | null
  seasonNumber: number | null
  episodeCount: number | null
  seasonCount: number | null
  sizeBytes: bigint | number
  state: string
  ruleIds: readonly string[]
  action: ActionId
  importListExclusion: boolean
}

export interface ImpactInput {
  /** The live rule, with its stored Then under the draft's own values. */
  rule: Omit<HoldingRule, "then"> & { then: RuleThen }
  compiled: CompiledRule
  /** The draft's results by item key (the items it covers). */
  evaluated: ReadonlyMap<string, Evaluated>
  /** The snapshot items of the level by key. */
  byKey: ReadonlyMap<string, SnapshotItem>
  /** The item rows that hold the rule, in any state. */
  rows: readonly ImpactRow[]
  /** The item key of every `CleanupItem` row. */
  rowKeys: ReadonlySet<string>
  /** The other live rules by id. */
  liveRules: ReadonlyMap<string, HoldingRule>
  /** The draft has safety stops: reconcile then keeps the rule on every item it covers (TS 8.4 step 3.1). */
  blocked: boolean
  today: string
  holdUntil: string | null
}

const DROPPED_STATES = new Set(["unmatched", "conflicted", "notManaged"])

/** Reconcile's verdict steps (TS 8.4 step 3) for one result: true when the rule keeps the item. @internal */
export function keepsRule(result: ItemResult): boolean {
  if (result.protections.some((p) => p.verdict === "protects")) return false
  if (result.clauses.some((c) => c.verdict === "fail")) return false
  const unknown = result.match.state === "unknown" || result.clauses.some((c) => c.verdict === "unknown") || result.protections.some((p) => p.verdict === "unknown")
  return unknown || !DROPPED_STATES.has(result.match.state)
}

function rowRef(row: ImpactRow): ItemRef {
  const { itemKey, level, title, year, seasonNumber, episodeCount, seasonCount, sectionId, ratingKey } = row
  return { itemKey, level, title, year, seasonNumber, episodeCount, seasonCount, posterKey: ratingKey, sectionId, sizeBytes: String(row.sizeBytes) }
}

const bytesOf = (ref: ItemRef) => (ref.sizeBytes === null ? -1 : Number(ref.sizeBytes))

/** The 50 largest of a group, each marked with its change. */
function largestOf(refs: readonly ItemRef[], change: ImpactChange): ImpactItem[] {
  return [...refs].sort((a, b) => bytesOf(b) - bytesOf(a) || a.title.localeCompare(b.title, "en")).slice(0, RESULTS_PAGE_SIZE).map((ref) => ({ ...ref, change }))
}

/** The impact of the draft on the rule's items (TS 10.6 step 7). */
export function draftImpact(input: ImpactInput): PreviewImpact {
  const { rule, compiled, evaluated, byKey, liveRules } = input
  const leave: ItemRef[] = []
  const actionChange: ItemRef[] = []
  let keep = 0
  for (const row of input.rows) {
    if (row.state !== "leaving" && row.state !== "approved") continue
    const snap = byKey.get(row.itemKey)
    const result = evaluated.get(row.itemKey)?.result
    const covered = ruleCoversItem(compiled.scope, snap ?? row)
    const stays = covered && (input.blocked || !result || keepsRule(result))
    const others = row.ruleIds.flatMap((id) => (id === rule.id ? [] : (liveRules.get(id) ?? [])))
    const holders = stays ? [...others, rule] : others
    const ref = snap ? itemRef(snap) : rowRef(row)
    const merged = mergeHoldingRules(holders)
    if (!merged) {
      leave.push(ref)
      continue
    }
    keep += 1
    if (ACTION_CARE[merged.action] < ACTION_CARE[row.action] || (merged.importListExclusion && !row.importListExclusion)) actionChange.push(ref)
  }
  const join: ItemRef[] = []
  for (const [key, entry] of evaluated) {
    if (entry.classification.class === "match" && !input.rowKeys.has(key)) join.push(itemRef(entry.result.item))
  }
  return {
    leave: leave.length,
    join: join.length,
    keep,
    joinLeaveOn: entryLeaveOn([rule], input.today, input.holdUntil),
    items: [...largestOf(actionChange, "actionChange"), ...largestOf(leave, "leave"), ...largestOf(join, "join")],
    actionChange: actionChange.length,
  }
}
