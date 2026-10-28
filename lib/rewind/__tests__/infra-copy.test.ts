import { rewindInfraMessage } from "@/lib/rewind/infra-copy"

describe("rewindInfraMessage (FR-50)", () => {
  it("matches the documented examples", () => {
    expect(rewindInfraMessage("REDIS_NOT_CONFIGURED", "admin")).toBe("Rewind needs Redis (REDIS_URL)")
    expect(rewindInfraMessage("REDIS_NOT_CONFIGURED", "member")).toBe("Rewind is not available on this server")
    expect(rewindInfraMessage("REDIS_UNAVAILABLE", "member")).toBe(
      "Rewind is temporarily unavailable. Try again in a few minutes."
    )
  })

  it("tells admins and members the same thing during an outage", () => {
    expect(rewindInfraMessage("REDIS_UNAVAILABLE", "admin")).toBe(rewindInfraMessage("REDIS_UNAVAILABLE", "member"))
  })
})
