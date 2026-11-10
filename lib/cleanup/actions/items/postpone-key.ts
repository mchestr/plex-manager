/**
 * The Postpone of one key in its own transaction (TS 10.3
 * `postponeCleanupItems`, E21, safety-r5-5, safety-r6-1, safety-r7-1,
 * architecture-r7-1). Server-only.
 *
 * The leave date moves to `addDays(max(leaveOn, today), days)`, later only.
 * The write matches the row as it was read (`id`, `updatedAt`) and
 * `state` in `leaving` or `approved`. It clears an approval, `failCode` and
 * `holdCode`. A key in `deleting` is skipped. A season raises its show in
 * the same transaction with `raiseShowLeaveOn()`. A raise that matches zero
 * rows reads the show row:
 *
 * | Show row | Result |
 * |---|---|
 * | `deleting` | roll the key back: skipped |
 * | `leaving` or `approved`, `leaveOn` on or after the day | keep, no raise |
 * | `leaving` or `approved`, earlier `leaveOn` | raise once more, then read once more: only the case above keeps |
 * | `held`, or no row | keep, no raise |
 *
 * @module lib/cleanup/actions/items/postpone-key
 */

import "server-only"

import { RollbackKey } from "@/lib/cleanup/actions/items/result"
import { raiseShowLeaveOn, showKeyOf, TRANSACTION_OPTIONS } from "@/lib/cleanup/run/show-raise"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { addDays } from "@/lib/ui/date-range"

/** The states whose leave date a Postpone moves. */
export const MOVABLE_STATES = ["leaving", "approved"]

/** The data of every Postpone write: the new date, who and when, and no approval, failure or hold. */
export function postponeData(day: string, userId: string, now: Date) {
  return { leaveOn: day, postponedAt: now, postponedBy: userId, failCode: null, holdCode: null, state: "leaving", approvedAt: null, approvedBy: null }
}

const readShow = (tx: PrismaTransactionClient, showKey: string) =>
  tx.cleanupItem.findUnique({ where: { itemKey: showKey }, select: { state: true, leaveOn: true } })

/** A show row that is late enough: in Leaving soon with a `leaveOn` on or after `day` (case 2). */
const lateEnough = (show: { state: string; leaveOn: string | null } | null, day: string) =>
  show !== null && MOVABLE_STATES.includes(show.state) && show.leaveOn !== null && show.leaveOn >= day

/**
 * Raises the show of a postponed season to `day` (E21). True to keep the
 * postpone, false to roll the key back (the show is being deleted, or it
 * changed twice in the window).
 */
export async function raiseShowOfSeason(tx: PrismaTransactionClient, showKey: string, day: string): Promise<boolean> {
  if ((await raiseShowLeaveOn(tx, showKey, day)) > 0) return true
  const show = await readShow(tx, showKey)
  if (show === null || show.state === "held") return true
  if (show.state === "deleting") return false
  if (lateEnough(show, day)) return true
  if ((await raiseShowLeaveOn(tx, showKey, day)) > 0) return true
  return lateEnough(await readShow(tx, showKey), day)
}

/** What happened to one key: moved to `day`, skipped (being deleted), not in Leaving soon, or changed twice by another writer. */
export type KeyPostpone = { kind: "postponed"; day: string } | { kind: "skipped" } | { kind: "none" } | { kind: "conflict" }

export interface PostponeKeyOptions {
  days: number
  today: string
  userId: string
  now: Date
  /** The batch form: only a key that is still due moves, so a key that another postpone moved keeps its later date. */
  dueOnly?: boolean
}

type Attempt = KeyPostpone | { kind: "retry" }

async function attempt(tx: PrismaTransactionClient, itemKey: string, options: PostponeKeyOptions): Promise<Attempt> {
  const { days, today, userId, now } = options
  const row = await tx.cleanupItem.findUnique({ where: { itemKey } })
  if (!row || row.state === "held") return { kind: "none" }
  if (row.state === "deleting") return { kind: "skipped" }
  const from = row.leaveOn !== null && row.leaveOn > today ? row.leaveOn : today
  if (options.dueOnly && from !== today) return { kind: "none" }
  const day = addDays(from, days)
  const where = { id: row.id, updatedAt: row.updatedAt, state: { in: MOVABLE_STATES } }
  const { count } = await tx.cleanupItem.updateMany({ where, data: postponeData(day, userId, now) })
  if (count === 0) return { kind: "retry" }
  if (row.level === "season" && !(await raiseShowOfSeason(tx, showKeyOf(row.titleKey), day))) throw new RollbackKey()
  return { kind: "postponed", day }
}

/**
 * Postpones one key in one transaction. A row that changed between its read
 * and its write is read again once; a second change gives `conflict`. A
 * conflict error of PostgreSQL is thrown to the caller.
 */
export async function postponeKey(itemKey: string, options: PostponeKeyOptions): Promise<KeyPostpone> {
  for (let round = 0; round < 2; round++) {
    try {
      const result = await prisma.$transaction((tx) => attempt(tx, itemKey, options), TRANSACTION_OPTIONS)
      if (result.kind !== "retry") return result
    } catch (error) {
      if (error instanceof RollbackKey) return { kind: "skipped" }
      throw error
    }
  }
  return { kind: "conflict" }
}
