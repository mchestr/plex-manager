import { worstStatus } from "@/lib/settings/connection-status"

describe("JSDoc Documentation Examples", () => {
  it("worstStatus picks the worst category, and an empty list is not set up", () => {
    expect(worstStatus(["ok", "unreachable", "disabled"])).toBe("unreachable")
    expect(worstStatus([])).toBe("notConfigured")
  })
})
