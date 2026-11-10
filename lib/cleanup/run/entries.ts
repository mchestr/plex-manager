/**
 * New matches and the entry check (TS 8.5, E13), and `joinItems()` for the
 * turn-on page and an entry-batch approval, which skip the entry check
 * (TS 10.3). Server-only. The caller holds the run claim.
 *
 * `addNewMatches(ctx)`, for each live rule without blocks:
 *
 * 1. Candidates: its `match` items with no `CleanupItem` row, and with no
 *    `deleted` or `rescued` outcome after the snapshot was taken
 *    (`exitedSince`): a title that the act step deleted, or rescued on fresh
 *    reads, never enters again from an older snapshot (correctness review
 *    C-03). The next read decides.
 * 2. A waiting entry batch (a `held` row of the rule) skips the rule: the
 *    run adds no new item for it while the batch waits (`waitingBatch`).
 * 3. Above `entryCheck.count`, or above `entryCheck.percent` of the items it
 *    checked, the rule holds every candidate.
 *
 * Then, before any row is created, the active protections are read again
 * (one query), so a Keep or an exclusion made during the run never comes
 * back as a new row. An item joins through the rules that matched it and
 * did not hold it: a `leaving` row with `ruleIds` = every live rule without
 * blocks that matches it, and `leaveOn = firstLeaveOn = max(today + the
 * longest grace of the joining rules, holdUntil)`. With no joining rule, the
 * rules that held it make a `held` row. Rows go in with `createMany`
 * (`skipDuplicates`), seasons first, with the show floor (E21,
 * `insertItemRows()`). One `CLEANUP_ITEMS_ENTERED` row per rule names its
 * joined keys, and one `CLEANUP_ITEMS_HELD` row per rule its held keys.
 *
 * @module lib/cleanup/run/entries
 */

import "server-only"

import { classify } from "@/lib/cleanup/engine/classify"
import { evaluateRule } from "@/lib/cleanup/engine/evaluate"
import { entryLeaveOn } from "@/lib/cleanup/engine/overlap"
import { coversKey, protectionKeys } from "@/lib/cleanup/engine/protections"
import type { ItemResult } from "@/lib/cleanup/engine/types"
import { activeProtectionWhere } from "@/lib/cleanup/protections"
import { type LiveRule, matchingRules, type ReconcileContext, snapshotFields, whyOf, writeChecked } from "@/lib/cleanup/run/reconcile"
import { keyList, mergeLive, mergeWrite, thensOf } from "@/lib/cleanup/run/release"
import { insertItemRows, raiseShowLeaveOn, readShowLeaveFloor, ROWS_PER_TRANSACTION, seasonsFirst, showKeyOf, TRANSACTION_OPTIONS } from "@/lib/cleanup/run/show-raise"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { type CleanupItem, Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"

/** The entry of one rule in the run (TS 8.5 step 4). */
export interface RuleEntry {
  ruleId: string
  checked: number
  candidates: number
  /** The entry check held every candidate. */
  held: boolean
  waitingBatch: boolean
  joined: string[]
  heldKeys: string[]
}

export interface EntriesResult {
  rules: RuleEntry[]
  /** Rows created in `leaving` and in `held`. */
  joined: number
  held: number
  /** Candidates that a protection made during the run took out. */
  protectedNow: number
}

type Holder = { rule: LiveRule; result: ItemResult }
type Candidate = Holder & { entry: RuleEntry }

/** The active protections, read again (TS 8.5): a test of whether one covers the item through the cascade of TS 5.4. */
async function protectedNow(now: Date): Promise<(item: SnapshotItem) => boolean> {
  const rows = await prisma.cleanupProtection.findMany({ where: activeProtectionWhere(now), select: { itemKey: true } })
  return (item) => rows.some((row) => coversKey(protectionKeys(item), row.itemKey))
}

/** A new row. `joining` null: a `held` row. Null when the item has no arr record or no rule gives a merge. */
function newRow(item: SnapshotItem, holders: readonly Holder[], joining: readonly LiveRule[] | null, ctx: ReconcileContext) {
  const rules = holders.map((h) => h.rule)
  const merged = mergeLive(rules)
  if (!merged || !item.arr) return null
  const leaveOn = joining ? entryLeaveOn(thensOf(joining), ctx.today, ctx.settings.holdUntil) : null
  const why = whyOf(rules, new Map(holders.map((h) => [h.rule.id, h.result])), ctx)
  const { service, id, titleSlug, path } = item.arr
  return {
    itemKey: item.key, level: item.level, titleKey: item.titleKey, seasonNumber: item.seasonNumber, ...snapshotFields(item),
    arr: { service, id, titleSlug, path }, state: joining ? "leaving" : "held", ruleIds: rules.map((rule) => rule.id), action: merged.action,
    importListExclusion: merged.importListExclusion, needsApproval: merged.needsApproval, heldAt: joining ? null : ctx.now,
    enteredAt: joining ? ctx.now : null, leaveOn, firstLeaveOn: leaveOn, why: why ?? Prisma.JsonNull, lastRunId: ctx.runId, checkedAt: ctx.now,
  } satisfies Prisma.CleanupItemCreateManyInput
}

/**
 * The item keys that left Leaving soon as `deleted` or `rescued` after
 * `takenAt`, the time of the snapshot that a run or a turn-on reads. That
 * snapshot does not know the exit, so its match of such a title is stale.
 */
export async function exitedSince(takenAt: string | null | undefined): Promise<Set<string>> {
  const at = takenAt ? new Date(takenAt) : null
  if (!at || Number.isNaN(at.getTime())) return new Set()
  const rows = await prisma.cleanupOutcome.findMany({ where: { kind: { in: ["deleted", "rescued"] }, actedAt: { gt: at } }, select: { itemKey: true },
    distinct: ["itemKey"] })
  return new Set(rows.map((row) => row.itemKey))
}

/** The candidates of each live rule without blocks, the entry check, and the rows (TS 8.5). */
export async function addNewMatches(ctx: ReconcileContext): Promise<EntriesResult> {
  const result: EntriesResult = { rules: [], joined: 0, held: 0, protectedNow: 0 }
  const { snapshot, evaluation } = ctx
  if (!snapshot || !evaluation) return result
  const [existing, exited] = await Promise.all([prisma.cleanupItem.findMany({ select: { itemKey: true, state: true, ruleIds: true } }),
    exitedSince(snapshot.header.facts.takenAt)])
  const keys = new Set([...existing.map((row) => row.itemKey), ...exited])
  const waiting = new Set(existing.flatMap((row) => (row.state === "held" ? row.ruleIds : [])))
  const { count, percent } = ctx.settings.options.entryCheck
  const entries = new Map<string, RuleEntry>()
  const matched = new Map<string, { item: SnapshotItem; holders: Candidate[] }>()
  for (const rule of ctx.rules.values()) {
    if (rule.blocks.length > 0 || !rule.compiled) continue
    const results = evaluateRule(rule.compiled, snapshot.levels[rule.compiled.scope.level]?.items ?? [], evaluation)
    const candidates = results.filter((r) => !keys.has(r.item.key) && classify(r).class === "match")
    const waitingBatch = waiting.has(rule.id)
    const held = !waitingBatch && (candidates.length > count || candidates.length * 100 > percent * results.length)
    const entry: RuleEntry = { ruleId: rule.id, checked: results.length, candidates: candidates.length, held, waitingBatch, joined: [], heldKeys: [] }
    entries.set(rule.id, entry)
    for (const r of candidates) matched.set(r.item.key, { item: r.item, holders: [...(matched.get(r.item.key)?.holders ?? []), { rule, result: r, entry }] })
  }
  const isProtected = await protectedNow(ctx.now)
  const rows: Prisma.CleanupItemCreateManyInput[] = []
  for (const { item, holders } of matched.values()) {
    const joining = holders.filter((h) => !h.entry.held && !h.entry.waitingBatch)
    const holding = joining.length > 0 ? holders : holders.filter((h) => h.entry.held)
    if (holding.length === 0) continue // only a rule with a waiting batch matched it
    if (isProtected(item)) {
      result.protectedNow += 1
      continue
    }
    const row = newRow(item, holding, joining.length > 0 ? joining.map((h) => h.rule) : null, ctx)
    if (!row) continue
    rows.push(row)
    for (const h of joining.length > 0 ? joining : holding) h.entry[joining.length > 0 ? "joined" : "heldKeys"].push(item.key)
    result[joining.length > 0 ? "joined" : "held"] += 1
  }
  await insertItemRows(rows)
  for (const entry of entries.values()) {
    const base = { runId: ctx.runId, ruleId: entry.ruleId }
    if (entry.joined.length > 0) logAuditEvent(AuditEventType.CLEANUP_ITEMS_ENTERED, ctx.actorId, { ...base, ...keyList(entry.joined) })
    if (entry.heldKeys.length > 0) logAuditEvent(AuditEventType.CLEANUP_ITEMS_HELD, ctx.actorId, { ...base, ...keyList(entry.heldKeys) })
  }
  result.rules = [...entries.values()]
  return result
}

export interface JoinInput {
  /** The rule that joins, as `ctx.rules` holds it after its mode write. */
  rule: LiveRule
  /** Turn-on (TS 10.3 step 8): the rule's matches. A key with no row gets a `leaving` row. A row joins through reconcile rules. */
  matches?: readonly ItemResult[]
  /** An entry-batch approval: held rows of the rule that become `leaving`. */
  held?: readonly CleanupItem[]
}

/** Moves held rows to `leaving` (TS 10.3 `approveCleanupEntryBatch`): a show at its show floor (safety-r7-2), a season with its show raise. */
async function approveHeld(rows: readonly CleanupItem[], rule: LiveRule, ctx: ReconcileContext): Promise<string[]> {
  const joined: string[] = []
  const ordered = seasonsFirst(rows)
  for (let i = 0; i < ordered.length; i += ROWS_PER_TRANSACTION) {
    await prisma.$transaction(async (tx) => {
      for (const row of ordered.slice(i, i + ROWS_PER_TRANSACTION)) {
        const rules = [rule, ...row.ruleIds.filter((id) => id !== rule.id).flatMap((id) => ctx.rules.get(id) ?? [])]
        const merged = mergeLive(rules)
        if (!merged) continue // no rule whose definition parses gives a grace period
        const floor = row.level === "show" ? await readShowLeaveFloor(tx, row.itemKey) : null
        const leaveOn = entryLeaveOn(thensOf(rules), ctx.today, ctx.settings.holdUntil, floor)
        const data = { state: "leaving", heldAt: null, enteredAt: ctx.now, leaveOn, firstLeaveOn: leaveOn, ...mergeWrite(row, merged) }
        const { count } = await tx.cleanupItem.updateMany({ where: { id: row.id, state: "held", ruleIds: { has: rule.id }, updatedAt: row.updatedAt }, data })
        if (count > 0 && row.level === "season") await raiseShowLeaveOn(tx, showKeyOf(row.titleKey), leaveOn)
        if (count > 0) joined.push(row.itemKey)
      }
    }, TRANSACTION_OPTIONS)
  }
  return joined
}

/**
 * Joins items with no entry check (TS 10.3): the matches of a rule that the
 * turn-on page turned on, or the held rows of an approved entry batch. A
 * protection made after the review keeps its title out. A turn-on never
 * joins a `held` row of another rule: that row waits for its own batch. Returns the keys that
 * joined Leaving soon and the count of rows that an action changed meanwhile.
 */
export async function joinItems(ctx: ReconcileContext, input: JoinInput): Promise<{ joined: string[]; skipped: number }> {
  if (input.held) {
    const joined = await approveHeld(input.held, input.rule, ctx)
    return { joined, skipped: input.held.length - joined.length }
  }
  const results = input.matches ?? []
  const isProtected = await protectedNow(ctx.now)
  const rows = await prisma.cleanupItem.findMany({ where: { itemKey: { in: results.map((r) => r.item.key) } } })
  const byKey = new Map(rows.map((row) => [row.itemKey, row]))
  const created: Prisma.CleanupItemCreateManyInput[] = []
  const joined: string[] = []
  let skipped = 0
  for (const result of results) {
    const row = byKey.get(result.item.key)
    // A held row waits for its own rules' entry batch: joining it would give this rule a waiting batch (C-07)
    if (isProtected(result.item) || row?.state === "deleting" || row?.state === "held" || row?.ruleIds.includes(input.rule.id)) continue
    if (!row) {
      const holders = [{ rule: input.rule, result }, ...matchingRules(result.item, ctx, [input.rule.id])]
      const fresh = newRow(result.item, holders, holders.map((h) => h.rule), ctx)
      if (fresh) created.push(fresh)
      continue
    }
    const holding = [...row.ruleIds.flatMap((id) => ctx.rules.get(id) ?? []), input.rule]
    const checked = { item: result.item, dropped: [], holding, joined: [input.rule], holdCode: row.holdCode, results: new Map([[input.rule.id, result]]) }
    if (!(await writeChecked(row, checked, ctx))) skipped += 1
    else if (row.state !== "held") joined.push(row.itemKey)
  }
  await insertItemRows(created)
  return { joined: [...joined, ...created.map((row) => row.itemKey)], skipped }
}
