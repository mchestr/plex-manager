/**
 * Due items, batches and delete candidates (TS 8.7, E7, E28, E35, E36).
 * Batches are not stored. Server-only: the hashes use `node:crypto`. The
 * Leaving soon loader, the batch actions, `getCleanupBatchSelection` and
 * the act step share these helpers.
 *
 * | Set | Items |
 * |---|---|
 * | Deletion batch `deletion-<R>` | due `leaving` items with `needsApproval` whose batch rule is R: the first holding Review first rule by `createdAt` (TS 6.8) |
 * | Entry batch `entry-<R>` | `held` items with R in `ruleIds` |
 * | Delete candidates | `approved` and `deleting` items, and due `leaving` items without `needsApproval`. Not with `holdCode`, nor when every holding rule is blocked |
 *
 * A deletion batch hashes `{itemKey}|{action}|{importListExclusion}` of each
 * item (`batchHash()`, architecture-r3-4), so a changed merged action or
 * exclusion of one item makes an approval stale. An entry batch hashes its
 * keys. Rows sort largest first, then by key, 50 a page.
 *
 * @module lib/cleanup/run/batches
 */

import "server-only"

import { RESULTS_PAGE_SIZE } from "@/lib/cleanup/constants"
import { isDue, planBudget } from "@/lib/cleanup/engine/budget"
import { keysHash } from "@/lib/cleanup/keys-hash"
import type { CleanupBatchSelection } from "@/lib/cleanup/types/screens"
import type { CleanupItem } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { dateRangeToInstants } from "@/lib/ui/date-range"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import { ACTION_CARE, type ActionId, type Level } from "@/lib/validations/cleanup-vocabulary"

type Hashed = Pick<CleanupItem, "itemKey" | "action" | "importListExclusion">

/** The hash of a deletion batch (E35): one `{itemKey}|{action}|{importListExclusion}` string per item, through `keysHash()`. */
export function batchHash(items: readonly Hashed[]): string {
  return keysHash(items.map((item) => `${item.itemKey}|${item.action}|${item.importListExclusion}`))
}

/** The counts that the approve dialog names (E35, E36): the least careful action, the items per action and with the exclusion. */
export function batchCounts(items: readonly Pick<CleanupItem, "action" | "importListExclusion" | "sizeBytes">[]) {
  const actionCounts: Partial<Record<ActionId, number>> = {}
  let action: ActionId | null = null
  for (const item of items) {
    const id = item.action as ActionId
    actionCounts[id] = (actionCounts[id] ?? 0) + 1
    if (action === null || ACTION_CARE[id] < ACTION_CARE[action]) action = id
  }
  const exclusionCount = items.filter((item) => item.importListExclusion).length
  return { count: items.length, bytes: items.reduce((sum, item) => sum + item.sizeBytes, 0n), action, actionCounts, exclusionCount }
}

export interface Batch extends ReturnType<typeof batchCounts> {
  id: string
  kind: "deletion" | "entry"
  ruleId: string
  /** Largest first, then by key. */
  items: CleanupItem[]
  keysHash: string
  /** True when any item has the import list exclusion. */
  importListExclusion: boolean
  /** Deletion: the oldest and the newest leave date. Entry: null. */
  dueSince: string | null
  dueAt: string | null
  /** Deletion: the budget plan if it is approved now (TS 8.7): today's items, and the last day of the rest (null when all go today). */
  plan: { today: { count: number; bytes: bigint }; lastDay: string | null } | null
  oversize: { itemKey: string; day: string }[]
}

/** The rules a batch reads: the mode and `createdAt` decide the batch rule. @internal */
export type BatchRules = ReadonlyMap<string, { mode: string; createdAt: Date }>

/** The batch rule of an item (TS 6.8): its first holding Review first rule by `createdAt`, then id. @internal */
export function batchRuleOf(row: Pick<CleanupItem, "ruleIds">, rules: BatchRules): string | null {
  const ids = row.ruleIds.filter((id) => rules.get(id)?.mode === "reviewFirst")
  const at = (id: string) => rules.get(id)?.createdAt.getTime() ?? 0
  return ids.sort((a, b) => at(a) - at(b) || (a < b ? -1 : 1))[0] ?? null
}

const bySize = (a: CleanupItem, b: CleanupItem) => (b.sizeBytes > a.sizeBytes ? 1 : b.sizeBytes < a.sizeBytes ? -1 : a.itemKey < b.itemKey ? -1 : 1)

export interface BatchInput {
  rows: readonly CleanupItem[]
  rules: BatchRules
  today: string
  holdUntil: string | null
  budget: CleanupOptions["budget"]
  usedToday: { items: number; bytes: number | bigint }
  /** Rules with a safety stop: an item that only such rules hold is no delete candidate. */
  blocked?: ReadonlySet<string>
}

/** The deletion batches, the entry batches and the delete candidates of the rows (TS 8.7). Pure. */
export function groupBatches(input: BatchInput): { deletion: Batch[]; entry: Batch[]; candidates: CleanupItem[] } {
  const { rows, today, holdUntil } = input
  const due = (row: CleanupItem) => isDue(row.leaveOn, today, holdUntil)
  const deletion = new Map<string, CleanupItem[]>()
  const entry = new Map<string, CleanupItem[]>()
  const add = (map: Map<string, CleanupItem[]>, id: string, row: CleanupItem) => map.set(id, [...(map.get(id) ?? []), row])
  const candidates: CleanupItem[] = []
  for (const row of rows) {
    const batchRule = row.state === "leaving" && row.needsApproval && due(row) ? batchRuleOf(row, input.rules) : null
    if (batchRule) add(deletion, batchRule, row)
    if (row.state === "held") for (const id of row.ruleIds) add(entry, id, row)
    const goes = row.state === "approved" || row.state === "deleting" || (row.state === "leaving" && !row.needsApproval && due(row))
    if (goes && !row.holdCode && !(row.ruleIds.length > 0 && row.ruleIds.every((id) => input.blocked?.has(id)))) candidates.push(row)
  }
  const make = (kind: Batch["kind"], ruleId: string, list: CleanupItem[]): Batch => {
    const items = [...list].sort(bySize)
    const days = items.flatMap((item) => (item.leaveOn ? [item.leaveOn] : [])).sort()
    const counts = batchCounts(items)
    const base = { ...counts, id: `${kind}-${ruleId}`, kind, ruleId, items, importListExclusion: counts.exclusionCount > 0 }
    if (kind === "entry") return { ...base, keysHash: keysHash(items.map((item) => item.itemKey)), dueSince: null, dueAt: null, plan: null, oversize: [] }
    const toPlan = [...candidates, ...items].map((item) => ({ ...item, leaveOn: item.leaveOn ?? today, level: item.level as Level }))
    const { plan, oversize } = planBudget({ candidates: toPlan, budget: input.budget, usedToday: input.usedToday, today, holdUntil })
    const own = new Set(items.map((item) => item.itemKey))
    const goToday = items.filter((item) => plan.get(item.itemKey) === today)
    const later = items.flatMap((item) => plan.get(item.itemKey) ?? []).filter((day) => day !== today).sort()
    return { ...base, keysHash: batchHash(items), dueSince: days[0] ?? null, dueAt: days[days.length - 1] ?? null,
      plan: { today: { count: goToday.length, bytes: batchCounts(goToday).bytes }, lastDay: later[later.length - 1] ?? null },
      oversize: oversize.filter((o) => own.has(o.itemKey)) }
  }
  return {
    deletion: [...deletion].map(([ruleId, list]) => make("deletion", ruleId, list)),
    entry: [...entry].map(([ruleId, list]) => make("entry", ruleId, list)),
    candidates,
  }
}

/** Today's deletions so far (TS 8.7 step 5): outcomes `deleted` that were not already gone, acted on today in the server zone. */
export async function readUsedToday(today: string, zone: string): Promise<{ items: number; bytes: bigint }> {
  const actedAt = dateRangeToInstants({ from: today, to: today }, zone)
  const used = await prisma.cleanupOutcome.aggregate({ where: { kind: "deleted", alreadyGone: false, actedAt }, _count: { _all: true }, _sum: { sizeBytes: true } })
  return { items: used._count._all, bytes: used._sum.sizeBytes ?? 0n }
}

/** Reads the item rows, the rules and today's deletions, and gives the batches and the candidates (TS 8.7). */
export async function loadBatches(input: Omit<BatchInput, "rows" | "rules" | "usedToday"> & { zone: string }) {
  const [rows, rules, usedToday] = await Promise.all([
    prisma.cleanupItem.findMany({ where: { state: { in: ["held", "leaving", "approved", "deleting"] } } }),
    prisma.cleanupRule.findMany({ select: { id: true, mode: true, createdAt: true } }),
    readUsedToday(input.today, input.zone),
  ])
  return groupBatches({ ...input, rows, rules: new Map(rules.map((rule) => [rule.id, rule])), usedToday })
}

/** One page of a batch's rows, 50 a page, largest first. The first page starts with the 10 largest. */
export function batchPage(batch: Pick<Batch, "items">, page: number): { rows: CleanupItem[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(batch.items.length / RESULTS_PAGE_SIZE))
  const current = Math.min(Math.max(1, Math.floor(page)), pageCount)
  return { rows: batch.items.slice((current - 1) * RESULTS_PAGE_SIZE, current * RESULTS_PAGE_SIZE), page: current, pageCount }
}

export interface ApprovalInput {
  count: number
  keysHash: string
  excludeKeys?: readonly string[]
  /** What the approve dialog named (E36). Deletion batches only. */
  selected?: { count: number; action: ActionId; exclusionCount: number }
}

export type Approval = { status: "ok"; items: CleanupItem[]; keys: string[]; excluded: number } | { status: "stale" } | { status: "empty" }

/**
 * Rebuilds the approved set (E28, E36, TS 10.3): the batch as the page showed
 * it (`count` and `keysHash`), minus the unticked keys that are in it. An
 * unticked key outside the batch is ignored. A `selected` whose count, least
 * careful action or exclusion count differs from the approved items is stale.
 */
export function resolveApproval(batch: Pick<Batch, "count" | "keysHash" | "items">, input: ApprovalInput): Approval {
  if (batch.count !== input.count || batch.keysHash !== input.keysHash) return { status: "stale" }
  const unticked = new Set(input.excludeKeys ?? [])
  const items = batch.items.filter((item) => !unticked.has(item.itemKey))
  if (items.length === 0) return { status: "empty" }
  const named = batchCounts(items)
  const { selected } = input
  if (selected && (selected.count !== named.count || selected.action !== named.action || selected.exclusionCount !== named.exclusionCount)) {
    return { status: "stale" }
  }
  return { status: "ok", items, keys: items.map((item) => item.itemKey), excluded: batch.items.length - items.length }
}

/** `getCleanupBatchSelection` (E36): the batch counts, and the asked keys that are still in it, with their values. */
export function selectionOf(batch: Batch, keys: readonly string[]): CleanupBatchSelection {
  const asked = new Set(keys)
  return {
    count: batch.count, bytes: batch.bytes.toString(), keysHash: batch.keysHash, actionCounts: batch.actionCounts, exclusionCount: batch.exclusionCount,
    unticked: batch.items.filter((item) => asked.has(item.itemKey)).map((item) => ({ itemKey: item.itemKey, action: item.action as ActionId,
      importListExclusion: item.importListExclusion, sizeBytes: item.sizeBytes.toString() })),
  }
}
