/**
 * Tests for the pure entitlement predicate in lib/access.ts.
 * (getAccessGateStatus's DB path is covered by __tests__/lib/guards.test.ts.)
 */

// lib/access imports prisma at module load; stub it so the module is loadable
// without a DATABASE_URL (this suite only exercises the pure predicate).
jest.mock("@/lib/prisma", () => ({
  prisma: { config: { findUnique: jest.fn() }, user: { findUnique: jest.fn() } },
}))

import { isAccessAllowed } from "@/lib/access"

describe("isAccessAllowed", () => {
  const base = {
    stripeEnabled: true,
    isAdmin: false,
    isExempt: false,
    subscriptionStatus: null,
  } as const

  it("allows everyone when Stripe gating is disabled", () => {
    expect(isAccessAllowed({ ...base, stripeEnabled: false })).toBe(true)
    // even with no subscription and not admin/exempt
    expect(
      isAccessAllowed({
        stripeEnabled: false,
        isAdmin: false,
        isExempt: false,
        subscriptionStatus: "CANCELED",
      })
    ).toBe(true)
  })

  it("allows admins and exempt users regardless of subscription", () => {
    expect(isAccessAllowed({ ...base, isAdmin: true })).toBe(true)
    expect(isAccessAllowed({ ...base, isExempt: true })).toBe(true)
  })

  it("allows ACTIVE and PAST_DUE subscriptions", () => {
    expect(isAccessAllowed({ ...base, subscriptionStatus: "ACTIVE" })).toBe(true)
    expect(isAccessAllowed({ ...base, subscriptionStatus: "PAST_DUE" })).toBe(true)
  })

  it("denies non-entitling subscription states", () => {
    expect(isAccessAllowed({ ...base, subscriptionStatus: "CANCELED" })).toBe(false)
    expect(isAccessAllowed({ ...base, subscriptionStatus: "UNPAID" })).toBe(false)
    expect(isAccessAllowed({ ...base, subscriptionStatus: "INCOMPLETE" })).toBe(false)
    expect(isAccessAllowed({ ...base, subscriptionStatus: null })).toBe(false)
    expect(isAccessAllowed({ ...base, subscriptionStatus: undefined })).toBe(false)
  })
})
