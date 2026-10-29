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
  const joined = (iso: string) => ({ joinedAt: new Date(iso), expiresAt: null })
  const open = { joinedAt: null, expiresAt: new Date("2026-10-30T12:00:00Z") }

  it("is null when nothing is held", () => {
    expect(nextPlaceBack([], 3)).toBeNull()
  })

  it("gives a join's place back 30 days after the join", () => {
    expect(nextPlaceBack([joined("2026-10-10T08:00:00Z")], 1)).toEqual(new Date("2026-11-09T08:00:00Z"))
  })

  it("gives no date for open invites, which hold their place for 30 more days if someone joins", () => {
    expect(nextPlaceBack([open], 1)).toBeNull()
    expect(nextPlaceBack([open, joined("2026-10-10T08:00:00Z")], 2)).toEqual(new Date("2026-11-09T08:00:00Z"))
  })

  it("takes the join that brings the held count under a lowered limit", () => {
    const held = [joined("2026-10-01T00:00:00Z"), joined("2026-10-05T00:00:00Z"), joined("2026-10-09T00:00:00Z")]
    // 3 held under a limit of 1: all three must come back before one place is free
    expect(nextPlaceBack(held, 1)).toEqual(new Date("2026-11-08T00:00:00Z"))
    expect(nextPlaceBack(held, 3)).toEqual(new Date("2026-10-31T00:00:00Z"))
  })

  it("is null when the joins alone cannot free a place", () => {
    expect(nextPlaceBack([open, open, joined("2026-10-10T08:00:00Z")], 1)).toBeNull()
  })

  it("is null under a limit of 0, where no place ever comes back", () => {
    expect(nextPlaceBack([joined("2026-10-10T08:00:00Z")], 0)).toBeNull()
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
