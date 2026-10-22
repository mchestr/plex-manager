/**
 * @jest-environment node
 */

/**
 * Tests for the PLEX_ACCESS_REVOKE job (`processPlexAccessRevoke` and the
 * `evaluateRevokeGuard` predicate in lib/queue/jobs/stripe.ts) plus the webhook
 * wiring that enqueues revoke on deletion/unpaid.
 *
 * The safety guards are the highest-value tests in the whole feature: automatic
 * removal must NEVER unshare an admin, an exempt user, a non-Stripe-managed
 * user, or a PAST_DUE subscriber. Every protected case is asserted explicitly.
 *
 * The processor is invoked directly with a fixture `Job`; BullMQ/Redis are not
 * touched. The Plex unshare helper and Prisma are mocked.
 */

import { UnrecoverableError, type Job } from 'bullmq'

import {
  processPlexAccessRevoke,
  evaluateRevokeGuard,
  processStripeWebhook,
  getStripeProcessor,
} from '@/lib/queue/jobs/stripe'
import { prisma } from '@/lib/prisma'
import { unshareUserFromPlexServer } from '@/lib/connections/plex-invitations'
import { getStripe } from '@/lib/stripe/client'
import { addJob } from '@/lib/queue/client'
import { SubscriptionStatus } from '@/lib/generated/prisma/client'
import { JOB_TYPES } from '@/lib/queue/types'
import { mockReset } from 'jest-mock-extended'
import type Stripe from 'stripe'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { buildConfig } from '@/__tests__/helpers/factories'
import {
  createFakeStripe,
  emptyStripeStore,
  installStripeStore,
  stripeEvent,
  stripeSubscription,
  subscriptionRow,
  type FakeStripe,
  type StripeStore,
} from '@/__tests__/helpers/stripe-fakes'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock('@/lib/connections/plex-invitations', () => ({
  inviteUserToPlexServer: jest.fn(),
  acceptPlexInvite: jest.fn(),
  unshareUserFromPlexServer: jest.fn(),
}))

jest.mock('@/lib/stripe/client', () => ({
  getStripe: jest.fn(),
}))

jest.mock('@/lib/queue/client', () => ({
  addJob: jest.fn(),
}))

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}))

const PLEX_SERVER = {
  id: 'ps_1',
  url: 'https://plex.example.com:32400',
  token: 'server-token',
  machineIdentifier: 'this-server-machine-id',
}

/** Build a minimal fixture Job for the revoke processor. */
function makeRevokeJob(userId: string): Job {
  return {
    id: 'job-revoke-1',
    data: { userId },
    attemptsMade: 0,
  } as unknown as Job
}

/**
 * Build a `prisma.user.findUnique` result with sensible eligible-for-removal
 * defaults, overridable per test.
 */
function makeUser(overrides: {
  isAdmin?: boolean
  isExempt?: boolean
  plexUserId?: string | null
  stripeSubscriptionId?: string | null
  status?: SubscriptionStatus
} = {}) {
  return {
    id: 'user-1',
    isAdmin: overrides.isAdmin ?? false,
    isExempt: overrides.isExempt ?? false,
    // Preserve an explicit `null` (as with `stripeSubscriptionId` below): the
    // "no linked Plex account" test relies on `plexUserId` actually being null,
    // so `?? 'plex-user-1'` would wrongly override it.
    plexUserId:
      overrides.plexUserId === undefined ? 'plex-user-1' : overrides.plexUserId,
    subscription: {
      stripeSubscriptionId:
        overrides.stripeSubscriptionId === undefined
          ? 'sub_1'
          : overrides.stripeSubscriptionId,
      status: overrides.status ?? SubscriptionStatus.CANCELED,
    },
  }
}

describe('evaluateRevokeGuard', () => {
  const eligible = {
    isAdmin: false,
    isExempt: false,
    stripeSubscriptionId: 'sub_1',
    status: SubscriptionStatus.CANCELED,
    liveStatus: null,
  }

  it('protects admins', () => {
    expect(evaluateRevokeGuard({ ...eligible, isAdmin: true })).toBe(
      'user is an admin'
    )
  })

  it('protects exempt users', () => {
    expect(evaluateRevokeGuard({ ...eligible, isExempt: true })).toBe(
      'user is exempt'
    )
  })

  it('protects non-Stripe-managed users', () => {
    expect(
      evaluateRevokeGuard({ ...eligible, stripeSubscriptionId: null })
    ).toBe('user is not Stripe-managed')
  })

  it('protects past-due subscribers', () => {
    expect(
      evaluateRevokeGuard({ ...eligible, status: SubscriptionStatus.PAST_DUE })
    ).toBe('subscription is past due')
  })

  it('prioritizes the admin guard over other protections', () => {
    // An admin who is also non-managed and past-due still reports the admin
    // reason: the highest-priority protection wins.
    expect(
      evaluateRevokeGuard({
        isAdmin: true,
        isExempt: true,
        stripeSubscriptionId: null,
        status: SubscriptionStatus.PAST_DUE,
        liveStatus: 'active',
      })
    ).toBe('user is an admin')
  })

  it('protects a member whose stored status is not CANCELED or UNPAID', () => {
    expect(evaluateRevokeGuard({ ...eligible, status: SubscriptionStatus.ACTIVE })).toBe(
      'subscription is active again'
    )
    expect(evaluateRevokeGuard({ ...eligible, status: SubscriptionStatus.INCOMPLETE })).toBe(
      'subscription is active again'
    )
  })

  it('protects a member whom Stripe reports active again', () => {
    expect(evaluateRevokeGuard({ ...eligible, liveStatus: 'active' })).toBe('subscription is active again')
    expect(evaluateRevokeGuard({ ...eligible, liveStatus: 'past_due' })).toBe('subscription is active again')
    expect(evaluateRevokeGuard({ ...eligible, liveStatus: 'incomplete_expired' })).toBeNull()
  })

  it('returns null for an eligible user', () => {
    expect(evaluateRevokeGuard(eligible)).toBeNull()
    expect(
      evaluateRevokeGuard({ ...eligible, status: SubscriptionStatus.UNPAID })
    ).toBeNull()
  })
})

describe('processPlexAccessRevoke', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(PLEX_SERVER)
    ;(prisma.subscription.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
    ;(unshareUserFromPlexServer as jest.Mock).mockResolvedValue({ success: true, status: 'removed' })
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 })
  })

  it('NEVER unshares an admin (skips with success)', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ isAdmin: true })
    )

    const result = await processPlexAccessRevoke(makeRevokeJob('user-1'))

    expect(unshareUserFromPlexServer).not.toHaveBeenCalled()
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
    expect(result).toEqual({ userId: 'user-1', revoked: false })
  })

  it('NEVER unshares an exempt user (skips with success)', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ isExempt: true })
    )

    const result = await processPlexAccessRevoke(makeRevokeJob('user-1'))

    expect(unshareUserFromPlexServer).not.toHaveBeenCalled()
    expect(result).toEqual({ userId: 'user-1', revoked: false })
  })

  it('NEVER unshares a non-Stripe-managed user (skips with success)', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ stripeSubscriptionId: null })
    )

    const result = await processPlexAccessRevoke(makeRevokeJob('user-1'))

    expect(unshareUserFromPlexServer).not.toHaveBeenCalled()
    expect(result).toEqual({ userId: 'user-1', revoked: false })
  })

  it('NEVER unshares a PAST_DUE subscriber (skips with success)', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ status: SubscriptionStatus.PAST_DUE })
    )

    const result = await processPlexAccessRevoke(makeRevokeJob('user-1'))

    expect(unshareUserFromPlexServer).not.toHaveBeenCalled()
    expect(result).toEqual({ userId: 'user-1', revoked: false })
  })

  it('does not even load the Plex server when a guard trips', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ isAdmin: true })
    )

    await processPlexAccessRevoke(makeRevokeJob('user-1'))

    // Guards are evaluated first; no server lookup / no Plex call.
    expect(prisma.plexServer.findFirst).not.toHaveBeenCalled()
  })

  it('unshares an eligible (canceled, managed, non-exempt, non-admin) user', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ plexUserId: 'plex-99' })
    )

    const result = await processPlexAccessRevoke(makeRevokeJob('user-1'))

    expect(unshareUserFromPlexServer).toHaveBeenCalledWith(
      { url: PLEX_SERVER.url, token: PLEX_SERVER.token, machineIdentifier: 'this-server-machine-id' },
      'plex-99'
    )
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        OR: [{ plexInviteStatus: null }, { plexInviteStatus: { not: 'revoked' } }],
      },
      data: { plexInviteStatus: 'revoked' },
    })
    // Sessions end only after the unshare and the revoked status (SEC-10).
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { sessionVersion: { increment: 1 } },
    })
    expect(prismaMock.user.updateMany.mock.invocationCallOrder[0]).toBeGreaterThan(
      prismaMock.subscription.updateMany.mock.invocationCallOrder[0]
    )
    expect(result).toEqual({ userId: 'user-1', revoked: true })
  })

  it('enqueues one Discord role sync for a linked member, through endUserSessions (P4.18)', async () => {
    const previousRedisUrl = process.env.REDIS_URL
    process.env.REDIS_URL = 'redis://localhost:6379/15'
    try {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser())
      prismaMock.discordIntegration.findUnique.mockResolvedValue({
        id: 'discord',
        isEnabled: true,
        clientId: 'client',
        clientSecret: 'secret',
      } as never)
      prismaMock.discordConnection.findUnique.mockResolvedValue({ revokedAt: null } as never)

      await processPlexAccessRevoke(makeRevokeJob('user-1'))

      const roleSyncs = (addJob as jest.Mock).mock.calls.filter(([type]) => type === JOB_TYPES.DISCORD_ROLE_SYNC)
      expect(roleSyncs).toEqual([
        [
          JOB_TYPES.DISCORD_ROLE_SYNC,
          { userId: 'user-1', reason: 'subscription_revoked', refreshHours: false },
          { attempts: 3, deduplication: { id: 'discord:role:user-1' } },
        ],
      ])
    } finally {
      if (previousRedisUrl === undefined) delete process.env.REDIS_URL
      else process.env.REDIS_URL = previousRedisUrl
    }
  })

  it('unshares an eligible UNPAID subscriber', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ status: SubscriptionStatus.UNPAID })
    )

    const result = await processPlexAccessRevoke(makeRevokeJob('user-1'))

    expect(unshareUserFromPlexServer).toHaveBeenCalled()
    expect(result.revoked).toBe(true)
  })

  it('is idempotent when the user has no linked Plex account', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ plexUserId: null })
    )

    const result = await processPlexAccessRevoke(makeRevokeJob('user-1'))

    expect(unshareUserFromPlexServer).not.toHaveBeenCalled()
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled()
    expect(result).toEqual({ userId: 'user-1', revoked: false })
  })

  it('succeeds without side effects when the user is not found', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)

    const result = await processPlexAccessRevoke(makeRevokeJob('missing'))

    expect(unshareUserFromPlexServer).not.toHaveBeenCalled()
    expect(result).toEqual({ userId: 'missing', revoked: false })
  })

  it('throws a retryable error when Plex is unavailable', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser())
    ;(unshareUserFromPlexServer as jest.Mock).mockResolvedValue({
      success: false,
      code: 'PLEX_UNAVAILABLE',
    })

    const error = await processPlexAccessRevoke(makeRevokeJob('user-1')).catch((thrown: unknown) => thrown)

    expect(error).toEqual(new Error('PLEX_UNAVAILABLE'))
    expect(error).not.toBeInstanceOf(UnrecoverableError)
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
  })

  it('throws UnrecoverableError when Plex rejects the owner token, so it is not retried', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser())
    ;(unshareUserFromPlexServer as jest.Mock).mockResolvedValue({ success: false, code: 'PLEX_AUTH' })

    const error = await processPlexAccessRevoke(makeRevokeJob('user-1')).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(UnrecoverableError)
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
  })

  it('records the removal and ends sessions when the share was already gone', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser())
    ;(unshareUserFromPlexServer as jest.Mock).mockResolvedValue({ success: true, status: 'already_removed' })

    const result = await processPlexAccessRevoke(makeRevokeJob('user-1'))

    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        OR: [{ plexInviteStatus: null }, { plexInviteStatus: { not: 'revoked' } }],
      },
      data: { plexInviteStatus: 'revoked' },
    })
    expect(prismaMock.user.updateMany).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ userId: 'user-1', revoked: true })
  })

  it('settles a rerun after success as a no-op, ending sessions once', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser())
    // First run removes the share; the rerun finds it gone and the status already recorded.
    ;(unshareUserFromPlexServer as jest.Mock)
      .mockResolvedValueOnce({ success: true, status: 'removed' })
      .mockResolvedValueOnce({ success: true, status: 'already_removed' })
    ;(prisma.subscription.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })

    await expect(processPlexAccessRevoke(makeRevokeJob('user-1'))).resolves.toEqual({ userId: 'user-1', revoked: true })
    await expect(processPlexAccessRevoke(makeRevokeJob('user-1'))).resolves.toEqual({ userId: 'user-1', revoked: false })

    expect(prismaMock.user.updateMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { sessionVersion: { increment: 1 } },
    })
  })

  it('throws when no active Plex server is configured', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser())
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(null)

    await expect(
      processPlexAccessRevoke(makeRevokeJob('user-1'))
    ).rejects.toThrow('No active Plex server configured')
    expect(unshareUserFromPlexServer).not.toHaveBeenCalled()
  })
})

describe('getStripeProcessor (revoke)', () => {
  it('returns the processor for PLEX_ACCESS_REVOKE', () => {
    expect(getStripeProcessor(JOB_TYPES.PLEX_ACCESS_REVOKE)).toBe(
      processPlexAccessRevoke
    )
  })
})

// =============================================================================
// Live re-check (SEC-38): a revoke never runs for a member who is active again
// =============================================================================

describe('processPlexAccessRevoke live re-check', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(PLEX_SERVER)
    ;(prisma.subscription.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
    ;(unshareUserFromPlexServer as jest.Mock).mockResolvedValue({ success: true, status: 'removed' })
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 })
    ;(getStripe as jest.Mock).mockResolvedValue(null)
  })

  it('skips when Stripe reports the subscription active', async () => {
    const stripe = createFakeStripe()
    stripe.subscriptions.set('sub_1', stripeSubscription({ status: 'active' }))
    ;(getStripe as jest.Mock).mockResolvedValue(stripe.client)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser())

    const result = await processPlexAccessRevoke(makeRevokeJob('user-1'))

    expect(stripe.client.subscriptions.retrieve).toHaveBeenCalledWith('sub_1')
    expect(unshareUserFromPlexServer).not.toHaveBeenCalled()
    expect(result).toEqual({ userId: 'user-1', revoked: false })
  })

  it('skips a manual retry of an old revoke after the member resubscribed', async () => {
    // The row is ACTIVE again on a new subscription; the old job only knows the user.
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ status: SubscriptionStatus.ACTIVE, stripeSubscriptionId: 'sub_new' })
    )

    const result = await processPlexAccessRevoke(makeRevokeJob('user-1'))

    expect(unshareUserFromPlexServer).not.toHaveBeenCalled()
    expect(result).toEqual({ userId: 'user-1', revoked: false })
  })

  it('unshares when both the row and Stripe say canceled', async () => {
    const stripe = createFakeStripe()
    stripe.subscriptions.set('sub_1', stripeSubscription({ status: 'canceled' }))
    ;(getStripe as jest.Mock).mockResolvedValue(stripe.client)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser())

    const result = await processPlexAccessRevoke(makeRevokeJob('user-1'))

    expect(unshareUserFromPlexServer).toHaveBeenCalled()
    expect(result.revoked).toBe(true)
  })

  it('does not ask Stripe when a stored-state guard already protects the user', async () => {
    const stripe = createFakeStripe()
    ;(getStripe as jest.Mock).mockResolvedValue(stripe.client)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser({ isAdmin: true }))

    await processPlexAccessRevoke(makeRevokeJob('user-1'))

    expect(stripe.client.subscriptions.retrieve).not.toHaveBeenCalled()
  })
})

// =============================================================================
// Webhook wiring: enqueue revoke on deletion/unpaid (respecting stripeEnabled)
// =============================================================================

describe('processStripeWebhook revoke enqueue', () => {
  let stripe: FakeStripe
  let store: StripeStore

  async function deliver(id: string, type: string, object: object, liveStatus: Stripe.Subscription.Status) {
    stripe.subscriptions.set('sub_1', stripeSubscription({ status: liveStatus }))
    stripe.events.set(id, stripeEvent(id, type, object, 1_760_000_000))
    await processStripeWebhook({ id, data: { eventId: id }, attemptsMade: 0, opts: { attempts: 3 } } as unknown as Job)
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockReset(prismaMock)
    stripe = createFakeStripe()
    store = emptyStripeStore([subscriptionRow({ status: SubscriptionStatus.ACTIVE })])
    installStripeStore(prismaMock, store)
    ;(getStripe as jest.Mock).mockResolvedValue(stripe.client)
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ stripeEnabled: true }))
    ;(addJob as jest.Mock).mockResolvedValue('job-revoke')
  })

  it('enqueues revoke on customer.subscription.deleted when enabled', async () => {
    await deliver('evt_deleted', 'customer.subscription.deleted', { id: 'sub_1' }, 'canceled')

    expect(store.subscriptions[0].status).toBe(SubscriptionStatus.CANCELED)
    // A revoke job is enqueued, keyed by user AND event id.
    expect(addJob).toHaveBeenCalledWith(
      JOB_TYPES.PLEX_ACCESS_REVOKE,
      { userId: 'user-1' },
      { jobId: `${JOB_TYPES.PLEX_ACCESS_REVOKE}:user-1:evt_deleted` }
    )
  })

  it('enqueues revoke on customer.subscription.updated with a live unpaid status', async () => {
    await deliver('evt_unpaid', 'customer.subscription.updated', { id: 'sub_1' }, 'unpaid')

    expect(addJob).toHaveBeenCalledWith(
      JOB_TYPES.PLEX_ACCESS_REVOKE,
      { userId: 'user-1' },
      { jobId: `${JOB_TYPES.PLEX_ACCESS_REVOKE}:user-1:evt_unpaid` }
    )
  })

  it('does NOT enqueue revoke on past_due transitions (access retained)', async () => {
    await deliver('evt_pastdue', 'customer.subscription.updated', { id: 'sub_1' }, 'past_due')

    expect(store.subscriptions[0].status).toBe(SubscriptionStatus.PAST_DUE)
    expect(addJob).not.toHaveBeenCalled()
  })

  it('does NOT enqueue revoke on invoice.payment_failed during dunning', async () => {
    await deliver('evt_failed', 'invoice.payment_failed', { id: 'in_1', subscription: 'sub_1' }, 'past_due')

    expect(addJob).not.toHaveBeenCalled()
  })

  it('records status but skips revoke enqueue when Stripe is disabled', async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ stripeEnabled: false }))

    await deliver('evt_deleted_disabled', 'customer.subscription.deleted', { id: 'sub_1' }, 'canceled')

    expect(store.subscriptions[0].status).toBe(SubscriptionStatus.CANCELED)
    expect(addJob).not.toHaveBeenCalled()
  })

  it('enqueues one revoke when the same deletion is delivered twice', async () => {
    await deliver('evt_deleted_retry', 'customer.subscription.deleted', { id: 'sub_1' }, 'canceled')
    await deliver('evt_deleted_retry', 'customer.subscription.deleted', { id: 'sub_1' }, 'canceled')

    expect(addJob).toHaveBeenCalledTimes(1)
  })
})
