/**
 * Reconcile (TS 8.4): checks every `CleanupItem` row, or the rows that hold
 * one of `ruleIds` (a save of one rule), against the newest complete
 * snapshot and the live rules. It never creates a row: new matches are
 * `entries.ts` (TS 8.5). Server-only. The caller holds the run claim.
 *
 * Per row, the first step that applies:
 *
 * 1. Rule ids that are gone or in Dry run drop (`ruleOff`). A holding rule
 *    that no longer covers the item drops (`libraryRemoved`, E32).
 * 2. An item that left Plex drops its rules that have no block
 *    (`notInLibrary`). Else each holding rule keeps or drops by
 *    `ruleVerdict()`. A blocked rule stays unchanged (E14).
 * 3. Every other live rule without blocks that covers the item and matches
 *    it joins a `leaving` or `approved` item. A `held` item stays `held`,
 *    and no rule joins it: its `ruleIds` are the rules whose entry check
 *    held it, so another rule never gets a waiting entry batch that stops
 *    its new matches (correctness review C-07). The other rules join once
 *    the batch is approved.
 * 4. No rule left: the item exits (`exitItem()`). Else one optimistic write:
 *    the merge, a later `leaveOn` for joined rules (with the season's show
 *    raise, E21), the hold code, the Why, the snapshot facts, and the E31
 *    approval check. A zero-row write is skipped, and the next run checks
 *    the row again. Rows in `deleting` belong to the act step.
 *
 * `ruleOff` and `libraryRemoved` exits of Leaving soon items write one
 * `CLEANUP_ITEMS_RELEASED` row per rule and reason after the loop. The
 * context is `loadReconcileContext()`, also used by the change check of
 * `run-claim.ts`, the saves and the act step.
 *
 * @module lib/cleanup/run/reconcile
 */

import "server-only"

import type { Block } from "@/lib/cleanup/blocks"
import { classify } from "@/lib/cleanup/engine/classify"
import { evaluateItem } from "@/lib/cleanup/engine/evaluate"
import { joinedLeaveOn } from "@/lib/cleanup/engine/overlap"
import { ruleCoversItem } from "@/lib/cleanup/engine/scope"
import type { CompiledRule, EvalContext, ItemResult } from "@/lib/cleanup/engine/types"
import { whySnapshot } from "@/lib/cleanup/engine/why"
import type { OutcomeDetail, OutcomeReason } from "@/lib/cleanup/outcomes"
import { exitItem, exitKind, ruleVerdict } from "@/lib/cleanup/run/exit"
import { addReleased, auditReleased, mergeLive, mergeWrite, type ReleasedGroup, thensOf } from "@/lib/cleanup/run/release"
import { raiseShowLeaveOn, showKeyOf } from "@/lib/cleanup/run/show-raise"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { CleanupSettingsRow } from "@/lib/cleanup/settings"
import type { LoadedSnapshot } from "@/lib/cleanup/snapshot/cache"
import type { CleanupItem, Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { AuditEventType } from "@/lib/security/audit-log"
import { dayKey } from "@/lib/utils/zoned-time"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"
import type { Level, Mode } from "@/lib/validations/cleanup-vocabulary"

/** A rule in Review first or Automatic, compiled, with its safety stops. A definition that does not parse has the block `invalid`. */
export interface LiveRule {
  id: string
  mode: Mode
  revision: number
  createdAt: Date
  definition: RuleDefinition | null
  compiled: CompiledRule | null
  blocks: Block[]
}

/** What reconcile, the entries and the joins read: the clock, the options, the newest snapshot and every live rule. */
export interface ReconcileContext {
  now: Date
  today: string
  zone: string
  runId: string | null
  actorId: string
  /** The settings row: the options, the hold date, the feature state and the runtime notices. */
  settings: CleanupSettingsRow
  snapshot: LoadedSnapshot | null
  /** Null without a complete snapshot. */
  evaluation: EvalContext | null
  /** In `createdAt` order. */
  rules: ReadonlyMap<string, LiveRule>
}

/** The snapshot facts a row copies (TS 8.4 step 6.4). `ratingKey` and `sectionId` change together (owner-r4-2). */
export function snapshotFields(item: SnapshotItem) {
  return { title: item.title, year: item.year, sectionId: item.sectionId, ratingKey: item.ratingKey, sizeBytes: BigInt(item.sizeBytes ?? 0),
    episodeCount: item.level === "season" ? item.episodeCount : null, seasonCount: item.level === "show" ? (item.show?.seasonsOnDisk ?? null) : null }
}

/** The live rules without blocks that cover the item and match it (TS 8.4 step 4, 8.5), with their results. */
export function matchingRules(item: SnapshotItem, ctx: ReconcileContext, skip: readonly string[] = []): { rule: LiveRule; result: ItemResult }[] {
  const out: { rule: LiveRule; result: ItemResult }[] = []
  for (const rule of ctx.rules.values()) {
    if (skip.includes(rule.id) || rule.blocks.length > 0 || !rule.compiled || !ctx.evaluation || !ruleCoversItem(rule.compiled.scope, item)) continue
    const result = evaluateItem(rule.compiled, item, ctx.evaluation)
    if (classify(result).class === "match") out.push({ rule, result })
  }
  return out
}

/** The Why of the first holding rule that has a result (TS 8.4 step 6.4). */
export function whyOf(holding: readonly LiveRule[], results: ReadonlyMap<string, ItemResult>, ctx: ReconcileContext): Prisma.InputJsonValue | undefined {
  const rule = holding.find((r) => results.has(r.id) && r.compiled)
  const result = rule && results.get(rule.id)
  if (!rule?.compiled || !result || !ctx.evaluation || !ctx.snapshot) return undefined
  const { id: snapshotId, facts, sources } = ctx.snapshot.header
  return whySnapshot(rule.compiled, result, ctx.evaluation, { snapshotId, takenAt: facts.takenAt, ruleId: rule.id, sources })
}

/** Steps 1 to 4 of one row: the rules that still hold it (joined ones last), those that dropped, those that joined, the hold code and the results. */
export interface Checked {
  item: SnapshotItem | null
  dropped: { ruleId: string; reason: OutcomeReason; detail?: OutcomeDetail }[]
  holding: LiveRule[]
  joined: LiveRule[]
  holdCode: string | null
  results: Map<string, ItemResult>
}

function check(row: CleanupItem, ctx: ReconcileContext): Checked {
  const dropped: Checked["dropped"] = []
  const results = new Map<string, ItemResult>()
  let holdCode: string | null = null
  const level = ctx.snapshot?.levels[row.level as Level] ?? null
  const item = level?.byKey.get(row.itemKey) ?? null
  const drop = (rule: LiveRule, reason: OutcomeReason, detail?: OutcomeDetail) => (dropped.push({ ruleId: rule.id, reason, detail }), false)
  let holding = row.ruleIds.flatMap((id) => ctx.rules.get(id) ?? (dropped.push({ ruleId: id, reason: "ruleOff" }), []))
  holding = holding.filter((rule) => !rule.definition || ruleCoversItem(rule.definition, item ?? row) || drop(rule, "libraryRemoved"))
  const leftPlex = !item && level !== null && ctx.evaluation?.sources.plex === "ok"
  const sinceS = Math.floor((row.enteredAt ?? row.heldAt ?? row.createdAt).getTime() / 1000)
  holding = holding.filter((rule) => {
    if (rule.blocks.length > 0 || !rule.compiled || !ctx.evaluation) return true
    if (!item) return !leftPlex || drop(rule, "notInLibrary")
    const result = evaluateItem(rule.compiled, item, ctx.evaluation)
    results.set(rule.id, result)
    const verdict = ruleVerdict(rule.compiled, result, sinceS)
    if (verdict.keep) holdCode ??= verdict.holdCode ?? null
    return verdict.keep || drop(rule, verdict.reason, verdict.detail)
  })
  const joined = item && row.state !== "held" ? matchingRules(item, ctx, row.ruleIds) : []
  for (const { rule, result } of joined) results.set(rule.id, result)
  return { item, dropped, holding: [...holding, ...joined.map((j) => j.rule)], joined: joined.map((j) => j.rule), holdCode, results }
}

/**
 * Step 6: the optimistic write of a row that rules still hold. A season whose
 * `leaveOn` moves raises its show in the same transaction (E21). False when
 * it matched zero rows. `joinItems()` writes the joins of a turn-on with it.
 */
export async function writeChecked(row: CleanupItem, checked: Checked, ctx: ReconcileContext): Promise<boolean> {
  const { item, holding, joined, holdCode, results } = checked
  const merged = mergeLive(holding)
  const leaveOn = row.state !== "held" && row.leaveOn && row.enteredAt
    ? joinedLeaveOn(row.leaveOn, dayKey(row.enteredAt.getTime(), ctx.zone), thensOf(joined)) : row.leaveOn
  const evaluated = item !== null && results.size > 0
  const data: Prisma.CleanupItemUpdateManyMutationInput = { ruleIds: holding.map((rule) => rule.id), ...(merged ? mergeWrite(row, merged) : {}), leaveOn,
    ...(evaluated ? { ...snapshotFields(item), holdCode, why: whyOf(holding, results, ctx), checkedAt: ctx.now, lastRunId: ctx.runId } : {}) }
  const where = { id: row.id, updatedAt: row.updatedAt }
  if (row.level !== "season" || !leaveOn || leaveOn === row.leaveOn) return (await prisma.cleanupItem.updateMany({ where, data })).count > 0
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.cleanupItem.updateMany({ where, data })
    if (count > 0) await raiseShowLeaveOn(tx, showKeyOf(row.titleKey), leaveOn)
    return count > 0
  })
}

export interface ReconcileResult {
  checked: number
  rescued: number
  released: number
  updated: number
  /** Writes that matched zero rows: an action changed the row. The next run checks it again. */
  skipped: number
  /** Rescues per holding rule, for the run entries. */
  rescuedByRule: Record<string, number>
}

/** Reconciles every item row, or the rows that hold one of `ruleIds` (TS 8.4). */
export async function reconcile({ ruleIds, ctx }: { ruleIds?: readonly string[]; ctx: ReconcileContext }): Promise<ReconcileResult> {
  const rows = await prisma.cleanupItem.findMany({
    where: { state: { in: ["held", "leaving", "approved"] }, ...(ruleIds ? { ruleIds: { hasSome: [...ruleIds] } } : {}) },
    orderBy: { itemKey: "asc" },
  })
  const result: ReconcileResult = { checked: rows.length, rescued: 0, released: 0, updated: 0, skipped: 0, rescuedByRule: {} }
  const groups = new Map<string, ReleasedGroup>()
  for (const row of rows) {
    const checked = check(row, ctx)
    const unchanged = checked.dropped.length === 0 && checked.joined.length === 0 && checked.results.size === 0
    if (checked.holding.length > 0) {
      if (unchanged) continue // every holding rule is blocked, or the item cannot be read: E14
      result[(await writeChecked(row, checked, ctx)) ? "updated" : "skipped"] += 1
      continue
    }
    const first = checked.dropped[0] ?? { ruleId: "", reason: "ruleOff" }
    const kind = exitKind(row.state, first.reason)
    const grouped = row.state !== "held" && first.ruleId !== "" && (first.reason === "ruleOff" || first.reason === "libraryRemoved")
    const audit = row.state === "held" || grouped ? null : AuditEventType.CLEANUP_ITEM_RESCUED
    const exit = await exitItem(row, { kind, reason: first.reason, detail: first.detail, runId: ctx.runId, actorId: ctx.actorId, audit })
    result[!exit.exited ? "skipped" : kind === "released" ? "released" : "rescued"] += 1
    if (exit.exited && kind === "rescued") for (const id of row.ruleIds) result.rescuedByRule[id] = (result.rescuedByRule[id] ?? 0) + 1
    if (exit.exited && grouped) addReleased(groups, first.ruleId, first.reason as ReleasedGroup["reason"], row.itemKey)
  }
  auditReleased(groups.values(), ctx.actorId)
  return result
}
