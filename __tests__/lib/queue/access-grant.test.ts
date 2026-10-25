/**
 * @jest-environment node
 */

/**
 * Tests for the access grant job processor (`processAccessGrant` in
 * lib/queue/jobs/stripe.ts; job name PLEX_ACCESS_GRANT, kept for queued jobs).
 *
 * The processor is invoked directly with a fixture `Job`; BullMQ/Redis are not
 * touched. The Plex invite/accept helpers, the Jellyfin account call and
 * Prisma are mocked. Each Plex path (token present: accepted; token
 * missing or accept failure: pending; invite failure or no active server:
 * throw) is asserted, and so is the live re-check (SEC-38): a canceled member
 * is skipped, existing access is recorded as accepted, and an exempt comp
 * grant proceeds. P11.11 adds Jellyfin-only and dual members, and members
 * with no usable identity, who are skipped with a code (GAP-23).
 */

import type { Job } from 'bullmq'

import { processAccessGrant } from '@/lib/queue/jobs/stripe'
import { prisma } from '@/lib/prisma'
import {
  inviteUserToPlexServer,
  acceptPlexInvite,
} from '@/lib/connections/plex-invitations'
import { checkUserServerAccess } from '@/lib/connections/plex-user-access'
import { setJellyfinAccountDisabled } from '@/lib/connections/jellyfin-users'
import { getAccessLevel } from '@/lib/access'
import { getStripe } from '@/lib/stripe/client'
import { SubscriptionStatus } from '@/lib/generated/prisma/client'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { createFakeStripe, stripeSubscription } from '@/__tests__/helpers/stripe-fakes'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock('@/lib/connections/plex-invitations', () => ({
  inviteUserToPlexServer: jest.fn(),
  acceptPlexInvite: jest.fn(),
}))

// The Stripe processor module imports the queue client (BullMQ) and Stripe SDK;
// stub them so this unit test doesn't pull in the real BullMQ -> msgpackr (ESM)
// import chain, which Jest can't parse.
jest.mock('@/lib/queue/client', () => ({
  addJob: jest.fn(),
}))

jest.mock('@/lib/stripe/client', () => ({
  getStripe: jest.fn(),
}))

jest.mock('@/lib/connections/plex-user-access', () => ({
  checkUserServerAccess: jest.fn(),
}))

jest.mock('@/lib/connections/jellyfin-users', () => ({
  ...jest.requireActual('@/lib/connections/jellyfin-users'),
  setJellyfinAccountDisabled: jest.fn(),
}))

jest.mock('@/lib/access', () => ({
  getAccessLevel: jest.fn(),
}))

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}))

const JELLYFIN_SERVER = { url: 'https://jellyfin.example.com', apiKey: 'jf-key' }

const PLEX_SERVER = {
  id: 'ps_1',
  url: 'https://plex.example.com:32400',
  token: 'server-token',
  adminPlexUserId: 'plex-owner',
  machineIdentifier: 'this-server-machine-id',
}

/** A paying member with an ACTIVE subscription, overridable per test. */
function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'user@example.com',
    plexAuthToken: 'user-token',
    plexUserId: 'plex-7',
    jellyfinUserId: null,
    isExempt: false,
    subscription: { status: SubscriptionStatus.ACTIVE, stripeSubscriptionId: 'sub_1' },
    ...overrides,
  }
}

/** Build a minimal fixture Job for the processor. */
function makeJob(userId: string): Job {
  return {
    id: 'job-grant-1',
    data: { userId },
    attemptsMade: 0,
  } as unknown as Job
}

describe('processAccessGrant', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(PLEX_SERVER)
    ;(prisma.subscription.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue(null)
    ;(getAccessLevel as jest.Mock).mockResolvedValue('full')
    ;(getStripe as jest.Mock).mockResolvedValue(null)
    ;(checkUserServerAccess as jest.Mock).mockResolvedValue({ status: 'denied' })
  })

  it('invites and auto-accepts when the user has a Plex token', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({
      id: 'user-1',
      email: 'user@example.com',
      plexAuthToken: 'user-token',
      })
    )
    ;(inviteUserToPlexServer as jest.Mock).mockResolvedValue({
      success: true,
      inviteID: 42,
    })
    ;(acceptPlexInvite as jest.Mock).mockResolvedValue({ success: true })

    const result = await processAccessGrant(makeJob('user-1'))

    // No configured subscriber libraries → all libraries are shared.
    expect(inviteUserToPlexServer).toHaveBeenCalledWith(
      { url: PLEX_SERVER.url, token: PLEX_SERVER.token, machineIdentifier: 'this-server-machine-id' },
      'user@example.com',
      undefined
    )
    expect(acceptPlexInvite).toHaveBeenCalledWith('user-token', 42)
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { accessSkipCode: null, plexInviteStatus: 'accepted' },
    })
    expect(result).toEqual({ userId: 'user-1', granted: true })
  })

  it('restricts the invite to the configured subscriber libraries', async () => {
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({
      stripeLibrarySectionIds: [1, 2],
    })
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({
      id: 'user-1',
      email: 'user@example.com',
      plexAuthToken: 'user-token',
      })
    )
    ;(inviteUserToPlexServer as jest.Mock).mockResolvedValue({
      success: true,
      inviteID: 42,
    })
    ;(acceptPlexInvite as jest.Mock).mockResolvedValue({ success: true })

    await processAccessGrant(makeJob('user-1'))

    expect(inviteUserToPlexServer).toHaveBeenCalledWith(
      { url: PLEX_SERVER.url, token: PLEX_SERVER.token, machineIdentifier: 'this-server-machine-id' },
      'user@example.com',
      { librarySectionIds: [1, 2] }
    )
  })

  it('shares all libraries when the stored selection is malformed', async () => {
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({
      stripeLibrarySectionIds: ['not-a-number'],
    })
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({
      id: 'user-1',
      email: 'user@example.com',
      plexAuthToken: 'user-token',
      })
    )
    ;(inviteUserToPlexServer as jest.Mock).mockResolvedValue({
      success: true,
      inviteID: 42,
    })
    ;(acceptPlexInvite as jest.Mock).mockResolvedValue({ success: true })

    await processAccessGrant(makeJob('user-1'))

    expect(inviteUserToPlexServer).toHaveBeenCalledWith(
      { url: PLEX_SERVER.url, token: PLEX_SERVER.token, machineIdentifier: 'this-server-machine-id' },
      'user@example.com',
      undefined
    )
  })

  it('leaves the invite pending (no throw) when auto-accept fails', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({
      id: 'user-2',
      email: 'user2@example.com',
      plexAuthToken: 'user-token',
      })
    )
    ;(inviteUserToPlexServer as jest.Mock).mockResolvedValue({
      success: true,
      inviteID: 7,
    })
    ;(acceptPlexInvite as jest.Mock).mockResolvedValue({
      success: false,
      error: 'token expired',
    })

    const result = await processAccessGrant(makeJob('user-2'))

    expect(acceptPlexInvite).toHaveBeenCalledWith('user-token', 7)
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-2' },
      data: { accessSkipCode: null, plexInviteStatus: 'pending' },
    })
    expect(result).toEqual({ userId: 'user-2', granted: false })
  })

  it('leaves the invite pending when the user has no Plex token', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({
      id: 'user-3',
      email: 'user3@example.com',
      plexAuthToken: null,
      })
    )
    ;(inviteUserToPlexServer as jest.Mock).mockResolvedValue({
      success: true,
      inviteID: 99,
    })

    const result = await processAccessGrant(makeJob('user-3'))

    // No token means we never attempt auto-accept.
    expect(acceptPlexInvite).not.toHaveBeenCalled()
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-3' },
      data: { accessSkipCode: null, plexInviteStatus: 'pending' },
    })
    expect(result).toEqual({ userId: 'user-3', granted: false })
  })

  it('leaves the invite pending when no invite id is returned', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({
      id: 'user-4',
      email: 'user4@example.com',
      plexAuthToken: 'user-token',
      })
    )
    // Invite succeeded but Plex did not return an id → cannot auto-accept.
    ;(inviteUserToPlexServer as jest.Mock).mockResolvedValue({ success: true })

    const result = await processAccessGrant(makeJob('user-4'))

    expect(acceptPlexInvite).not.toHaveBeenCalled()
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-4' },
      data: { accessSkipCode: null, plexInviteStatus: 'pending' },
    })
    expect(result.granted).toBe(false)
  })

  it('throws (to trigger retry) when the invite fails', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({
      id: 'user-5',
      email: 'user5@example.com',
      plexAuthToken: 'user-token',
      })
    )
    ;(inviteUserToPlexServer as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Plex API unavailable',
    })

    await expect(processAccessGrant(makeJob('user-5'))).rejects.toThrow(
      'PLEX_INVITE_FAILED'
    )
    expect(acceptPlexInvite).not.toHaveBeenCalled()
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled()
  })

  it('throws when no active Plex server is configured', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser())
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(null)

    await expect(processAccessGrant(makeJob('user-6'))).rejects.toThrow(
      'NO_PLEX_SERVER'
    )
    expect(inviteUserToPlexServer).not.toHaveBeenCalled()
  })

  it('skips a Plex member with no email with NO_MEMBER_SERVICE, and does not throw (GAP-23)', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({
      id: 'user-7',
      email: null,
      plexAuthToken: 'user-token',
      })
    )

    const result = await processAccessGrant(makeJob('user-7'))

    expect(result).toEqual({ userId: 'user-7', granted: false, skipped: 'NO_MEMBER_SERVICE' })
    expect(inviteUserToPlexServer).not.toHaveBeenCalled()
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-7' },
      data: { accessSkipCode: 'NO_MEMBER_SERVICE' },
    })
  })

  describe('live re-check (SEC-38)', () => {
    it('skips a member whose subscription is no longer ACTIVE', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
        makeUser({ subscription: { status: SubscriptionStatus.CANCELED, stripeSubscriptionId: 'sub_1' } })
      )

      const result = await processAccessGrant(makeJob('user-1'))

      expect(result).toEqual({ userId: 'user-1', granted: false, skipped: 'subscription is not active' })
      expect(inviteUserToPlexServer).not.toHaveBeenCalled()
      expect(prisma.subscription.updateMany).not.toHaveBeenCalled()
    })

    it('skips a canceled member whose row still says ACTIVE, by asking Stripe', async () => {
      const stripe = createFakeStripe()
      stripe.subscriptions.set('sub_1', stripeSubscription({ status: 'canceled' }))
      ;(getStripe as jest.Mock).mockResolvedValue(stripe.client)
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser())

      const result = await processAccessGrant(makeJob('user-1'))

      expect(result.skipped).toBe('subscription is not active in Stripe')
      expect(inviteUserToPlexServer).not.toHaveBeenCalled()
    })

    it('skips a user without full access (disabled, or not entitled)', async () => {
      ;(getAccessLevel as jest.Mock).mockResolvedValue('lapsed')
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser())

      const result = await processAccessGrant(makeJob('user-1'))

      expect(result.skipped).toBe('user is not entitled')
      expect(inviteUserToPlexServer).not.toHaveBeenCalled()
    })

    it('skips a user who no longer exists', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await processAccessGrant(makeJob('gone'))

      expect(result).toEqual({ userId: 'gone', granted: false, skipped: 'user not found' })
    })

    it('lets an exempt member be granted without a subscription', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser({ isExempt: true, subscription: null }))
      ;(inviteUserToPlexServer as jest.Mock).mockResolvedValue({ success: true, inviteID: 5 })
      ;(acceptPlexInvite as jest.Mock).mockResolvedValue({ success: true })

      const result = await processAccessGrant(makeJob('user-1'))

      expect(inviteUserToPlexServer).toHaveBeenCalled()
      expect(result).toEqual({ userId: 'user-1', granted: true })
    })

    it('records existing access as accepted and sends no invite', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser({ plexUserId: 'plex-7' }))
      ;(checkUserServerAccess as jest.Mock).mockResolvedValue({ status: 'granted' })

      const result = await processAccessGrant(makeJob('user-1'))

      expect(checkUserServerAccess).toHaveBeenCalledWith(
        {
          url: PLEX_SERVER.url,
          token: PLEX_SERVER.token,
          adminPlexUserId: 'plex-owner',
          machineIdentifier: 'this-server-machine-id',
        },
        'plex-7'
      )
      expect(inviteUserToPlexServer).not.toHaveBeenCalled()
      expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { accessSkipCode: null, plexInviteStatus: 'accepted' },
      })
      expect(result).toEqual({ userId: 'user-1', granted: true })
    })

    it('invites when the access check is unknown', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser({ plexUserId: 'plex-7' }))
      ;(checkUserServerAccess as jest.Mock).mockResolvedValue({ status: 'unknown', reason: 'plex_unavailable' })
      ;(inviteUserToPlexServer as jest.Mock).mockResolvedValue({ success: true, inviteID: 5 })
      ;(acceptPlexInvite as jest.Mock).mockResolvedValue({ success: true })

      await processAccessGrant(makeJob('user-1'))

      expect(inviteUserToPlexServer).toHaveBeenCalled()
    })
  })
})

describe('processAccessGrant per service (P11.11)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(PLEX_SERVER)
    prismaMock.jellyfinServer.findFirst.mockResolvedValue(JELLYFIN_SERVER as never)
    ;(prisma.subscription.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue(null)
    ;(getAccessLevel as jest.Mock).mockResolvedValue('full')
    ;(getStripe as jest.Mock).mockResolvedValue(null)
    ;(checkUserServerAccess as jest.Mock).mockResolvedValue({ status: 'denied' })
    jest.mocked(setJellyfinAccountDisabled).mockResolvedValue({ success: true, status: 'changed' })
    ;(inviteUserToPlexServer as jest.Mock).mockResolvedValue({ success: true, inviteID: 5 })
    ;(acceptPlexInvite as jest.Mock).mockResolvedValue({ success: true })
  })

  it('enables a Jellyfin-only member through the merged policy, with no Plex call', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ email: null, plexUserId: null, plexAuthToken: null, jellyfinUserId: 'jf-1' })
    )

    const result = await processAccessGrant(makeJob('user-1'))

    expect(setJellyfinAccountDisabled).toHaveBeenCalledWith(JELLYFIN_SERVER, 'jf-1', false)
    expect(prisma.plexServer.findFirst).not.toHaveBeenCalled()
    expect(inviteUserToPlexServer).not.toHaveBeenCalled()
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { accessSkipCode: null, jellyfinAccessStatus: 'enabled' },
    })
    expect(result).toEqual({ userId: 'user-1', granted: true })
  })

  it('never uses a Jellyfin member\'s email or username as a Plex address', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ email: 'jfuser', plexUserId: null, jellyfinUserId: 'jf-1' })
    )

    await processAccessGrant(makeJob('user-1'))

    expect(inviteUserToPlexServer).not.toHaveBeenCalled()
  })

  it('grants both to a member with both, turning Jellyfin on before the Plex invite', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser({ jellyfinUserId: 'jf-1' }))

    const result = await processAccessGrant(makeJob('user-1'))

    expect(setJellyfinAccountDisabled).toHaveBeenCalledWith(JELLYFIN_SERVER, 'jf-1', false)
    expect(inviteUserToPlexServer).toHaveBeenCalledWith(expect.anything(), 'user@example.com', undefined)
    expect(jest.mocked(setJellyfinAccountDisabled).mock.invocationCallOrder[0]).toBeLessThan(
      (inviteUserToPlexServer as jest.Mock).mock.invocationCallOrder[0]
    )
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { accessSkipCode: null, plexInviteStatus: 'accepted', jellyfinAccessStatus: 'enabled' },
    })
    expect(result).toEqual({ userId: 'user-1', granted: true })
  })

  it('skips a member with no linked service with NO_MEMBER_SERVICE, and nothing throws', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser({ plexUserId: null, jellyfinUserId: null }))

    const result = await processAccessGrant(makeJob('user-1'))

    expect(result).toEqual({ userId: 'user-1', granted: false, skipped: 'NO_MEMBER_SERVICE' })
    expect(setJellyfinAccountDisabled).not.toHaveBeenCalled()
    expect(inviteUserToPlexServer).not.toHaveBeenCalled()
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { accessSkipCode: 'NO_MEMBER_SERVICE' },
    })
  })

  it('records a Jellyfin account the server no longer has as skipped', async () => {
    jest.mocked(setJellyfinAccountDisabled).mockResolvedValue({ success: true, status: 'not_found' })
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser({ plexUserId: null, jellyfinUserId: 'jf-gone' }))

    const result = await processAccessGrant(makeJob('user-1'))

    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { accessSkipCode: null, jellyfinAccessStatus: 'skipped' },
    })
    expect(result).toEqual({ userId: 'user-1', granted: false })
  })

  it('retries when Jellyfin is unavailable, before any Plex invite', async () => {
    jest.mocked(setJellyfinAccountDisabled).mockResolvedValue({ success: false, code: 'JELLYFIN_UNAVAILABLE' })
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser({ jellyfinUserId: 'jf-1' }))

    await expect(processAccessGrant(makeJob('user-1'))).rejects.toThrow('JELLYFIN_UNAVAILABLE')
    expect(inviteUserToPlexServer).not.toHaveBeenCalled()
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled()
  })

  it('retries when no Jellyfin server is active', async () => {
    prismaMock.jellyfinServer.findFirst.mockResolvedValue(null)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser({ plexUserId: null, jellyfinUserId: 'jf-1' }))

    await expect(processAccessGrant(makeJob('user-1'))).rejects.toThrow('NO_JELLYFIN_SERVER')
  })
})
