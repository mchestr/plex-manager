/**
 * Tests for lib/access.ts: the pure entitlement predicate, the access level
 * table (P4.5, FR-51) and the batch query filter.
 */

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

import { entitledUserWhere, getAccessLevel, isAccessAllowed } from "@/lib/access"
import type { SubscriptionStatus } from "@/lib/generated/prisma/client"
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { buildConfig } from '@/__tests__/helpers/factories'

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

type Member = {
  isAdmin?: boolean
  isExempt?: boolean
  disabled?: boolean
  status?: SubscriptionStatus | null
  completedRewind?: boolean
}

function given(stripeEnabled: boolean, member: Member | null) {
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ stripeEnabled }))
  prismaMock.user.findUnique.mockResolvedValue(
    member === null
      ? null
      : ({
          disabledAt: member.disabled ? new Date() : null,
          isAdmin: member.isAdmin ?? false,
          isExempt: member.isExempt ?? false,
          subscription: member.status ? { status: member.status } : null,
        } as never)
  )
  prismaMock.plexWrapped.findFirst.mockResolvedValue(member?.completedRewind ? ({ id: 'w1' } as never) : null)
}

describe("getAccessLevel", () => {
  it.each<[string, boolean, Member | null, string]>([
    // Stripe off: every existing, enabled user is full
    ['a member, Stripe off', false, { status: 'CANCELED' }, 'full'],
    ['a member with no subscription, Stripe off', false, {}, 'full'],
    ['an exempt member, Stripe off', false, { isExempt: true }, 'full'],
    ['a missing user, Stripe off', false, null, 'none'],
    // Stripe on
    ['an admin', true, { isAdmin: true }, 'full'],
    ['an exempt member', true, { isExempt: true }, 'full'],
    ['an ACTIVE member', true, { status: 'ACTIVE' }, 'full'],
    ['a PAST_DUE member', true, { status: 'PAST_DUE' }, 'full'],
    ['a CANCELED member with a completed Rewind', true, { status: 'CANCELED', completedRewind: true }, 'lapsed'],
    ['a CANCELED member without one', true, { status: 'CANCELED' }, 'none'],
    ['a member with no subscription and a completed Rewind', true, { completedRewind: true }, 'lapsed'],
    ['a member with no subscription and no Rewind', true, {}, 'none'],
    ['a missing user', true, null, 'none'],
  ])('%s is %s', async (_who, stripeEnabled, member, level) => {
    given(stripeEnabled, member)

    expect(await getAccessLevel('user-1')).toBe(level)
  })

  it.each([false, true])('a disabled user is none (Stripe on: %s), even an admin with a Rewind', async (stripeEnabled) => {
    given(stripeEnabled, { disabled: true, isAdmin: true, status: 'ACTIVE', completedRewind: true })

    expect(await getAccessLevel('user-1')).toBe('none')
  })

  it('treats a missing config row as Stripe off', async () => {
    given(false, { status: 'CANCELED' })
    prismaMock.config.findUnique.mockResolvedValue(null)

    expect(await getAccessLevel('user-1')).toBe('full')
  })

  it('counts only a completed Rewind', async () => {
    given(true, { status: 'CANCELED', completedRewind: true })

    await getAccessLevel('user-1')

    expect(prismaMock.plexWrapped.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', status: 'completed' },
      select: { id: true },
    })
  })

  it('reads no Rewind for a full member', async () => {
    given(true, { status: 'ACTIVE' })

    await getAccessLevel('user-1')

    expect(prismaMock.plexWrapped.findFirst).not.toHaveBeenCalled()
  })
})

describe("entitledUserWhere", () => {
  it('excludes only disabled users with Stripe off', () => {
    expect(entitledUserWhere(false)).toEqual({ disabledAt: null })
  })

  it('selects admins, exempt users and ACTIVE or PAST_DUE subscribers with Stripe on', () => {
    expect(entitledUserWhere(true)).toEqual({
      disabledAt: null,
      OR: [
        { isAdmin: true },
        { isExempt: true },
        { subscription: { status: { in: ['ACTIVE', 'PAST_DUE'] } } },
      ],
    })
  })
})
