import { historyGroup } from "@/lib/admin/assistant-groups"

describe("JSDoc Documentation Examples", () => {
  it("historyGroup", () => {
    const now = Date.parse("2026-10-28T09:00:00Z")
    expect(historyGroup(Date.parse("2026-10-27T23:30:00Z"), now, "UTC")).toBe("Yesterday")
    expect(historyGroup(Date.parse("2026-10-27T23:30:00Z"), now, "Europe/Berlin")).toBe("Today")
  })
})
