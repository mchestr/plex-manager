/**
 * The show raise and the show floor read (TS 6.8, E21, architecture-r7-1,
 * safety-r8-2): a show item never leaves before a season of it in Leaving
 * soon. Every writer that moves a season's leave date later raises its show
 * with {@link raiseShowLeaveOn}, and every reader of the show floor calls
 * {@link readShowLeaveFloor}. Server-only: both run in the caller's
 * transaction.
 *
 * The raise is one conditional `updateMany` with the date test in the
 * `where`: Prisma cannot read a column in `data`, and plex-manager writes no
 * raw SQL. Under READ COMMITTED, PostgreSQL checks the `where` again after a
 * lock wait, so the raise needs no first read, never loses a concurrent
 * raise and never moves a show earlier. It writes only a show row in
 * `leaving` or `approved`: a row in `deleting` belongs to the act step
 * (safety-r4-3), and a `held` row has no leave date.
 *
 * Zero rows means one of four states: the show date is the same or later,
 * the show is `held`, the show row is gone, or it is `deleting`. Only the
 * postpone tells them apart (TS 10.3). The other writers ignore it.
 *
 * `insertItemRows()` creates the new rows of the entries step and of a
 * turn-on with the same rules: a new show row starts at its show floor, and
 * a new season row raises its show.
 *
 * @module lib/cleanup/run/show-raise
 */

import "server-only"

import { showLeaveFloor } from "@/lib/cleanup/engine/overlap"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"

/** The states of a show row that a raise writes. */
const RAISED_STATES = ["leaving", "approved"]
/** The states of the season rows that the show floor reads: the seasons in Leaving soon, and those being deleted. */
const FLOOR_STATES = ["leaving", "approved", "deleting"]
const SHOW_PREFIX = "show:"

/** The item key of the show of a season row: `show:` and the season's title key, which is its show's (TS 5.4). */
export function showKeyOf(seasonTitleKey: string): string {
  return `${SHOW_PREFIX}${seasonTitleKey}`
}

/**
 * Moves the show's `leaveOn` to `day` where it is earlier, in `leaving` or
 * `approved` only. One statement, no first read. Returns the count of rows
 * it wrote: 1, or 0 for the four states above.
 */
export async function raiseShowLeaveOn(tx: PrismaTransactionClient, showKey: string, day: string): Promise<number> {
  const { count } = await tx.cleanupItem.updateMany({
    where: { itemKey: showKey, state: { in: RAISED_STATES }, leaveOn: { lt: day } },
    data: { leaveOn: day },
  })
  return count
}

/**
 * The show floor of `showKey` (safety-r8-2): the latest `leaveOn` of the
 * show's season rows in `leaving`, `approved` or `deleting`, or null when no
 * such season has a date. A `held` season has no date, so it never counts.
 * The seasons are found by the show's title key (`level: "season"`, indexed).
 */
export async function readShowLeaveFloor(tx: PrismaTransactionClient, showKey: string): Promise<string | null> {
  if (!showKey.startsWith(SHOW_PREFIX)) return null
  const seasons = await tx.cleanupItem.findMany({
    where: { level: "season", titleKey: showKey.slice(SHOW_PREFIX.length), state: { in: FLOOR_STATES } },
    select: { leaveOn: true },
  })
  return showLeaveFloor(null, seasons.map((season) => season.leaveOn))
}

const LEVEL_ORDER: Record<string, number> = { season: 0, show: 1, movie: 2 }

/** New rows in the order that keeps E21 across chunks: seasons first, so a later show row reads their dates. */
export function seasonsFirst<T extends { level: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => (LEVEL_ORDER[a.level] ?? 3) - (LEVEL_ORDER[b.level] ?? 3))
}

/** One transaction of {@link insertItemRows}. */
async function insertChunk(tx: PrismaTransactionClient, rows: readonly Prisma.CleanupItemCreateManyInput[]): Promise<number> {
  const seasonDays = new Map<string, string>()
  for (const row of rows) {
    const showKey = showKeyOf(row.titleKey)
    if (row.level === "season" && row.leaveOn) seasonDays.set(showKey, showLeaveFloor(row.leaveOn, [seasonDays.get(showKey) ?? null]) ?? row.leaveOn)
  }
  const data: Prisma.CleanupItemCreateManyInput[] = []
  for (const row of rows) {
    if (row.level !== "show" || !row.leaveOn) {
      data.push(row)
      continue
    }
    const floor = showLeaveFloor(row.leaveOn, [await readShowLeaveFloor(tx, row.itemKey), seasonDays.get(row.itemKey) ?? null]) ?? row.leaveOn
    data.push(floor === row.leaveOn ? row : { ...row, leaveOn: floor, firstLeaveOn: floor })
  }
  const { count } = await tx.cleanupItem.createMany({ data, skipDuplicates: true })
  for (const [showKey, day] of seasonDays) await raiseShowLeaveOn(tx, showKey, day)
  return count
}

/** Rows per transaction (TS 8.1 item 4), with its time limit. */
export const ROWS_PER_TRANSACTION = 100
export const TRANSACTION_OPTIONS = { timeout: 15_000 }

/**
 * Creates new item rows with the show floor (TS 8.5, E21), in transactions
 * of 100 rows, seasons first, and skips a key that an action created
 * meanwhile. A new show row in Leaving soon starts at the latest date of its
 * seasons: the rows of the database and the new rows of the same
 * transaction. A new season row raises its show row. Returns the count of
 * rows created.
 */
export async function insertItemRows(rows: readonly Prisma.CleanupItemCreateManyInput[]): Promise<number> {
  let created = 0
  const ordered = seasonsFirst(rows)
  for (let i = 0; i < ordered.length; i += ROWS_PER_TRANSACTION) {
    created += await prisma.$transaction((tx) => insertChunk(tx, ordered.slice(i, i + ROWS_PER_TRANSACTION)), TRANSACTION_OPTIONS)
  }
  return created
}
