/**
 * @jest-environment node
 */

/**
 * The standing page's facts and viewer ranks (P2.8).
 */

import type { ServerAggregate } from "@/lib/wrapped/aggregate/schema"
import { computeCommunity } from "@/lib/wrapped/stats/community"
import type { AggregateView } from "@/lib/wrapped/stats/metadata"

import { play, statsContext, ZONES } from "./build-events"

const community: ServerAggregate["community"] = {
  hours: { value: 5000, contributors: 31 },
  topSeries: { grandparentRatingKey: "77", title: "Severance", minutes: 9000, contributors: 12 },
  busiestNight: { day: "2026-07-04", minutes: 2000, contributors: 2 },
  peakConcurrent: null,
  requestsFulfilled: { value: 40, contributors: 3 },
  titlesAdded: { total: 10, films: 6, series: 4 },
}

/** `count` members with descending minutes; the member is `me` at position `place` (1-based). */
function view(count: number, place: number, titles: ServerAggregate["titles"] = {}): AggregateView {
  const members = Array.from({ length: count }, (_, i) => ({
    userId: i + 1 === place ? "me" : i % 4 === 0 ? null : `user-${i}`,
    minutes: (count - i) * 100,
  }))
  return { userId: "me", aggregate: { members, titles, community } }
}

describe.each(ZONES)("computeCommunity in %s", (zone) => {
  const ctx = statsContext(zone)

  it("puts member 3 of 31 in the top 10%", () => {
    const result = computeCommunity([], ctx, view(31, 3))
    expect(result.eligible && result.standing).toEqual({ rank: 3, members: 31, percentile: 10 })
  })

  it("has no standing with 4 members", () => {
    const result = computeCommunity([], ctx, view(4, 1))
    expect(result.eligible && result.standing).toBeNull()
  })

  it("leaves members with no minutes out, and shares a tied rank", () => {
    const base = view(6, 2)
    const members = [...base.aggregate.members, { userId: "idle", minutes: 0 }]
    members[0].minutes = members[1].minutes
    const result = computeCommunity([], ctx, { ...base, aggregate: { ...base.aggregate, members } })
    expect(result.eligible && result.standing).toEqual({ rank: 1, members: 6, percentile: 17 })
  })

  it("ranks the member among a series' viewers, only with 3 or more", () => {
    const events = [
      play({ at: "2026-02-01T20:00", zone, series: "77", seconds: 300 * 60 }),
      play({ at: "2026-02-02T20:00", zone, series: "78", seconds: 60 * 60 }),
    ]
    const titles = {
      "series:77": { viewers: 4, minutes: [500, 300, 120, 30] },
      "series:78": { viewers: 2, minutes: [600, 60] },
    }
    const result = computeCommunity(events, ctx, view(10, 1, titles))
    expect(result.eligible && result.viewerRanks).toEqual({ "series:77": { rank: 2, viewers: 4 } })
  })

  it("passes community facts through only with 3 or more contributors", () => {
    const result = computeCommunity([], ctx, view(10, 1))
    expect(result.eligible && result.community).toEqual({ ...community, busiestNight: null })
  })

  it("is ineligible without the aggregate", () => {
    expect(computeCommunity([], ctx, null)).toEqual({ eligible: false })
  })
})
