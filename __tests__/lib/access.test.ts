/**
 * Tests for the pure entitlement predicate in lib/access.ts.
 * (getAccessGateStatus's DB path is covered by __tests__/lib/guards.test.ts.)
 */

// lib/access imports prisma at module load; stub it so the module is loadable
// without a DATABASE_URL (this suite only exercises the pure predicate).
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

import { isAccessAllowed } from "@/lib/access"
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

describe("isAccessAllowed", () => {
  const base = {
    stripeEnabled: true,
    disabled: false,
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
        disabled: false,
        isAdmin: false,
        isExempt: false,
        subscriptionStatus: "CANCELED",
      })
    ).toBe(true)
  })

  it("denies a disabled user, whatever else holds", () => {
    expect(isAccessAllowed({ ...base, disabled: true, stripeEnabled: false })).toBe(false)
    expect(isAccessAllowed({ ...base, disabled: true, isAdmin: true })).toBe(false)
    expect(isAccessAllowed({ ...base, disabled: true, subscriptionStatus: "ACTIVE" })).toBe(false)
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
