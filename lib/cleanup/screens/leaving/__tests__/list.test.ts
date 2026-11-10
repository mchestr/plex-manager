/**
 * @jest-environment node
 */

/**
 * `buildList` (UX 4.7.2, TS 12.7 item 8): the sort by group, leave date and
 * size in any input order, each filter alone, and a title with no leave
 * date in the due group.
 */

import { buildCleanupItem } from "@/__tests__/helpers/cleanup-factories"
import { buildList, type ListContext } from "@/lib/cleanup/screens/leaving/list"
import { parseLeavingParams } from "@/lib/cleanup/screens/leaving/params"
import type { People } from "@/lib/cleanup/screens/leaving/people"
import type { CleanupItem } from "@/lib/generated/prisma/client"

const GIB = 1024n ** 3n
const people: People = { ref: () => null, words: () => null }
const ctx: ListContext = {
  status: { paused: false, now: Date.parse("2026-11-08T12:00:00.000Z"), today: "2026-11-08", holdUntil: null, plan: new Map() },
  hold: (code) => code, failure: (code) => code, people, rule: (id) => ({ id, name: id }), library: () => "Movies", machineId: null,
  inBatch: new Set(),
}

const item = (key: string, overrides: Partial<CleanupItem>) => buildCleanupItem({ itemKey: key, title: key, ...overrides })
const ROWS = [
  item("movie:tmdb:5", { leaveOn: "2026-12-01", sizeBytes: 5n * GIB }),
  item("movie:tmdb:4", { leaveOn: "2026-11-20", sizeBytes: 9n * GIB, ruleIds: ["r2"], sectionId: "2" }),
  item("movie:tmdb:3", { leaveOn: "2026-11-20", sizeBytes: 9n * GIB }),
  item("movie:tmdb:2", { leaveOn: null, sizeBytes: 1n * GIB }),
  item("movie:tmdb:1", { leaveOn: "2026-11-08", sizeBytes: 2n * GIB, holdCode: "plexMissing" }),
]
const keys = (params: Record<string, string>) => buildList(ROWS, parseLeavingParams(params), ctx).rows.map((row) => row.itemKey)

describe("buildList", () => {
  it("sorts the due group first, then by leave date, the largest first, then by key", () => {
    expect(keys({})).toEqual(["movie:tmdb:1", "movie:tmdb:2", "movie:tmdb:3", "movie:tmdb:4", "movie:tmdb:5"])
    expect(buildList([...ROWS].reverse(), parseLeavingParams({}), ctx).rows.map((row) => row.group))
      .toEqual(["due", "due", "2026-11-20", "2026-11-20", "2026-12-01"])
  })

  it("applies each filter alone", () => {
    expect(keys({ q: "TMDB:5" })).toEqual(["movie:tmdb:5"])
    expect(keys({ rule: "r2" })).toEqual(["movie:tmdb:4"])
    expect(keys({ status: "onHold" })).toEqual(["movie:tmdb:1"])
    expect(keys({ library: "2" })).toEqual(["movie:tmdb:4"])
  })

  it("lists no group of a page with no row, and no due group without a batch", () => {
    const list = buildList(ROWS, parseLeavingParams({ page: "2" }), ctx)

    expect([list.rows, list.groups, list.total]).toEqual([[], [], 5])
  })
})
