/** Affiliate tiers: strict thresholds, 0 below the first tier, and the override in place of the tier. */

import { affiliateAllowance, affiliateTierIndex, affiliateTiersFromConfig, inviteOverrideSchema } from "@/lib/affiliates/tiers"

const DEFAULTS = affiliateTiersFromConfig(null)

describe("affiliateTiersFromConfig", () => {
  it("uses the defaults while none is stored: more than 50, 200 and 500 hours", () => {
    expect(DEFAULTS).toEqual([
      { overHours: 50, invites: 1 },
      { overHours: 200, invites: 2 },
      { overHours: 500, invites: 3 },
    ])
  })

  it("keeps a valid stored table", () => {
    const stored = [{ overHours: 10, invites: 1 }, { overHours: 20, invites: 10 }]
    expect(affiliateTiersFromConfig(stored)).toEqual(stored)
  })

  it.each([
    ["an empty table", []],
    ["a first tier at 0 hours", [{ overHours: 0, invites: 1 }]],
    ["hours that do not rise", [{ overHours: 50, invites: 1 }, { overHours: 50, invites: 2 }]],
    ["0 invites", [{ overHours: 50, invites: 0 }]],
    ["11 invites", [{ overHours: 50, invites: 11 }]],
    ["six tiers", [1, 2, 3, 4, 5, 6].map((overHours) => ({ overHours, invites: 1 }))],
  ])("falls back to the defaults for %s", (_name, stored) => {
    expect(affiliateTiersFromConfig(stored)).toEqual(DEFAULTS)
  })
})

describe("affiliateTierIndex", () => {
  it.each([
    [0, -1],
    [50, -1],
    [50.1, 0],
    [200, 0],
    [201, 1],
    [10_000, 2],
  ])("%s hours is tier %s", (hours, index) => {
    expect(affiliateTierIndex(hours, DEFAULTS)).toBe(index)
  })
})

describe("affiliateAllowance", () => {
  it("is 0 below the first tier", () => {
    expect(affiliateAllowance(10, null, DEFAULTS)).toEqual({ invites: 0, source: "tier" })
  })

  it("is the tier's invites above it", () => {
    expect(affiliateAllowance(250, null, DEFAULTS)).toEqual({ invites: 2, source: "tier" })
  })

  it("is the override when one is set, 0 included", () => {
    expect(affiliateAllowance(600, 0, DEFAULTS)).toEqual({ invites: 0, source: "override" })
    expect(affiliateAllowance(10, 7, DEFAULTS)).toEqual({ invites: 7, source: "override" })
  })
})

describe("inviteOverrideSchema", () => {
  it("takes 0 to 10 or null", () => {
    expect(inviteOverrideSchema.safeParse(0).success).toBe(true)
    expect(inviteOverrideSchema.safeParse(10).success).toBe(true)
    expect(inviteOverrideSchema.safeParse(null).success).toBe(true)
    expect(inviteOverrideSchema.safeParse(11).success).toBe(false)
    expect(inviteOverrideSchema.safeParse(1.5).success).toBe(false)
  })
})
