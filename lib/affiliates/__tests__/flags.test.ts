/** The flags beside an applicant or an affiliate. */

import { affiliateFlags, type FlagFacts } from "@/lib/affiliates/flags"

const NOW = new Date("2026-10-29T12:00:00Z")
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)

const quiet: FlagFacts = {
  memberSince: daysAgo(400),
  invited: false,
  watchHours: 300,
  watchHoursLast30Days: 20,
  plexEmailShared: false,
  tierRaisedAt: null,
}

describe("affiliateFlags", () => {
  it("raises no flag for a long-time member with steady hours", () => {
    expect(affiliateFlags(quiet, NOW)).toEqual([])
  })

  it("raises every flag, in order", () => {
    const facts = { memberSince: daysAgo(10), invited: true, watchHours: 100, watchHoursLast30Days: 60, plexEmailShared: true, tierRaisedAt: daysAgo(5) }
    expect(affiliateFlags(facts, NOW)).toEqual(["new_member", "invited", "recent_hours", "shared_email", "tier_raised"])
  })

  it("keeps the edges: 60 days, half the hours, 30 days since the tier rose", () => {
    expect(affiliateFlags({ ...quiet, memberSince: daysAgo(60) }, NOW)).toEqual([])
    expect(affiliateFlags({ ...quiet, watchHours: 100, watchHoursLast30Days: 50 }, NOW)).toEqual([])
    expect(affiliateFlags({ ...quiet, tierRaisedAt: daysAgo(30) }, NOW)).toEqual([])
  })

  it("raises no hours flag before the hours were read", () => {
    expect(affiliateFlags({ ...quiet, watchHours: null, watchHoursLast30Days: null }, NOW)).toEqual([])
    expect(affiliateFlags({ ...quiet, watchHours: 0, watchHoursLast30Days: 0 }, NOW)).toEqual([])
  })
})
