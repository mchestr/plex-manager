import { getMarkTypeLabel } from "../mark-labels"
import { MarkType } from "@/lib/generated/prisma/client"

describe("getMarkTypeLabel", () => {
  it.each([
    [MarkType.FINISHED_WATCHING, "Finished Watching"],
    [MarkType.NOT_INTERESTED, "Not Interested"],
    [MarkType.KEEP_FOREVER, "Keep Forever"],
    [MarkType.REWATCH_CANDIDATE, "Rewatch Candidate"],
    [MarkType.POOR_QUALITY, "Poor Quality"],
    [MarkType.WRONG_VERSION, "Wrong Version"],
  ])("labels %s as %s", (markType, expected) => {
    expect(getMarkTypeLabel(markType)).toBe(expected)
  })

  it("covers every MarkType enum value", () => {
    for (const markType of Object.values(MarkType)) {
      const label = getMarkTypeLabel(markType)
      // Every enum value maps to a friendly, non-enum-shaped label.
      expect(label).not.toContain("_")
    }
  })

  it("falls back to the raw value for an unknown mark type", () => {
    expect(getMarkTypeLabel("UNKNOWN" as MarkType)).toBe("UNKNOWN")
  })
})
