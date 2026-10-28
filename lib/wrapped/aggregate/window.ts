/**
 * Which data a batch covers. A batch is keyed by `(year, through)`, where
 * `through` is the last day of data: 30 November during the season, 31
 * December once the year has ended (design 7.7). Every member is read over
 * that span in their own Rewind zone, so the server-wide pass reads the union
 * of every member's window. `finalCut` names the whole-year window, as the
 * stored `window.finalCut` does.
 *
 * @module lib/wrapped/aggregate/window
 */

import { dataWindow, yearWindow, type TimeWindow } from "@/lib/wrapped/time/zone"

/** The batch a Rewind reads: its year, whether it covers the whole year, and the server zone. */
export interface BatchWindow {
  year: number
  finalCut: boolean
  serverZone: string
}

/**
 * The batch's last day of data, `YYYY-MM-DD`.
 *
 * @example
 * ```ts
 * throughFor(2026, { finalCut: false }) // "2026-11-30"
 * throughFor(2026, { finalCut: true })  // "2026-12-31"
 * ```
 */
export function throughFor(year: number, { finalCut }: { finalCut: boolean }): string {
  return finalCut ? `${year}-12-31` : `${year}-11-30`
}

/** Whether `through` is the whole year's last day, 31 December. */
export function isFinalCut(year: number, through: string): boolean {
  return through === throughFor(year, { finalCut: true })
}

/**
 * The batch for `year` as of `now`: the whole year once the year has ended in
 * the server zone, the season before.
 */
export function batchWindowAt(year: number, serverZone: string, now: number): BatchWindow {
  return { year, finalCut: now >= yearWindow(year, serverZone).end, serverZone }
}

/** `RewindServerAggregate.dataThrough` for `through`: midnight UTC of that day. */
export function dataThroughDate(through: string): Date {
  return new Date(`${through}T00:00:00.000Z`)
}

/** One window in `zone` for the batch. */
export function zoneWindow(batch: BatchWindow, zone: string): TimeWindow {
  return dataWindow(batch.year, zone, { finalCut: batch.finalCut })
}

/** The span covering every window in `zones` and the server zone, labelled with the server zone. */
export function unionWindow(batch: BatchWindow, zones: Iterable<string>): TimeWindow {
  const windows = [batch.serverZone, ...zones].map((zone) => zoneWindow(batch, zone))
  return {
    start: Math.min(...windows.map((w) => w.start)),
    end: Math.max(...windows.map((w) => w.end)),
    zone: batch.serverZone,
  }
}
