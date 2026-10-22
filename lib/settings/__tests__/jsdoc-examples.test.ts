import { healthMessage, worstStatus } from "@/lib/settings/connection-status"

describe("JSDoc Documentation Examples", () => {
  it("worstStatus picks the worst category, and an empty list is not set up", () => {
    expect(worstStatus(["ok", "unreachable", "disabled"])).toBe("unreachable")
    expect(worstStatus([])).toBe("notConfigured")
  })

  it("healthMessage turns a code into copy", () => {
    expect(healthMessage({ status: "unreachable", code: "NOT_FOUND", checkedAt: null })).toBe("Nothing answered at this address.")
    expect(healthMessage({ status: "ok", code: null, checkedAt: null })).toBe("Connected with the saved settings.")
  })
})
