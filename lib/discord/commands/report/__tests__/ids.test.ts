/**
 * The `/report` step ids: each step's `custom_id` carries what the next one
 * needs, and anything that isn't a step this build makes reads as null.
 */

import { parseReportId, reportIds } from "../ids"

describe("reportIds and parseReportId", () => {
  it("round-trips every step", () => {
    expect(parseReportId(reportIds.title())).toEqual({ step: "title" })
    expect(parseReportId(reportIds.kind("555"))).toEqual({ step: "kind", ratingKey: "555" })
    expect(parseReportId(reportIds.problem("555", "playback"))).toEqual({ step: "problem", ratingKey: "555", kind: "playback" })
    expect(parseReportId(reportIds.send("555", "no_sound"))).toEqual({ step: "send", ratingKey: "555", problem: "no_sound" })
    expect(parseReportId(reportIds.watching("123456789012345678", "7001"))).toEqual({ step: "watching", discordUserId: "123456789012345678", ratingKey: "7001" })
  })

  it("keeps every id within Discord's 100 characters", () => {
    expect(reportIds.watching("1".repeat(20), "9".repeat(12)).length).toBeLessThanOrEqual(100)
    expect(reportIds.send("9".repeat(12), "subtitles_out_of_sync").length).toBeLessThanOrEqual(100)
  })

  it.each([
    "report:kind:../1",
    "report:kind:1234567890123",
    "report:send:555:not_a_problem",
    "report:problem:555:nonsense",
    "report:watching:abc:555",
    "report:title:extra",
    "mark:select:555",
    "report:",
  ])("reads %s as null", (customId) => {
    expect(parseReportId(customId)).toBeNull()
  })
})
