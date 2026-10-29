/** The held-invite rules: which invites hold a place, free places, the next place back and the server cap. */

import { freePlaces, heldInvitesWhere, nextPlaceBack, serverCapReached } from "@/lib/affiliates/allowance"

const NOW = new Date("2026-10-29T12:00:00Z")
const DAY = 24 * 60 * 60 * 1000

describe("heldInvitesWhere", () => {
  it("holds joins of the last 30 days and open invites", () => {
    expect(heldInvitesWhere(NOW)).toEqual({
      kind: "AFFILIATE",
      OR: [
        { joinedAt: { gte: new Date(NOW.getTime() - 30 * DAY) } },
        { joinedAt: null, cancelledAt: null, expiresAt: { gt: NOW } },
      ],
    })
  })
})

describe("nextPlaceBack", () => {
  it("is null when nothing is held", () => {
    expect(nextPlaceBack([])).toBeNull()
  })

  it("gives a join's place back 30 days after the join, and an open invite's when it expires", () => {
    const joinedAt = new Date("2026-10-10T08:00:00Z")
    const expiresAt = new Date("2026-10-30T12:00:00Z")
    expect(nextPlaceBack([{ joinedAt, expiresAt: new Date("2026-10-11T08:00:00Z") }])).toEqual(new Date("2026-11-09T08:00:00Z"))
    expect(nextPlaceBack([{ joinedAt, expiresAt: null }, { joinedAt: null, expiresAt }])).toEqual(expiresAt)
  })

  it("skips an open invite without an expiry", () => {
    expect(nextPlaceBack([{ joinedAt: null, expiresAt: null }])).toBeNull()
  })
})

describe("freePlaces", () => {
  it("is the allowance less the held invites, never below 0", () => {
    expect(freePlaces(3, 1)).toBe(2)
    expect(freePlaces(1, 3)).toBe(0)
    expect(freePlaces(0, 0)).toBe(0)
  })
})

describe("serverCapReached", () => {
  it("never stops invites without a cap", () => {
    expect(serverCapReached(null, 1000)).toBe(false)
  })

  it("stops invites at the cap, and always at 0", () => {
    expect(serverCapReached(10, 9)).toBe(false)
    expect(serverCapReached(10, 10)).toBe(true)
    expect(serverCapReached(0, 0)).toBe(true)
  })
})
