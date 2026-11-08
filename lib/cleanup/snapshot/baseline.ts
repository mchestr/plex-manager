/**
 * The row baseline of a library read (TS 7.7, 8.2, safety-r2-2): the counts
 * that the `sourceShrank` stop compares the next snapshot with. Pure and
 * client-safe.
 *
 * | Counter | Count | Service |
 * |---|---|---|
 * | `overseerrRequests` | the Overseerr source status `rows` | overseerr |
 * | `tautulliRows` | the Tautulli source status `rows` | tautulli |
 * | `usersWithPlay` | `facts.history.usersWithPlay` | tautulli |
 *
 * `shrank(s)`: the count of snapshot `s` is more than 10 % below its own
 * baseline, or 0 with a baseline above 0. No baseline: it never shrank.
 *
 * `rowBaseline(prev, read)`, per counter. `prev` is the newest earlier
 * complete snapshot:
 *
 * 1. No `prev`: no baseline.
 * 2. The counter's service failed in `prev`, or `shrank(prev)`: carry
 *    `prev`'s baseline forward. So a failed read never loses the baseline,
 *    and a nightly read alone never clears a stop.
 * 3. Exception: this read has `trigger: "admin"`, `shrank(prev)` holds, and
 *    this count is within 10 % of `prev`'s count. The admin pressed "Refresh
 *    data now" and the new read agrees, so the baseline becomes `prev`'s
 *    count and the stop clears.
 * 4. Else: the baseline is `prev`'s count.
 *
 * A read whose own service failed still gets a baseline, so the next read
 * can carry it.
 *
 * @module lib/cleanup/snapshot/baseline
 */

import { ROW_COUNTERS, type RowCounter, type SnapshotFacts, type SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { Service } from "@/lib/validations/cleanup-vocabulary"

export type RowBaseline = SnapshotFacts["rowBaseline"]

/** What the shrink check reads of a snapshot: its source results and its facts. */
export interface BaselineSnapshot {
  sources: readonly SourceStatus[]
  facts: { history: Pick<SnapshotFacts["history"], "usersWithPlay">; rowBaseline?: RowBaseline }
}

/** This read: who started it, its source results and its history facts. */
export interface BaselineRead {
  trigger: "scheduled" | "admin" | "system"
  sources: readonly SourceStatus[]
  facts: { history: Pick<SnapshotFacts["history"], "usersWithPlay"> }
}

const SERVICE_OF: Record<RowCounter, Service> = { overseerrRequests: "overseerr", tautulliRows: "tautulli", usersWithPlay: "tautulli" }

const statusOf = (sources: readonly SourceStatus[], service: Service) => sources.find((s) => s.service === service && s.part !== "shares")

/** The count of `counter` in a snapshot, or null when its service did not answer `ok` (or gave no count). */
export function counterValue(snapshot: Pick<BaselineSnapshot, "sources" | "facts">, counter: RowCounter): number | null {
  const status = statusOf(snapshot.sources, SERVICE_OF[counter])
  if (status?.state !== "ok") return null
  if (counter === "usersWithPlay") return snapshot.facts.history.usersWithPlay
  return status.rows ?? null
}

/**
 * Whether `count` is more than 10 % below `baseline`, or 0 with a baseline
 * above 0 (TS 8.2 step 6). Whole-number arithmetic. `sourceShrank()` of
 * `rule-blocks.ts` uses this test too, so one shrink test exists.
 */
export function isShrink(count: number, baseline: number | undefined): boolean {
  return baseline !== undefined && count * 10 < baseline * 9
}

/** Whether `count` is within 10 % of `previous`: an admin read that agrees. */
export function agrees(count: number, previous: number): boolean {
  return Math.abs(count - previous) * 10 <= previous
}

/** `shrank(s)` of TS 8.2: the snapshot's own count against its own baseline. A failed service never shrank. */
export function shrank(snapshot: BaselineSnapshot, counter: RowCounter): boolean {
  const count = counterValue(snapshot, counter)
  return count !== null && isShrink(count, snapshot.facts.rowBaseline?.[counter])
}

function baselineOf(prev: BaselineSnapshot, read: BaselineRead, counter: RowCounter): number | undefined {
  const prevCount = counterValue(prev, counter)
  const carried = prev.facts.rowBaseline?.[counter]
  if (prevCount === null) return carried
  if (!shrank(prev, counter)) return prevCount
  const count = counterValue(read, counter)
  return read.trigger === "admin" && count !== null && agrees(count, prevCount) ? prevCount : carried
}

/**
 * `facts.rowBaseline` of this read (TS 8.2).
 *
 * @param prev - The newest earlier complete snapshot, or null.
 * @param read - This read's trigger, source results and history facts.
 */
export function rowBaseline(prev: BaselineSnapshot | null, read: BaselineRead): RowBaseline {
  const out: RowBaseline = {}
  if (!prev) return out
  for (const counter of ROW_COUNTERS) {
    const value = baselineOf(prev, read, counter)
    if (value !== undefined) out[counter] = value
  }
  return out
}
