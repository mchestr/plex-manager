/** `affiliateStanding`: each state of the Invites page's standing card, from stored values. */

import { affiliateStanding, type StandingFacts } from "@/lib/affiliates/standing"

const NOW = new Date("2026-10-29T12:00:00Z")
const DAY = 24 * 60 * 60 * 1000

const facts = (overrides: Partial<StandingFacts> = {}): StandingFacts => ({
  open: null,
  lastRefusal: null,
  paid: false,
  hours: 120,
  barHours: 50,
  ...overrides,
})

describe("affiliateStanding", () => {
  it("is pending with an open PENDING application", () => {
    const appliedAt = new Date("2026-10-20T12:00:00Z")
    expect(affiliateStanding(facts({ open: { status: "PENDING", appliedAt } }), NOW)).toEqual({ state: "pending", appliedAt })
  })

  it("is approved, or paused while paid, with an open APPROVED application", () => {
    const open = { status: "APPROVED", appliedAt: NOW }
    expect(affiliateStanding(facts({ open }), NOW)).toEqual({ state: "approved" })
    expect(affiliateStanding(facts({ open, paid: true }), NOW)).toEqual({ state: "paused" })
  })

  it("is refused or revoked for 30 days, with the reason and the date they can apply again", () => {
    const at = new Date(NOW.getTime() - 10 * DAY)
    expect(affiliateStanding(facts({ lastRefusal: { status: "REFUSED", reason: "Too new", at } }), NOW)).toEqual({
      state: "refused",
      reason: "Too new",
      applyAgainAt: new Date(at.getTime() + 30 * DAY),
    })
    expect(affiliateStanding(facts({ lastRefusal: { status: "REVOKED", reason: null, at } }), NOW)).toMatchObject({ state: "revoked", reason: null })
  })

  it("forgets a refusal after 30 days", () => {
    const at = new Date(NOW.getTime() - 31 * DAY)
    expect(affiliateStanding(facts({ lastRefusal: { status: "REFUSED", reason: null, at } }), NOW)).toEqual({ state: "can_apply", hours: 120 })
  })

  it("is paid for a member with a paid subscription and no application", () => {
    expect(affiliateStanding(facts({ paid: true }), NOW)).toEqual({ state: "paid" })
  })

  it("can apply above the bar or before the first read, and is below it at or under the bar", () => {
    expect(affiliateStanding(facts({ hours: null }), NOW)).toEqual({ state: "can_apply", hours: null })
    expect(affiliateStanding(facts({ hours: 50.5 }), NOW)).toEqual({ state: "can_apply", hours: 50.5 })
    expect(affiliateStanding(facts({ hours: 50 }), NOW)).toEqual({ state: "below_bar", hours: 50, barHours: 50 })
    expect(affiliateStanding(facts({ hours: 23 }), NOW)).toEqual({ state: "below_bar", hours: 23, barHours: 50 })
  })
})
