/**
 * Releases of a rule's items (TS 8.12, 8.4 step 8, 11.1): `releaseRule()`
 * for a rule that moves to Dry run or is deleted, the audit rows of
 * released titles, the 500-key lists of the item audit rows, the merge of
 * live rules (TS 6.8) and the approval check of E31 that every merge write
 * uses. Server-only.
 *
 * `releaseRule(ruleId, actorId)`: items whose only live rule it was exit as
 * `released` (`ruleOff`). The other items lose the id and get the merge of
 * their other live rules again. An `approved` item whose merged action got
 * less careful, or whose exclusion turned on, goes back to `leaving` (E31).
 * Held items of the rule are released with no audit row of their own. One
 * `CLEANUP_ITEMS_RELEASED` row names the Leaving soon titles that left.
 * The caller holds the run claim (TS 10.3).
 *
 * @module lib/cleanup/run/release
 */

import "server-only"

import { type HoldingRule, type MergedHolding, mergeHoldingRules } from "@/lib/cleanup/engine/overlap"
import { exitItem } from "@/lib/cleanup/run/exit"
import type { LiveRule } from "@/lib/cleanup/run/reconcile"
import type { CleanupItem } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { parseRuleDefinition } from "@/lib/validations/cleanup-draft"
import { ACTION_CARE, type ActionId, type Mode } from "@/lib/validations/cleanup-vocabulary"

/** An item audit row holds at most this many item keys, then `more` (TS 11.1). @internal */
export const AUDIT_KEYS_MAX = 500

/** The `count`, `itemKeys` (at most 500) and `more` of an item audit row. */
export function keyList(keys: readonly string[]): { count: number; itemKeys: string[]; more: number } {
  return { count: keys.length, itemKeys: keys.slice(0, AUDIT_KEYS_MAX), more: Math.max(0, keys.length - AUDIT_KEYS_MAX) }
}

/** The Leaving soon titles that left through one rule for one reason (`ruleOff` or `libraryRemoved`). */
export interface ReleasedGroup {
  ruleId: string
  reason: "ruleOff" | "libraryRemoved"
  keys: string[]
}

/** Adds a key to its rule and reason group. */
export function addReleased(groups: Map<string, ReleasedGroup>, ruleId: string, reason: ReleasedGroup["reason"], key: string): void {
  const id = `${ruleId}|${reason}`
  const group = groups.get(id) ?? { ruleId, reason, keys: [] }
  group.keys.push(key)
  groups.set(id, group)
}

/** One `CLEANUP_ITEMS_RELEASED` row per group with keys (TS 8.4 step 8). */
export function auditReleased(groups: Iterable<ReleasedGroup>, actorId: string): void {
  for (const { ruleId, reason, keys } of groups) {
    if (keys.length > 0) logAuditEvent(AuditEventType.CLEANUP_ITEMS_RELEASED, actorId, { ruleId, reason, ...keyList(keys) })
  }
}

/**
 * E31: an approval covers the action that the approve dialog named. It stays
 * while the merged action is as careful as the stored one, and the import
 * list exclusion does not turn on. A stored action this build does not know
 * counts as the most careful, so the approval clears.
 * @internal Exported for the tests.
 */
export function keepsApproval(row: Pick<CleanupItem, "action" | "importListExclusion">, merged: Pick<MergedHolding, "action" | "importListExclusion">): boolean {
  const stored = Object.hasOwn(ACTION_CARE, row.action) ? ACTION_CARE[row.action as ActionId] : Number.POSITIVE_INFINITY
  return ACTION_CARE[merged.action] >= stored && !(merged.importListExclusion && !row.importListExclusion)
}

/** A live rule as a merge input (TS 6.8). Null for a rule whose definition does not parse. @internal */
export const holdingOf = (rule: LiveRule): HoldingRule | null =>
  rule.definition && { id: rule.id, mode: rule.mode, createdAt: rule.createdAt, then: rule.definition.then }

/** The merge inputs of the rules whose definitions parse: their grace periods. */
export const thensOf = (rules: readonly LiveRule[]): HoldingRule[] => rules.flatMap((rule) => holdingOf(rule) ?? [])

/** The merge of live rules (TS 6.8). Null for none, or when one has no definition that parses: the row then keeps its merge. */
export function mergeLive(rules: readonly LiveRule[]): MergedHolding | null {
  const holding = thensOf(rules)
  return holding.length === rules.length ? mergeHoldingRules(holding) : null
}

/** The merge columns of a row, and the approval cleared where E31 says so. */
export function mergeWrite(row: Pick<CleanupItem, "state" | "action" | "importListExclusion">, merged: MergedHolding) {
  const { action, importListExclusion, needsApproval } = merged
  const unapprove = row.state === "approved" && !keepsApproval(row, merged)
  return { action, importListExclusion, needsApproval, ...(unapprove ? { state: "leaving", approvedAt: null, approvedBy: null } : {}) }
}

/** The live rules other than `ruleId`, as merge inputs. A rule whose definition does not parse stays live, with no merge input. */
async function otherLiveRules(ruleId: string): Promise<{ ids: Set<string>; holding: Map<string, HoldingRule> }> {
  const rules = await prisma.cleanupRule.findMany({
    where: { id: { not: ruleId }, mode: { not: "dryRun" } },
    select: { id: true, mode: true, createdAt: true, definition: true },
  })
  const holding = new Map<string, HoldingRule>()
  for (const rule of rules) {
    const parsed = parseRuleDefinition(rule.definition)
    if (parsed.ok) holding.set(rule.id, { id: rule.id, mode: rule.mode as Mode, createdAt: rule.createdAt, then: parsed.definition.then })
  }
  return { ids: new Set(rules.map((rule) => rule.id)), holding }
}

export interface ReleaseRuleResult {
  /** Leaving soon titles that left (`ruleOff`). */
  released: number
  /** Held titles of the rule's entry batches that left. */
  held: number
  /** Items that keep another live rule and got a new merge. */
  updated: number
  /** Rows that an action changed during the release (zero-row writes). */
  skipped: number
}

/** Releases the items of a rule that leaves the live modes (TS 8.12). */
export async function releaseRule(ruleId: string, actorId: string, options: { runId?: string | null } = {}): Promise<ReleaseRuleResult> {
  const [rows, live] = await Promise.all([
    prisma.cleanupItem.findMany({ where: { ruleIds: { has: ruleId }, state: { in: ["held", "leaving", "approved"] } }, orderBy: { itemKey: "asc" } }),
    otherLiveRules(ruleId),
  ])
  const result: ReleaseRuleResult = { released: 0, held: 0, updated: 0, skipped: 0 }
  const keys: string[] = []
  for (const row of rows) {
    const ruleIds = row.ruleIds.filter((id) => id !== ruleId && live.ids.has(id))
    if (ruleIds.length === 0) {
      const exit = await exitItem(row, { kind: "released", reason: "ruleOff", runId: options.runId, actorId, audit: null })
      if (!exit.exited) result.skipped += 1
      else if (row.state === "held") result.held += 1
      else keys.push(row.itemKey)
      continue
    }
    const merged = mergeHoldingRules(ruleIds.flatMap((id) => live.holding.get(id) ?? []))
    const data = { ruleIds, ...(merged ? mergeWrite(row, merged) : {}) }
    const { count } = await prisma.cleanupItem.updateMany({ where: { id: row.id, updatedAt: row.updatedAt }, data })
    result[count > 0 ? "updated" : "skipped"] += 1
  }
  result.released = keys.length
  auditReleased([{ ruleId, reason: "ruleOff", keys }], actorId)
  return result
}
