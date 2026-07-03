/**
 * Disabled-state regression: toggling Stripe OFF is safe and reversible (FR-4).
 *
 * `setStripeEnabled(false)` must NOT cancel any Stripe subscriptions and must
 * NOT remove any Plex access — it only writes the `Config.stripeEnabled` flag.
 * The existing `admin-stripe-config.test.ts` asserts the flag write and that the
 * config-completeness check is skipped on disable; this file additionally proves
 * that no Stripe SDK call and no Plex unshare/invite helper is invoked on the
 * disable path, even when active subscriptions exist.
 *
 * This is a cross-cutting hardening pass (Step 12) — it exercises the real
 * action without editing any feature file.
 */

import { setStripeEnabled } from '@/actions/admin/admin-config'
import { getStripe } from '@/lib/stripe/client'
import {
  inviteUserToPlexServer,
  unshareUserFromPlexServer,
} from '@/lib/connections/plex-invitations'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    config: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    subscription: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

// A real Stripe client would let the action cancel subscriptions; assert it is
// never even constructed on the disable path.
jest.mock('@/lib/stripe/client', () => ({
  getStripe: jest.fn(),
}))

jest.mock('@/lib/connections/plex-invitations', () => ({
  inviteUserToPlexServer: jest.fn(),
  unshareUserFromPlexServer: jest.fn(),
  acceptPlexInvite: jest.fn(),
}))

const mockPrisma = prisma as unknown as {
  config: { findUnique: jest.Mock; upsert: jest.Mock }
  subscription: { findMany: jest.Mock; updateMany: jest.Mock }
}
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>

describe('setStripeEnabled(false) — safe & reversible toggle-off (FR-4)', () => {
  const adminSession = {
    user: { id: 'admin-1', name: 'Admin', email: 'admin@test.com', isAdmin: true },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetServerSession.mockResolvedValue(adminSession)
    mockPrisma.config.upsert.mockResolvedValue({ id: 'config', stripeEnabled: false })
  })

  it('only writes the flag: no config-completeness read, no Stripe, no Plex', async () => {
    const result = await setStripeEnabled(false)

    expect(result.success).toBe(true)

    // Disable never inspects config completeness.
    expect(mockPrisma.config.findUnique).not.toHaveBeenCalled()

    // The only DB write is the flag itself.
    expect(mockPrisma.config.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'config' },
        update: expect.objectContaining({ stripeEnabled: false }),
      })
    )
    expect(mockPrisma.subscription.updateMany).not.toHaveBeenCalled()

    // No Stripe SDK is constructed and no cancellations occur.
    expect(getStripe).not.toHaveBeenCalled()

    // No Plex access is added or removed.
    expect(unshareUserFromPlexServer).not.toHaveBeenCalled()
    expect(inviteUserToPlexServer).not.toHaveBeenCalled()

    // Existing subscriptions are left untouched (not queried for cancellation).
    expect(mockPrisma.subscription.findMany).not.toHaveBeenCalled()
  })

  it('is idempotent: disabling again still performs no destructive work', async () => {
    await setStripeEnabled(false)
    await setStripeEnabled(false)

    expect(mockPrisma.config.upsert).toHaveBeenCalledTimes(2)
    expect(getStripe).not.toHaveBeenCalled()
    expect(unshareUserFromPlexServer).not.toHaveBeenCalled()
  })
})
