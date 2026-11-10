/**
 * What the swap limits (`./gate.ts`) count, read from the fix ledger alone.
 * Rows keep their member and title when reports are deleted, so deleting a
 * closed report never gives a swap back or resets a title's cooldown.
 *
 * - A member's swap is an automatic `SWAP` row of theirs whose grab
 *   (`replacedAt`) is in the last 7 days, still running or fixed: one that
 *   ended without a new copy stops counting.
 * - A title's limits count every automatic swap of it, and for the loop
 *   guard every swap from any trigger, by when they started; a dry run
 *   (outcome `DRY_RUN`) never counts. A run's own row is left out when it
 *   checks again before its grab.
 * - The server's day counts members' swaps whose grab is in the last day.
 *
 * Read inside the gates' serializable transactions, one query at a time.
 *
 * @module lib/problem-reports/swap-ledger
 */

import "server-only"

import type { PrismaTransactionClient } from "@/lib/prisma"
import { TITLE_LOOP, WEEK_MS, type SwapLedger } from "@/lib/problem-reports/gate"

const DAY_MS = 24 * 60 * 60 * 1000

/** Members' own swaps: what the allowance, the cooldown and the server's day count. */
const MEMBERS_SWAPS = { action: "SWAP", trigger: "automatic" }
const NOT_DRY_RUN = { OR: [{ outcome: null }, { outcome: { not: "DRY_RUN" } }] }
const STILL_COUNTS = { OR: [{ outcome: null }, { outcome: "FIXED" }] }

export async function readSwapLedger(
  db: PrismaTransactionClient,
  input: { reporterId: string; titleKey: string; cooldownDays: number; excludeId?: string },
  now: Date
): Promise<SwapLedger> {
  const since = (ms: number) => new Date(now.getTime() - ms)
  const own = input.excludeId ? { id: { not: input.excludeId } } : {}
  const memberSwaps = await db.problemFixLedger.findMany({
    where: { ...MEMBERS_SWAPS, reporterId: input.reporterId, replacedAt: { gte: since(WEEK_MS) }, ...STILL_COUNTS },
    select: { replacedAt: true },
  })
  const titleRecent = await db.problemFixLedger.count({
    where: { ...MEMBERS_SWAPS, titleKey: input.titleKey, startedAt: { gte: since(input.cooldownDays * DAY_MS) }, ...NOT_DRY_RUN, ...own },
  })
  const titleTwoMonths = await db.problemFixLedger.count({
    where: { action: "SWAP", titleKey: input.titleKey, startedAt: { gte: since(TITLE_LOOP.windowMs) }, ...NOT_DRY_RUN, ...own },
  })
  const serverToday = await db.problemFixLedger.count({ where: { ...MEMBERS_SWAPS, replacedAt: { gte: since(DAY_MS) } } })
  return { memberSwaps: memberSwaps.flatMap((row) => (row.replacedAt ? [row.replacedAt] : [])), titleRecent, titleTwoMonths, serverToday }
}
