/**
 * The library tiles and the stat tiles of the Rules tab (UX 4.1.1, 4.1.2,
 * TS 12.7 items 3, 5 and 6), and the next leave date that the In Leaving
 * soon tile and each rule card read. Pure and client-safe. Bytes are
 * decimal strings.
 *
 * The movie and TV tiles count the libraries in scope (an arr root folder
 * and external ids, TS 5.5): "780 in Movies. Movies 4K and Keepsakes are
 * never in scope".
 *
 * @module lib/cleanup/screens/overview/library
 */

import { earliestDay } from "@/lib/cleanup/engine/budget"
import type { Batch } from "@/lib/cleanup/run/batches"
import type { SnapshotFacts } from "@/lib/cleanup/schema/snapshot"
import type { CleanupOverviewData } from "@/lib/cleanup/types/screens"
import type { CleanupItem } from "@/lib/generated/prisma/client"
import { type Level, LEVELS } from "@/lib/validations/cleanup-vocabulary"

type Stats = CleanupOverviewData["stats"]
/** The states of a title in Leaving soon (TS 8.6): a held title has no leave date yet. */
export const IN_LEAVING_SOON: readonly string[] = ["leaving", "approved", "deleting"]

const text = (value: number | bigint | null | undefined): string | null => (value === null || value === undefined ? null : String(value))

/** The movie and TV tiles, the free space and the growth (TS 12.7 item 3). Zero and null before the first read. */
export function libraryTiles(facts: SnapshotFacts | null): CleanupOverviewData["library"] {
  const all = facts?.libraries ?? []
  const inScope = all.filter((l) => l.arr !== null && !l.noIds)
  const sum = (type: "movie" | "show", key: "items" | "bytes" | "seasons") =>
    inScope.filter((l) => l.type === type).reduce((total, l) => total + l[key], 0)
  const titles = (type: "movie" | "show") => ({
    libraries: inScope.filter((l) => l.type === type).map((l) => l.title),
    outOfScope: all.filter((l) => l.type === type && !inScope.includes(l)).map((l) => l.title),
  })
  return {
    movies: { count: sum("movie", "items"), bytes: String(sum("movie", "bytes")), ...titles("movie") },
    shows: { count: sum("show", "items"), bytes: String(sum("show", "bytes")), seasons: sum("show", "seasons"), ...titles("show") },
    freeBytes: text(facts?.disk?.freeBytes),
    totalBytes: text(facts?.disk?.totalBytes),
    growthBytesPerMonth: text(facts?.growthBytesPerMonth),
  }
}

/** The one level of every item, or null for mixed levels or none. @internal */
export function levelOf(levels: Iterable<string>): Level | null {
  const distinct = new Set(levels)
  const [only] = distinct
  return distinct.size === 1 && (LEVELS as readonly string[]).includes(only) ? (only as Level) : null
}

/**
 * The next leave date of `rows` and its count: the earliest day that a
 * `leaving` row can go (`max(leaveOn, today, holdUntil)`), leaving out the
 * rows in `skip` (a deletion batch shows them as waiting). Null without one.
 */
export function nextLeave(rows: readonly CleanupItem[], today: string, holdUntil: string | null, skip: ReadonlySet<string> = new Set()):
  { day: string; count: number } | null {
  const days = rows.flatMap((row) => (row.state === "leaving" && row.leaveOn && !skip.has(row.itemKey) ? [earliestDay(row.leaveOn, today, holdUntil)] : []))
  if (days.length === 0) return null
  const day = days.reduce((first, d) => (d < first ? d : first))
  return { day, count: days.filter((d) => d === day).length }
}

const bytesOf = (rows: readonly Pick<CleanupItem, "sizeBytes">[]) => rows.reduce((sum, row) => sum + row.sizeBytes, 0n)

/** The three stat tiles: In Leaving soon, Waiting for you (every deletion batch item) and Freed in the last 30 days. */
export function statTiles(input: { rows: readonly CleanupItem[]; deletion: readonly Batch[]; freed: readonly { level: string; freedBytes: bigint }[];
  today: string; holdUntil: string | null }): Stats {
  const { deletion, today } = input
  const leavingRows = input.rows.filter((row) => IN_LEAVING_SOON.includes(row.state))
  const batched = new Set(deletion.flatMap((batch) => batch.items.map((item) => item.itemKey)))
  const waitingRows = deletion.flatMap((batch) => batch.items)
  const dueSince = deletion.flatMap((batch) => (batch.dueSince ? [batch.dueSince] : [])).sort()[0] ?? today
  return {
    leaving: { count: leavingRows.length, bytes: String(bytesOf(leavingRows)), nextLeaveAt: nextLeave(leavingRows, today, input.holdUntil, batched)?.day ?? null },
    waiting: waitingRows.length === 0 ? null : {
      count: waitingRows.length, bytes: String(bytesOf(waitingRows)), dueAt: dueSince, dueToday: dueSince === today,
      level: levelOf(waitingRows.map((row) => row.level)),
    },
    freed30d: {
      count: input.freed.length,
      bytes: String(input.freed.reduce((sum, outcome) => sum + outcome.freedBytes, 0n)),
      level: levelOf(input.freed.map((outcome) => outcome.level)),
    },
  }
}
