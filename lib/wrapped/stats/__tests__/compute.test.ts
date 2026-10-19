/**
 * `computeMemberStats` combines every module, and a missing source makes its
 * module ineligible instead of failing (NFR-3).
 */

import { computeMemberStats } from "../compute"
import { computeTotals } from "../totals"
import { lookupFor, meta } from "./build-lookups"
import { play, statsContext } from "./build-events"

const zone = "Europe/Berlin"
const ctx = statsContext(zone)
const events = Array.from({ length: 24 }, (_, i) =>
  play({ at: `2026-0${(i % 9) + 1}-1${i % 9}T21:30`, zone, series: "77", season: 1, episode: i + 1, seconds: 2400 })
)
const nothing = { lifetime: null, metadata: null, requests: null, aggregate: null, library: null, excludedContentRatings: [] }

describe("computeMemberStats", () => {
  it("runs every module over the member's plays", () => {
    const stats = computeMemberStats(events, ctx, nothing)

    expect(stats.plays).toBe(24)
    expect(stats.totals).toEqual(computeTotals(events, ctx))
    expect(stats.time.peak).toBe(21)
    expect(stats.titles.series[0]).toMatchObject({ key: "series:77", episodes: 24 })
    expect(stats.devices.eligible).toBe(true)
  })

  it("makes the modules without a source ineligible, never throwing", () => {
    const stats = computeMemberStats(events, ctx, nothing)

    expect(stats.taste.eligible).toBe(false)
    expect(stats.people.eligible).toBe(false)
    expect(stats.requests.eligible).toBe(false)
    expect(stats.community.eligible).toBe(false)
    expect(stats.nextYear.picks).toEqual([])
    expect(stats.freshShare).toBeNull()
    expect(stats.bookends.member).toEqual({ since: null, lifetimeHours: null })
  })

  it("reads the metadata lookup when there is one", () => {
    const lookup = lookupFor(events, { "77": meta({ genres: ["Drama"], actors: ["Adam Scott"] }) })
    const stats = computeMemberStats(events, ctx, { ...nothing, metadata: lookup })

    expect(stats.taste.eligible && stats.taste.genres[0].name).toBe("Drama")
    expect(stats.people.eligible && stats.people.actors[0].name).toBe("Adam Scott")
  })
})
