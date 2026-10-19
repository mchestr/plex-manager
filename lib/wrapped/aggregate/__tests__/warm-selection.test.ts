/**
 * @jest-environment node
 */

/**
 * Tests for the metadata warm's title selection (P2.6, design 7.5).
 */

import { warmSelection } from "@/lib/wrapped/aggregate/warm-selection"

import { play } from "./build-plays"

const zone = "America/Chicago"
const hour = 3600

describe("warmSelection", () => {
  it("takes the titles covering 95% of a member's minutes and leaves the long tail", () => {
    const events = [
      ...Array.from({ length: 60 }, (_, i) => play({ at: `2026-03-${String((i % 28) + 1).padStart(2, "0")}T20:00`, zone, seconds: hour, series: "500" })),
      play({ at: "2026-04-01T20:00", zone, seconds: 30 * hour, film: "900" }),
      ...Array.from({ length: 50 }, (_, i) => play({ at: "2026-05-01T20:00", zone, seconds: hour, film: String(1000 + i) })),
    ]

    const { keys } = warmSelection(events)

    // 140 hours in all: 60 + 30 + 43 one-hour films reach 133 (95%); the last 7 films are the tail
    expect(keys).toHaveLength(45)
    expect(keys.slice(0, 2)).toEqual(["500", "900"])
    expect(keys).not.toContain("1049")
  })

  it("keys episodes by their series and names the biggest series", () => {
    const events = [
      play({ at: "2026-03-01T20:00", zone, seconds: 3 * hour, series: "500" }),
      play({ at: "2026-03-02T20:00", zone, seconds: 2 * hour, series: "501" }),
      play({ at: "2026-03-03T20:00", zone, seconds: 4 * hour, film: "900" }),
    ]

    const selection = warmSelection(events)

    expect(selection.keys).toEqual(["900", "500", "501"])
    expect(selection.topSeries).toEqual(["500", "501"])
  })

  it("selects nothing for a member without plays", () => {
    expect(warmSelection([])).toEqual({ keys: [], topSeries: [] })
  })
})
