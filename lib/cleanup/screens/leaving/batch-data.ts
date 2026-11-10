/**
 * The batch cards of the Leaving soon tab (UX 4.7.1, TS 10.5, E35, X3), from
 * the batches of `groupBatches()` (`lib/cleanup/run/batches.ts`).
 * Server-only: it pages with `batchPage()` and reads the run that held an
 * entry batch.
 *
 * A deletion card carries `reviewedAt` (the render time), the `batchHash()`
 * of its items, the least careful action, the counts per action and with the
 * exclusion, the budget plan, the oversize titles and one page of rows,
 * largest first. An entry card names the run that held it and the entry
 * check count that its matches passed.
 *
 * @module lib/cleanup/screens/leaving/batch-data
 */

import "server-only"

import { type Batch, batchPage } from "@/lib/cleanup/run/batches"
import { itemName, itemRefOf, lastPlayedOf, levelOf } from "@/lib/cleanup/screens/leaving/item-ref"
import type { BatchData, DeletionBatchData, EntryBatchData } from "@/lib/cleanup/types/list-parts"
import { prisma } from "@/lib/prisma"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import type { ActionId } from "@/lib/validations/cleanup-vocabulary"

/** The run that held an entry batch started at most this long after the hold time (TS 8.3 steps 1 and 5). */
const HELD_RUN_SLACK_MS = 15 * 60_000

export interface CardInput {
  now: Date
  today: string
  ruleName: (ruleId: string) => string
  /** The rows page of a deletion batch (`batchPage` param). */
  page: (batchId: string) => number
  /** The stored Why of the rows on the shown pages, by item key. */
  whys: ReadonlyMap<string, unknown>
}

const iso = (date: Date) => date.toISOString()

/** A deletion batch card, or null for a batch with no item. */
export function deletionCard(batch: Batch, input: CardInput): DeletionBatchData | null {
  if (batch.action === null) return null
  const { rows, page, pageCount } = batchPage(batch, input.page(batch.id))
  const names = new Map(batch.items.map((item) => [item.itemKey, itemName(item)]))
  const checked = batch.items.map((item) => item.checkedAt.getTime())
  const plan = batch.plan ?? { today: { count: 0, bytes: 0n }, lastDay: null }
  return {
    kind: "deletion", id: batch.id, ruleId: batch.ruleId, ruleName: input.ruleName(batch.ruleId), level: levelOf(batch.items[0].level),
    action: batch.action, importListExclusion: batch.importListExclusion, actionCounts: batch.actionCounts, exclusionCount: batch.exclusionCount,
    count: batch.count, bytes: batch.bytes.toString(), keysHash: batch.keysHash, reviewedAt: iso(input.now),
    dueAt: batch.dueAt ?? input.today, dueSince: batch.dueSince ?? input.today,
    checkedAt: iso(new Date(Math.min(...checked))),
    plan: { today: { count: plan.today.count, bytes: plan.today.bytes.toString() }, lastDay: plan.lastDay },
    oversize: batch.oversize.map((o) => ({ title: names.get(o.itemKey) ?? o.itemKey, day: o.day })),
    rows: rows.map((row) => ({ ...itemRefOf(row), action: row.action as ActionId, importListExclusion: row.importListExclusion,
      lastPlayedAt: lastPlayedOf(input.whys.get(row.itemKey)) })),
    rowsPage: page, rowsPageCount: pageCount,
  }
}

/** When the entry check held the batch: the oldest `heldAt` of its items, else the oldest `createdAt`. */
export function heldAtOf(batch: Pick<Batch, "items">): Date {
  const times = batch.items.map((item) => (item.heldAt ?? item.createdAt).getTime())
  return new Date(Math.min(...times))
}

/**
 * The entry check count that the held matches passed ("more than {limit}",
 * X3). The count limit when the batch is above it, else the percent limit
 * of the items that the rule checked last.
 */
export function entryLimit(count: number, entryCheck: CleanupOptions["entryCheck"], checked: number | null): number {
  if (count > entryCheck.count || checked === null) return entryCheck.count
  return Math.floor((checked * entryCheck.percent) / 100)
}

/** An entry batch card. */
export function entryCard(batch: Batch, input: CardInput, heldBy: EntryBatchData["heldBy"], limit: number): EntryBatchData {
  return {
    kind: "entry", id: batch.id, ruleId: batch.ruleId, ruleName: input.ruleName(batch.ruleId), level: levelOf(batch.items[0].level),
    count: batch.count, bytes: batch.bytes.toString(), keysHash: batch.keysHash, reviewedAt: iso(input.now), heldBy, limit,
  }
}

/**
 * The run that held an entry batch (X3): the newest live run with held
 * matches that started before the hold time, with a slack for the time
 * between its start and its row. A run that an admin started reads "in the
 * run at {time}", else "last night".
 */
export async function readHeldBy(batch: Pick<Batch, "items">): Promise<EntryBatchData["heldBy"]> {
  const heldAt = heldAtOf(batch)
  const run = await prisma.cleanupRun.findFirst({
    where: { kind: "run", held: { gt: 0 }, startedAt: { lte: new Date(heldAt.getTime() + HELD_RUN_SLACK_MS) } },
    orderBy: { startedAt: "desc" },
    select: { trigger: true },
  })
  return { trigger: run?.trigger === "admin" ? "admin" : "scheduled", at: iso(heldAt) }
}

const dueOf = (batch: BatchData) => (batch.kind === "deletion" ? batch.dueAt : "")
const heldOf = (batch: BatchData) => (batch.kind === "entry" ? batch.heldBy.at : "")

/** Deletion cards first, newest due date first (UX 4.7.1), then entry cards, newest hold first. Then by rule name. */
export function sortCards(cards: readonly BatchData[]): BatchData[] {
  const kind = (batch: BatchData) => (batch.kind === "deletion" ? 0 : 1)
  return [...cards].sort((a, b) => kind(a) - kind(b) || dueOf(b).localeCompare(dueOf(a)) || heldOf(b).localeCompare(heldOf(a))
    || a.ruleName.localeCompare(b.ruleName))
}
