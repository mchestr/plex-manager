/**
 * The refusal copy the web and Discord share: a lapsed membership reads as
 * the action helper's own words, and a rate limit says when to try again.
 */

import { NOT_ENTITLED_MESSAGE } from "@/lib/actions/entitlement"
import { refusalCopy, REFUSALS } from "@/lib/problem-reports/refusals"

describe("refusalCopy", () => {
  it("says what the action helper says for a lapsed membership, so the two can't drift", () => {
    expect(refusalCopy("NOT_ENTITLED")).toBe(NOT_ENTITLED_MESSAGE)
    expect(REFUSALS.NOT_ENTITLED[0]).toBe("NOT_ENTITLED")
  })

  it("says when to try again after a rate limit", () => {
    expect(refusalCopy("RATE_LIMITED", 120)).toMatch(/^You've sent a lot of reports\. Try again .+\.$/)
    expect(refusalCopy("RATE_LIMITED")).toBe("You've sent a lot of reports.")
  })
})
