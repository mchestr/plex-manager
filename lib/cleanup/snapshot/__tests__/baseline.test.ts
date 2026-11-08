/** @jest-environment node */
/**
 * `rowBaseline(prev, read)` (TS 8.2, safety-r2-2): no `prev`, a failed read
 * between two good reads, two nightly reads with the same smaller count, and
 * an admin read that agrees.
 */

import { buildSourceStatuses } from "@/lib/cleanup/__tests__/helpers/builders"
import type { RowCounter, SourceStatus } from "@/lib/cleanup/schema/snapshot"
import {
  agrees, type BaselineRead, type BaselineSnapshot, counterValue, isShrink, type RowBaseline, rowBaseline, shrank,
} from "@/lib/cleanup/snapshot/baseline"

interface Counts {
  requests?: number
  plays?: number
  users?: number
  overseerr?: SourceStatus["state"]
  tautulli?: SourceStatus["state"]
}

function sources(counts: Counts): SourceStatus[] {
  return buildSourceStatuses({
    overseerr: { state: counts.overseerr ?? "ok", rows: counts.requests },
    tautulli: { state: counts.tautulli ?? "ok", rows: counts.plays },
  })
}

const read = (counts: Counts, trigger: BaselineRead["trigger"] = "scheduled"): BaselineRead => ({
  trigger, sources: sources(counts), facts: { history: { usersWithPlay: counts.users ?? 0 } },
})

const snapshot = (counts: Counts, baseline: RowBaseline): BaselineSnapshot => ({ ...read(counts), facts: { ...read(counts).facts, rowBaseline: baseline } })

/** Store a read as the snapshot the next read compares with. */
const stored = (r: BaselineRead, prev: BaselineSnapshot | null): BaselineSnapshot => ({ ...r, facts: { ...r.facts, rowBaseline: rowBaseline(prev, r) } })

describe("rowBaseline", () => {
  it("has no baseline without an earlier snapshot", () => {
    expect(rowBaseline(null, read({ requests: 300, plays: 5000, users: 12 }))).toEqual({})
  })

  it("takes the counts of a good earlier snapshot", () => {
    const prev = snapshot({ requests: 300, plays: 5000, users: 12 }, { overseerrRequests: 290, tautulliRows: 4990, usersWithPlay: 12 })
    expect(rowBaseline(prev, read({ requests: 310, plays: 5100, users: 13 }))).toEqual({ overseerrRequests: 300, tautulliRows: 5000, usersWithPlay: 12 })
  })

  it("keeps the old baseline over a failed read between two good reads", () => {
    const first = stored(read({ requests: 300, plays: 5000, users: 12 }), snapshot({ requests: 300, plays: 5000, users: 12 }, {}))
    const failed = stored(read({ requests: 0, overseerr: "failed", plays: 0, tautulli: "failed", users: 0 }), first)
    expect(failed.facts.rowBaseline).toEqual({ overseerrRequests: 300, tautulliRows: 5000, usersWithPlay: 12 })
    const third = rowBaseline(failed, read({ requests: 295, plays: 4990, users: 12 }))
    expect(third).toEqual({ overseerrRequests: 300, tautulliRows: 5000, usersWithPlay: 12 })
  })

  it("keeps the stop over two nightly reads with the same smaller count", () => {
    const good = snapshot({ requests: 300 }, { overseerrRequests: 300 })
    const fell = stored(read({ requests: 0 }), good)
    expect(fell.facts.rowBaseline?.overseerrRequests).toBe(300)
    expect(shrank(fell, "overseerrRequests")).toBe(true)
    const again = stored(read({ requests: 0 }), fell)
    expect(again.facts.rowBaseline?.overseerrRequests).toBe(300)
    expect(shrank(again, "overseerrRequests")).toBe(true)
  })

  it("clears the stop after an admin read that agrees", () => {
    const fell = snapshot({ requests: 200, plays: 5000 }, { overseerrRequests: 300, tautulliRows: 5000 })
    const admin = stored(read({ requests: 210, plays: 5000 }, "admin"), fell)
    expect(admin.facts.rowBaseline).toMatchObject({ overseerrRequests: 200, tautulliRows: 5000 })
    expect(shrank(admin, "overseerrRequests")).toBe(false)
  })

  it("keeps the stop after an admin read that does not agree, or a system read that does", () => {
    const fell = snapshot({ requests: 200 }, { overseerrRequests: 300 })
    expect(rowBaseline(fell, read({ requests: 260 }, "admin")).overseerrRequests).toBe(300)
    expect(rowBaseline(fell, read({ requests: 200 }, "system")).overseerrRequests).toBe(300)
    expect(rowBaseline(fell, read({ requests: 200, overseerr: "failed" }, "admin")).overseerrRequests).toBe(300)
  })

  it("clears a fall to 0 when an admin read also gives 0", () => {
    const fell = snapshot({ users: 0 }, { usersWithPlay: 41 })
    expect(rowBaseline(fell, read({ users: 0 }, "admin")).usersWithPlay).toBe(0)
  })

  it("carries nothing when the earlier snapshot had neither a count nor a baseline", () => {
    const prev = snapshot({ overseerr: "notConfigured", tautulli: "failed" }, {})
    expect(rowBaseline(prev, read({ requests: 5 }))).toEqual({})
  })
})

describe("the shrink test", () => {
  it.each([
    [270, 300, false],
    [269, 300, true],
    [0, 300, true],
    [0, 0, false],
    [5, undefined, false],
  ])("says %s against a baseline of %s is %s", (count, baseline, expected) => {
    expect(isShrink(count, baseline)).toBe(expected)
  })

  it.each([
    [220, 200, true],
    [180, 200, true],
    [221, 200, false],
    [179, 200, false],
    [0, 0, true],
  ])("says %s agrees with %s: %s", (count, previous, expected) => {
    expect(agrees(count, previous)).toBe(expected)
  })

  it.each<[RowCounter, number | null]>([
    ["overseerrRequests", 300],
    ["tautulliRows", 5000],
    ["usersWithPlay", 12],
  ])("reads %s from the snapshot", (counter, expected) => {
    expect(counterValue(snapshot({ requests: 300, plays: 5000, users: 12 }, {}), counter)).toBe(expected)
  })

  it("reads no count from a failed service or a status without rows", () => {
    expect(counterValue(snapshot({ tautulli: "failed", plays: 5000 }, {}), "tautulliRows")).toBeNull()
    expect(counterValue(snapshot({}, {}), "overseerrRequests")).toBeNull()
    expect(shrank(snapshot({ tautulli: "failed", users: 0 }, { usersWithPlay: 41 }), "usersWithPlay")).toBe(false)
  })
})
