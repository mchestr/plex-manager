import {
  INACTIVITY_SKIPS,
  inactivitySkip,
  isInactive,
  lastActiveAt,
  scheduledRunLimit,
  SKIP_LABELS,
  type InactivityMember,
} from "@/lib/inactivity/rules"

const READ = new Date("2026-10-31T02:17:00.000Z")
const rules = { ownerPlexUserId: "1", readSince: READ }

/** A member no rule protects. */
function member(patch: Partial<InactivityMember> = {}): InactivityMember {
  return {
    id: "user-1",
    plexUserId: "42",
    isAdmin: false,
    role: null,
    isExempt: false,
    inactivityExcluded: false,
    subscriptionStatus: null,
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    lastSeenAt: new Date("2025-06-01T00:00:00.000Z"),
    lastSeenReadAt: READ,
    ...patch,
  }
}

describe("inactivitySkip", () => {
  it("protects no one when no rule applies", () => {
    expect(inactivitySkip(member(), rules)).toBeNull()
  })

  it.each<[string, Partial<InactivityMember>, ReturnType<typeof inactivitySkip>]>([
    ["no Plex account", { plexUserId: null }, "no_plex"],
    ["a blank Plex account", { plexUserId: "  " }, "no_plex"],
    ["an admin", { isAdmin: true }, "admin"],
    ["the server owner", { plexUserId: "1" }, "owner"],
    ["the server owner with spaces", { plexUserId: " 1 " }, "owner"],
    ["a Support user", { role: "support" }, "role"],
    ["an exempt member", { isExempt: true }, "exempt"],
    ["an active subscriber", { subscriptionStatus: "ACTIVE" }, "paying"],
    ["a past due subscriber", { subscriptionStatus: "PAST_DUE" }, "paying"],
    ["an excluded member", { inactivityExcluded: true }, "excluded"],
    ["a member the read never found", { lastSeenReadAt: null }, "not_read"],
    ["a member an older read found", { lastSeenReadAt: new Date(READ.getTime() - 1) }, "not_read"],
  ])("skips %s", (_name, patch, skip) => {
    expect(inactivitySkip(member(patch), rules)).toBe(skip)
  })

  it.each(["CANCELED", "INCOMPLETE", "UNPAID"] as const)("does not protect a %s subscription", (status) => {
    expect(inactivitySkip(member({ subscriptionStatus: status }), rules)).toBeNull()
  })

  it("counts a member the latest read found at its start as read", () => {
    expect(inactivitySkip(member({ lastSeenReadAt: new Date(READ) }), rules)).toBeNull()
  })

  it("counts no one as read before any read finished", () => {
    expect(inactivitySkip(member(), { ownerPlexUserId: "1", readSince: null })).toBe("not_read")
  })

  it("matches the owner only when the server knows its owner", () => {
    expect(inactivitySkip(member({ plexUserId: "1" }), { ...rules, ownerPlexUserId: null })).toBeNull()
    expect(inactivitySkip(member({ plexUserId: "1" }), { ...rules, ownerPlexUserId: " 1 " })).toBe("owner")
  })

  it("applies the rules in priority order", () => {
    const everything: Partial<InactivityMember> = {
      isAdmin: true,
      plexUserId: "1",
      role: "support",
      isExempt: true,
      subscriptionStatus: "ACTIVE",
      inactivityExcluded: true,
      lastSeenReadAt: null,
    }
    const order: (keyof InactivityMember)[] = ["isAdmin", "plexUserId", "role", "isExempt", "subscriptionStatus", "inactivityExcluded", "lastSeenReadAt"]
    const seen = order.map((_, index) => {
      const patch = Object.fromEntries(order.slice(index).map((key) => [key, everything[key]]))
      return inactivitySkip(member(patch), rules)
    })
    expect(seen).toEqual(["admin", "owner", "role", "exempt", "paying", "excluded", "not_read"])
    expect(inactivitySkip(member({ ...everything, plexUserId: null }), rules)).toBe("no_plex")
  })

  it("has a label for every skip", () => {
    expect(Object.keys(SKIP_LABELS).sort()).toEqual([...INACTIVITY_SKIPS].sort())
    for (const skip of INACTIVITY_SKIPS) expect(SKIP_LABELS[skip]).toMatch(/^[A-Z][a-z]/)
  })
})

describe("lastActiveAt", () => {
  const joined = new Date("2026-01-01T00:00:00.000Z")

  it("is the newest play when it is after the join date", () => {
    const played = new Date("2026-03-01T00:00:00.000Z")
    expect(lastActiveAt({ createdAt: joined, lastSeenAt: played })).toEqual(played)
  })

  it("is the join date for a member who never played, or played before joining", () => {
    expect(lastActiveAt({ createdAt: joined, lastSeenAt: null })).toEqual(joined)
    expect(lastActiveAt({ createdAt: joined, lastSeenAt: new Date("2025-01-01T00:00:00.000Z") })).toEqual(joined)
  })
})

describe("isInactive", () => {
  const now = new Date("2026-10-31T00:00:00.000Z")
  const daysAgo = (days: number, ms = 0) => new Date(now.getTime() - days * 86_400_000 - ms)

  it("is inactive from exactly the threshold", () => {
    expect(isInactive({ createdAt: daysAgo(400), lastSeenAt: daysAgo(180) }, 180, now)).toBe(true)
    expect(isInactive({ createdAt: daysAgo(400), lastSeenAt: daysAgo(180, -1) }, 180, now)).toBe(false)
  })

  it("counts from the join date for a member who never played", () => {
    expect(isInactive({ createdAt: daysAgo(30), lastSeenAt: null }, 180, now)).toBe(false)
    expect(isInactive({ createdAt: daysAgo(181), lastSeenAt: null }, 180, now)).toBe(true)
  })

  it("is not inactive after a recent play, however long ago they joined", () => {
    expect(isInactive({ createdAt: daysAgo(2000), lastSeenAt: daysAgo(1) }, 30, now)).toBe(false)
  })
})

describe("scheduledRunLimit", () => {
  it.each([
    [0, 1],
    [19, 1],
    [20, 1],
    [40, 2],
    [100, 5],
    [199, 9],
    [300, 10],
    [1000, 10],
  ])("allows %i members with access to lose it %i at a time", (shared, limit) => {
    expect(scheduledRunLimit(shared)).toBe(limit)
  })
})
