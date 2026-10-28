import { getMarkTypeLabel } from "../mark-labels"
import { MarkType } from "@/lib/generated/prisma/client"

describe("getMarkTypeLabel", () => {
  it.each([
    [MarkType.FINISHED_WATCHING, "Finished watching"],
    [MarkType.NOT_INTERESTED, "Not interested"],
    [MarkType.KEEP_FOREVER, "Keep forever"],
    [MarkType.REWATCH_CANDIDATE, "Rewatch candidate"],
    [MarkType.POOR_QUALITY, "Poor quality"],
    [MarkType.WRONG_VERSION, "Wrong version"],
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
