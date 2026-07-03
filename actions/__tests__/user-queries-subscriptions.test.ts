/**
 * Tests for actions/user-queries.ts - getAllUsersWithWrapped subscription attach
 *
 * Tests cover:
 * - Batched subscription loading (single query, no N+1)
 * - Correct per-user subscription/exempt values from the DB
 * - Existing DTO fields remaining intact
 */

import { getAllUsersWithWrapped } from '@/actions/user-queries'
import { requireAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { makePrismaUser, makePrismaSubscription } from '@/__tests__/utils/test-builders'

// user-queries.ts imports getServerSession/authOptions; mock them so the module
// doesn't pull in the full NextAuth (ESM `jose`) chain, which Jest can't parse.
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/admin', () => ({
  requireAdmin: jest.fn(),
}))

// Mock the Plex connection helpers used by buildPlexAccessMap. We return no
// active server so the access map resolves to null for every user, keeping the
// test focused on subscription attachment.
jest.mock('@/lib/connections/plex', () => ({
  checkUserServerAccess: jest.fn(),
  getPlexServerIdentity: jest.fn(),
  getPlexUsers: jest.fn(),
  unshareUserFromPlexServer: jest.fn(),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
    },
    plexServer: {
      findFirst: jest.fn(),
    },
    plexWrapped: {
      findMany: jest.fn(),
    },
    subscription: {
      findMany: jest.fn(),
    },
  },
}))

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>
const mockPrisma = prisma as unknown as {
  user: { findMany: jest.Mock }
  plexServer: { findFirst: jest.Mock }
  plexWrapped: { findMany: jest.Mock }
  subscription: { findMany: jest.Mock }
}

describe('getAllUsersWithWrapped - subscription attach', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireAdmin.mockResolvedValue(undefined)
    // No active Plex server → access map is null for everyone.
    mockPrisma.plexServer.findFirst.mockResolvedValue(null)
    // No share stats by default.
    mockPrisma.plexWrapped.findMany.mockResolvedValue([])
    mockPrisma.subscription.findMany.mockResolvedValue([])
  })

  it('loads subscriptions in a single batched query (no N+1)', async () => {
    const users = [
      makePrismaUser({ id: 'user-1', isExempt: false, exemptReason: null }),
      makePrismaUser({ id: 'user-2', isExempt: false, exemptReason: null }),
      makePrismaUser({ id: 'user-3', isExempt: false, exemptReason: null }),
    ]
    mockPrisma.user.findMany.mockResolvedValue(users)

    await getAllUsersWithWrapped(2024)

    // A single findMany with all user ids batched in.
    expect(mockPrisma.subscription.findMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: { in: ['user-1', 'user-2', 'user-3'] } },
      })
    )
  })

  it('attaches subscription fields per user from the DB', async () => {
    const users = [
      makePrismaUser({ id: 'user-1', isExempt: false, exemptReason: null }),
      makePrismaUser({ id: 'user-2', isExempt: false, exemptReason: null }),
    ]
    mockPrisma.user.findMany.mockResolvedValue(users)
    mockPrisma.subscription.findMany.mockResolvedValue([
      makePrismaSubscription({
        userId: 'user-1',
        status: 'ACTIVE',
        currentPeriodEnd: new Date('2024-03-01T00:00:00Z'),
        cancelAtPeriodEnd: true,
        stripeCustomerId: 'cus_abc',
      }),
    ])

    const result = await getAllUsersWithWrapped(2024)

    const user1 = result.find((u) => u.id === 'user-1')!
    expect(user1.subscriptionStatus).toBe('ACTIVE')
    expect(user1.currentPeriodEnd).toEqual(new Date('2024-03-01T00:00:00Z'))
    expect(user1.cancelAtPeriodEnd).toBe(true)
    expect(user1.stripeCustomerId).toBe('cus_abc')

    // user-2 has no subscription row → null/default values.
    const user2 = result.find((u) => u.id === 'user-2')!
    expect(user2.subscriptionStatus).toBeNull()
    expect(user2.currentPeriodEnd).toBeNull()
    expect(user2.cancelAtPeriodEnd).toBe(false)
    expect(user2.stripeCustomerId).toBeNull()
  })

  it('reflects exemption fields from the user record', async () => {
    const users = [
      makePrismaUser({ id: 'user-1', isExempt: true, exemptReason: 'grandfathered' }),
      makePrismaUser({ id: 'user-2', isExempt: false, exemptReason: null }),
    ]
    mockPrisma.user.findMany.mockResolvedValue(users)

    const result = await getAllUsersWithWrapped(2024)

    const exemptUser = result.find((u) => u.id === 'user-1')!
    expect(exemptUser.isExempt).toBe(true)
    expect(exemptUser.exemptReason).toBe('grandfathered')

    const normalUser = result.find((u) => u.id === 'user-2')!
    expect(normalUser.isExempt).toBe(false)
    expect(normalUser.exemptReason).toBeNull()
  })

  it('keeps existing DTO fields intact', async () => {
    const users = [makePrismaUser({ id: 'user-1', isExempt: false, exemptReason: null })]
    mockPrisma.user.findMany.mockResolvedValue(users)

    const result = await getAllUsersWithWrapped(2024)

    const user = result[0]
    expect(user.id).toBe('user-1')
    expect(user.wrappedStatus).toBe('completed')
    expect(user.totalWrappedCount).toBe(1)
    expect(user.hasPlexAccess).toBeNull()
    expect(user.llmUsage).not.toBeNull()
    expect(user.totalLlmUsage).not.toBeNull()
  })
})
