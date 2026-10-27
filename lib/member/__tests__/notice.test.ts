/**
 * The member shell's one notice (P6.3, ui-design-system 6.1): the priority
 * order, nothing from Stripe while it is off, and home hiding the Rewind one.
 */

import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { buildConfig } from '@/__tests__/helpers/factories'
import { getMemberNotice } from '@/lib/member/notice'
import { noticeShownOn, pickNotice, type MemberNotice } from '@/lib/member/notice-rules'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

type Subscription = Awaited<ReturnType<typeof prismaMock.subscription.findUnique>>

function stripe(enabled: boolean, subscription: { status: string; plexInviteStatus: string | null; jellyfinAccessStatus?: string } | null) {
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ stripeEnabled: enabled }))
  prismaMock.subscription.findUnique.mockResolvedValue(subscription as Subscription)
}

beforeEach(() => {
  mockReset(prismaMock)
})

describe('pickNotice', () => {
  const pastDue: MemberNotice = { kind: 'past-due' }
  const invite: MemberNotice = { kind: 'pending-invite' }
  const rewind: MemberNotice = { kind: 'rewind-ready', year: 2026 }

  it.each([
    [[rewind, invite, pastDue], pastDue],
    [[rewind, invite], invite],
    [[null, rewind], rewind],
    [[null, null], null],
  ])('picks the highest of %j', (candidates, expected) => {
    expect(pickNotice(candidates)).toEqual(expected)
  })
})

describe('noticeShownOn', () => {
  it('hides the Rewind notice on home only', () => {
    const rewind: MemberNotice = { kind: 'rewind-ready', year: 2026 }
    expect(noticeShownOn(rewind, '/')).toBe(false)
    expect(noticeShownOn(rewind, '/discord/link')).toBe(true)
    expect(noticeShownOn({ kind: 'past-due' }, '/')).toBe(true)
  })
})

describe('getMemberNotice', () => {
  it('shows past due over the pending invite', async () => {
    stripe(true, { status: 'PAST_DUE', plexInviteStatus: 'pending' })

    await expect(getMemberNotice('u1')).resolves.toEqual({ kind: 'past-due' })
  })

  it('shows the pending invite', async () => {
    stripe(true, { status: 'ACTIVE', plexInviteStatus: 'pending' })

    await expect(getMemberNotice('u1')).resolves.toEqual({ kind: 'pending-invite' })
  })

  it('notes an enabled Jellyfin account on the pending invite of a member with both (P11.11)', async () => {
    stripe(true, { status: 'ACTIVE', plexInviteStatus: 'pending', jellyfinAccessStatus: 'enabled' })

    await expect(getMemberNotice('u1')).resolves.toEqual({ kind: 'pending-invite', jellyfinEnabled: true })
  })

  it('shows nothing from the subscription while Stripe is off', async () => {
    stripe(false, { status: 'PAST_DUE', plexInviteStatus: 'pending' })

    await expect(getMemberNotice('u1')).resolves.toBeNull()
    expect(prismaMock.subscription.findUnique).not.toHaveBeenCalled()
  })

  it('shows nothing without a notice to show', async () => {
    stripe(true, null)

    await expect(getMemberNotice('u1')).resolves.toBeNull()
  })
})
