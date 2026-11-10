/**
 * `postponeCleanupItems` without the action shell (TS 10.3, E21, E37,
 * architecture-r6-3, safety-r7-3, architecture-r7-4). Server-only.
 *
 * - Item form (`itemKeys`): one transaction per key (`postponeKey()`).
 * - Batch form (`batch`): the set of the batch footer, built again on the
 *   server (`resolveBatchTarget()`). Every key is due, so each gets one new
 *   date, `addDays(today, days)`. Movies and shows go in groups of at most
 *   100 keys, one `updateMany` per group whose `where` holds the states and
 *   `leaveOn <= today`, so a key that another postpone moved keeps its later
 *   date, and a key approved in the window loses its approval. One count per
 *   group of its rows in `deleting` gives `skipped`. Seasons keep the
 *   transaction per key for the show raise.
 *
 * A conflict error stops the action with `CONFLICT`. The keys written before
 * keep their new dates; they still get the audit row and the collection sync
 * (safety-r8-1, owner-r8-2, architecture-r8-1). One skipped key of an
 * `itemKeys` list of one gives `CLEANUP_DELETING`.
 *
 * @module lib/cleanup/actions/items/postpone
 */

import "server-only"

import type { z } from "zod"

import { ok } from "@/lib/actions/result"
import { type CleanupDay, loadDay, resolveBatchTarget } from "@/lib/cleanup/actions/items/batch"
import { MOVABLE_STATES, postponeData, postponeKey } from "@/lib/cleanup/actions/items/postpone-key"
import { distinct, isWriteConflict, itemsConflict, type ItemsResult, refuse } from "@/lib/cleanup/actions/items/result"
import { requestCollectionSync } from "@/lib/cleanup/collections/request"
import { keyList } from "@/lib/cleanup/run/release"
import { ROWS_PER_TRANSACTION } from "@/lib/cleanup/run/show-raise"
import type { PostponeCleanupItemsResult } from "@/lib/cleanup/types/actions"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { addDays } from "@/lib/ui/date-range"
import type { postponeInput } from "@/lib/validations/cleanup-actions"

export type PostponeInput = z.output<typeof postponeInput>

interface Ctx {
  userId: string
  now: Date
  day: CleanupDay
  days: number
}

/** What the action wrote so far: the keys that moved, their new dates, the skipped count. */
class Tally {
  readonly keys: string[] = []
  readonly dates: string[] = []
  skipped = 0
  add(keys: readonly string[], day: string) {
    this.keys.push(...keys)
    this.dates.push(...keys.map(() => day))
  }
  result(): PostponeCleanupItemsResult {
    const sorted = [...this.dates].sort()
    return { postponed: this.keys.length, skipped: this.skipped, firstLeaveOn: sorted[0] ?? null, lastLeaveOn: sorted[sorted.length - 1] ?? null }
  }
}

/** One key in its own transaction. False when another writer changed it twice: the action stops. */
async function oneKey(itemKey: string, tally: Tally, ctx: Ctx, dueOnly: boolean): Promise<boolean> {
  const done = await postponeKey(itemKey, { days: ctx.days, today: ctx.day.today, userId: ctx.userId, now: ctx.now, dueOnly })
  if (done.kind === "postponed") tally.add([itemKey], done.day)
  if (done.kind === "skipped") tally.skipped += 1
  return done.kind !== "conflict"
}

/** One group of movies or shows of the batch form (architecture-r6-3). */
async function oneGroup(keys: readonly string[], tally: Tally, ctx: Ctx): Promise<void> {
  const day = addDays(ctx.day.today, ctx.days)
  const where = { itemKey: { in: [...keys] }, state: { in: MOVABLE_STATES }, leaveOn: { lte: ctx.day.today } }
  const { count } = await prisma.cleanupItem.updateMany({ where, data: postponeData(day, ctx.userId, ctx.now) })
  const [written, deleting] = await Promise.all([
    count > 0 ? prisma.cleanupItem.findMany({ where: { itemKey: { in: [...keys] }, postponedAt: ctx.now, postponedBy: ctx.userId }, select: { itemKey: true } }) : [],
    prisma.cleanupItem.count({ where: { itemKey: { in: [...keys] }, state: "deleting" } }),
  ])
  tally.add(written.map((row) => row.itemKey), day)
  tally.skipped += deleting
}

/** Runs the writes; false when it stopped on a conflict. */
async function write(keys: readonly string[], levels: ReadonlyMap<string, string> | null, tally: Tally, ctx: Ctx): Promise<boolean> {
  try {
    if (!levels) {
      for (const key of keys) if (!(await oneKey(key, tally, ctx, false))) return false
      return true
    }
    const grouped = keys.filter((key) => levels.get(key) !== "season")
    for (let i = 0; i < grouped.length; i += ROWS_PER_TRANSACTION) await oneGroup(grouped.slice(i, i + ROWS_PER_TRANSACTION), tally, ctx)
    for (const key of keys) if (levels.get(key) === "season" && !(await oneKey(key, tally, ctx, true))) return false
    return true
  } catch (error) {
    if (isWriteConflict(error)) return false
    throw error
  }
}

/** Postpones the keys or the batch, audits and asks for a collection sync (TS 10.3). */
export async function postponeItems(input: PostponeInput, { userId, now }: { userId: string; now: Date }): Promise<ItemsResult<PostponeCleanupItemsResult>> {
  const day = await loadDay(now)
  const ctx: Ctx = { userId, now, day, days: input.days }
  let keys: string[]
  let levels: Map<string, string> | null = null
  let batch: Record<string, unknown> = {}
  if (input.batch) {
    const target = await resolveBatchTarget(input.batch, day)
    if ("success" in target) return target
    keys = target.items.map((item) => item.itemKey)
    levels = new Map(target.items.map((item) => [item.itemKey, item.level]))
    batch = { batchId: target.batchId, excluded: target.excluded }
  } else {
    keys = distinct(input.itemKeys ?? [])
  }
  const tally = new Tally()
  const finished = await write(keys, levels, tally, ctx)
  if (tally.keys.length > 0 || tally.skipped > 0) {
    logAuditEvent(AuditEventType.CLEANUP_ITEMS_POSTPONED, userId, { ...keyList(tally.keys), days: input.days, skipped: tally.skipped, ...batch })
  }
  if (tally.keys.length > 0) await requestCollectionSync("postpone")
  if (!finished) return itemsConflict()
  if (!input.batch && keys.length === 1 && tally.skipped === 1) return refuse("CLEANUP_DELETING")
  return ok(tally.result())
}
