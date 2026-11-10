/**
 * `selectedSummary()` (TS 12.6 `leaving/` item 7, E35, E36): the batch counts
 * minus the unticked rows that are still in the batch, with the least careful
 * action left. A key that left the batch (`inBatch: false`) changes nothing.
 */

import { selectedSummary, type UntickedRow } from "@/components/admin/cleanup/leaving/selected-summary"

const BATCH = {
  count: 4,
  bytes: "100",
  actionCounts: { "movie.delete": 2, "movie.unmonitorDeleteFiles": 2 },
  exclusionCount: 1,
}

const row = (itemKey: string, overrides: Partial<UntickedRow> = {}): UntickedRow => ({
  itemKey, action: "movie.delete", importListExclusion: false, sizeBytes: "10", inBatch: true, ...overrides,
})

describe("selectedSummary", () => {
  it("is the whole batch with nothing unticked: the least careful action of mixed actions", () => {
    expect(selectedSummary(BATCH, [])).toEqual({ count: 4, action: "movie.delete", exclusionCount: 1, bytes: "100" })
  })

  it("subtracts the unticked rows in the batch, and names the least careful action left", () => {
    const unticked = [row("movie:tmdb:1", { importListExclusion: true, sizeBytes: "30" }), row("movie:tmdb:2", { sizeBytes: "20" })]
    expect(selectedSummary(BATCH, unticked)).toEqual({ count: 2, action: "movie.unmonitorDeleteFiles", exclusionCount: 0, bytes: "50" })
  })

  it("ignores a key with inBatch false and a key listed twice", () => {
    const unticked = [row("movie:tmdb:9", { inBatch: false, sizeBytes: "40" }), row("movie:tmdb:1"), row("movie:tmdb:1")]
    expect(selectedSummary(BATCH, unticked)).toEqual({ count: 3, action: "movie.delete", exclusionCount: 1, bytes: "90" })
  })

  it("names no action at 0 selected, and never goes below zero", () => {
    const all = [row("a", { sizeBytes: "25" }), row("b", { sizeBytes: "25" }), row("c", { action: "movie.unmonitorDeleteFiles", sizeBytes: "25" }),
      row("d", { action: "movie.unmonitorDeleteFiles", importListExclusion: true, sizeBytes: "30" }), row("e", { action: "show.delete", sizeBytes: "x" })]
    expect(selectedSummary(BATCH, all)).toEqual({ count: 0, action: null, exclusionCount: 0, bytes: "0" })
  })

  it("reads a bytes value that is not a number as 0", () => {
    expect(selectedSummary({ ...BATCH, bytes: "unknown" }, [])).toMatchObject({ bytes: "0" })
  })
})
