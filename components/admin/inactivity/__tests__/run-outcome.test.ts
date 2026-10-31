/** What a run came to, in the words the last run line and the runs table share. */

import { memberCount, runOutcome } from "@/components/admin/inactivity/run-outcome"

const FINISHED = new Date("2026-10-31T02:18:00Z")

describe("runOutcome", () => {
  it("says a run without a finish time has not finished, whatever it stored", () => {
    expect(runOutcome({ finishedAt: null, blocked: "disabled", qualified: 3, removed: 1 })).toBe("Not finished")
  })

  it("names why the run removed no one or stopped", () => {
    expect(runOutcome({ finishedAt: FINISHED, blocked: "over_limit", qualified: 30, removed: 0 })).toBe(
      "More members qualified than the safety limit allows"
    )
    expect(runOutcome({ finishedAt: FINISHED, blocked: "from_a_newer_build", qualified: 0, removed: 0 })).toBe("from_a_newer_build")
  })

  it("says how many of the inactive members it removed", () => {
    expect(runOutcome({ finishedAt: FINISHED, blocked: null, qualified: 0, removed: 0 })).toBe("No inactive members")
    expect(runOutcome({ finishedAt: FINISHED, blocked: null, qualified: 3, removed: 2 })).toBe("Removed 2 of 3 members")
    expect(runOutcome({ finishedAt: FINISHED, blocked: null, qualified: 1, removed: 1 })).toBe("Removed 1 of 1 member")
  })
})

describe("memberCount", () => {
  it("uses the singular for one", () => {
    expect([0, 1, 2].map(memberCount)).toEqual(["0 members", "1 member", "2 members"])
  })
})
