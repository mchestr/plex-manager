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

  it("says what a fix did, and when a member asked the server admin after one", () => {
    expect(timelineStep(event("FIXED", { reason: "fix", action: "BETTER_COPY" })).words).toBe("Fixed: a better copy is on the server")
    expect(timelineStep(event("FIXED", { reason: "fix", action: "LOOK_FOR_MISSING" })).words).toBe("Fixed: the missing episodes are on the server")
    expect(timelineStep(event("FIXED", { reason: "fix" })).words).toBe("Fixed")
    expect(timelineStep(event("CLOSED", { reason: "no_better_copy" }, null)).words).toBe("Closed: no better copy right now")
    expect(timelineStep(event("REOPENED", null))).toMatchObject({ words: "Asked the server admin to take a look", actor: MEMBER })
    expect(timelineStep(event("TO_ADMIN", { reason: "NO_UPGRADE", action: "BETTER_COPY" }, null)).words).toBe("The quality profile doesn't want a better copy of this file")
  })

  it("says which copy a swap or a removal brought in, and whether the old release is on the blocklist", () => {
    const swapped = { reason: "fix", action: "SWAP", release: "Heat.1995.1080p.BluRay-GOOD" }
    expect(timelineStep(event("FIXED", { ...swapped, blocklisted: true })).words).toBe("Fixed: a different copy is on the server (Heat.1995.1080p.BluRay-GOOD). The old release is on the blocklist")
    expect(timelineStep(event("FIXED", { ...swapped, blocklisted: false })).words).toBe(
      "Fixed: a different copy is on the server (Heat.1995.1080p.BluRay-GOOD). The old release isn't on the blocklist, so it could be grabbed again"
    )
    expect(timelineStep(event("FIXED", { reason: "fix", action: "REMOVE_AND_SEARCH", release: null, blocklisted: null })).words).toBe("Fixed: a new copy is on the server")
    expect(timelineStep(event("TO_ADMIN", { reason: "ONLY_LOWER", action: "SWAP" }, null)).words).toBe("The only other copies are lower quality. Remove the file and search can grab one of them")
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
