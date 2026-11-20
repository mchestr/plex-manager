/**
 * The admin Problem reports rows: the statuses behind each filter, the
 * reporter count, and each timeline step in words with its evidence.
 */

import { filterCounts, otherReporters, timelineStep, FILTER_STATUSES } from "@/lib/admin/problem-reports/rows"

const AT = new Date("2026-11-08T20:00:00.000Z")
const ADMIN = { id: "admin-1", name: "Dana" }
const MEMBER = { id: "member-1", name: "Jane" }
const event = (kind: string, data: unknown, actor: { id: string; name: string } | null = MEMBER) => ({ id: "e1", kind, data, createdAt: AT, actor })

describe("the filters", () => {
  it("puts reports with the server admin under Needs you, and sent ones under Fixing", () => {
    expect(FILTER_STATUSES).toEqual({ "needs-you": ["WITH_ADMIN"], fixing: ["SENT", "FIXING"], fixed: ["FIXED"], closed: ["CLOSED"] })
  })

  it("counts each filter from the counts per status", () => {
    expect(filterCounts({ WITH_ADMIN: 3, SENT: 1, FIXING: 2, CLOSED: 4 })).toEqual({ "needs-you": 3, fixing: 3, fixed: 0, closed: 4 })
  })
})

describe("otherReporters", () => {
  it("counts each other member once, and never the reporter or a removed member", () => {
    expect(otherReporters("member-1", ["member-2", "member-2", "member-3", "member-1", null])).toBe(2)
  })
})

describe("timelineStep", () => {
  it("names the problem the member reported, with their player answer and the evidence", () => {
    const step = timelineStep(
      event("REPORTED", {
        problem: "no_sound",
        device: "nothing_plays",
        evidence: { lastPlay: { player: "Living Room", transcoded: true, at: "2026-11-07T21:00:00.000Z" }, playedToEnd: false },
      })
    )

    expect(step).toEqual({
      id: "e1",
      at: AT,
      words: "Reported: No sound, or the sound cuts out",
      actor: MEMBER,
      note: null,
      device: "Nothing plays on their player",
      evidence: { lastPlay: { player: "Living Room", transcoded: true, at: new Date("2026-11-07T21:00:00.000Z") }, playedToEnd: false },
    })
  })

  it("tells a second member's problem and note from a follow", () => {
    expect(timelineStep(event("ALSO_REPORTED", { problem: "stops", note: "Freezes at 40 minutes" }))).toMatchObject({
      words: "Also reported: Stops or freezes partway",
      note: "Freezes at 40 minutes",
    })
    expect(timelineStep(event("ALSO_REPORTED", {}))).toMatchObject({ words: "Following", note: null, evidence: null })
  })

  it("says who closed it and how", () => {
    expect(timelineStep(event("CLOSED", { reason: "cancelled" })).words).toBe("Cancelled")
    expect(timelineStep(event("CLOSED", { reason: "admin" }, ADMIN)).words).toBe("Closed")
    expect(timelineStep(event("FIXED", { reason: "admin" }, ADMIN)).words).toBe("Marked fixed")
  })

  it("reads data of the wrong shape as nothing, and keeps an unknown step's kind", () => {
    expect(timelineStep(event("REPORTED", { problem: 7, device: "maybe", evidence: { lastPlay: "yesterday" } }))).toMatchObject({
      words: "Reported",
      device: null,
      evidence: null,
    })
    expect(timelineStep(event("REPORTED", { problem: "a_retired_code" })).words).toBe("Reported: Something else")
    expect(timelineStep(event("REPORTED", null)).words).toBe("Reported")
    expect(timelineStep(event("SOMETHING_NEW", {}, null))).toMatchObject({ words: "SOMETHING_NEW", actor: null })
  })
})
