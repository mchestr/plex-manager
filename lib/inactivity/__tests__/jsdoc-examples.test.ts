import { inactivitySkip } from "@/lib/inactivity/rules"

describe("JSDoc Documentation Examples", () => {
  it("inactivitySkip: a member no rule protects, and the server owner", () => {
    const member = { id: "u1", plexUserId: "42", isAdmin: false, role: null, isExempt: false, inactivityExcluded: false,
      subscriptionStatus: null, createdAt: new Date("2025-01-01"), lastSeenAt: null, lastSeenReadAt: new Date("2026-10-31") }
    expect(inactivitySkip(member, { ownerPlexUserId: "1", readSince: new Date("2026-10-31") })).toBeNull()
    expect(inactivitySkip({ ...member, plexUserId: " 1 " }, { ownerPlexUserId: "1", readSince: null })).toBe("owner")
  })
})
