/**
 * @jest-environment node
 */

/**
 * The one window rule (design 7.7). Every instant is written in UTC, and
 * the rule reads only the member's zone, so the process zone (TZ=UTC in CI)
 * cannot move the answer.
 */

import { dayKey, latestLocalInstant, resolveDataWindow, seasonWindowAt, yearWindow } from "@/lib/wrapped/time/zone"

const LA = "America/Los_Angeles"
const SYDNEY = "Australia/Sydney"
const at = (iso: string) => Date.parse(iso)
const through = (r: ReturnType<typeof resolveDataWindow>) => dayKey(r.window.end - 1, r.window.zone)

describe("resolveDataWindow", () => {
  it("keeps the season window at 23:59 on 31 December in Los Angeles, and the full year at 00:00 on 1 January", () => {
    const before = resolveDataWindow({ year: 2026, zone: LA, now: at("2027-01-01T07:59:00Z") })
    expect(before.finalCut).toBe(false)
    expect(through(before)).toBe("2026-11-30")

    const after = resolveDataWindow({ year: 2026, zone: LA, now: at("2027-01-01T08:00:00Z") })
    expect(after).toEqual({ finalCut: true, window: yearWindow(2026, LA) })
    expect(through(after)).toBe("2026-12-31")
  })

  it("follows Sydney's own midnight, a day ahead of the Americas", () => {
    expect(resolveDataWindow({ year: 2026, zone: SYDNEY, now: at("2026-12-31T12:59:00Z") }).finalCut).toBe(false) // 23:59 in Sydney
    expect(resolveDataWindow({ year: 2026, zone: SYDNEY, now: at("2026-12-31T13:00:00Z") }).finalCut).toBe(true) // 00:00 on 1 January
    // The same instant is still 31 December in Los Angeles.
    expect(resolveDataWindow({ year: 2026, zone: LA, now: at("2026-12-31T13:00:00Z") }).finalCut).toBe(false)
  })

  it("reads the whole year for a Rewind generated on 3 January", () => {
    const january = resolveDataWindow({ year: 2026, zone: LA, now: at("2027-01-03T18:00:00Z") })
    expect(january.finalCut).toBe(true)
    expect(through(january)).toBe("2026-12-31")
  })

  it("ends the season window at the end of yesterday before 30 November", () => {
    const soft = resolveDataWindow({ year: 2026, zone: LA, now: at("2026-11-27T18:00:00Z") })
    expect(soft.finalCut).toBe(false)
    expect(through(soft)).toBe("2026-11-26")
    expect(soft.window).toEqual(seasonWindowAt(2026, LA, at("2026-11-27T18:00:00Z")))
  })
})

describe("latestLocalInstant", () => {
  it("is the westernmost zone's wall time", () => {
    expect(latestLocalInstant("2026-12-01", "00:15", ["America/Chicago", LA]).toISOString()).toBe("2026-12-01T08:15:00.000Z")
    expect(latestLocalInstant("2026-12-01", "00:15", [SYDNEY, "Europe/London"]).toISOString()).toBe("2026-12-01T00:15:00.000Z")
  })
})
