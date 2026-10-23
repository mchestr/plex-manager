/**
 * Tests for admin subscription server actions in actions/admin/subscriptions.ts
 *
 * Covers:
 * - adminCancelSubscription: schedules cancel_at_period_end via Stripe, no
 *   immediate Plex removal, no-subscription / unconfigured handling, admin auth.
 * - adminGrantAccess: enqueues PLEX_ACCESS_GRANT and marks user comp-exempt;
 *   without Redis, or when the enqueue fails, the user is left as they were.
 * - adminToggleExempt: flips isExempt and sets/clears exemptReason.
 * - Auth: non-admin callers are rejected before any side effect.
 *
 * All external effects (Stripe, queue, Prisma, session) are mocked.
 */

import {
  adminCancelSubscription,
  adminGrantAccess,
  adminToggleExempt,
} from '@/actions/admin/subscriptions'
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe/client'
import { addJob } from '@/lib/queue/client'
import { getServerSession } from 'next-auth'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock('@/lib/stripe/client', () => ({
  getStripe: jest.fn(),
}))

jest.mock('@/lib/queue/client', () => ({
  addJob: jest.fn(),
}))

// Request paths enqueue through the fail-fast producer (P11.3); it answers
// QUEUE_UNAVAILABLE where addJob would throw, and records through the addJob mock.
jest.mock('@/lib/queue/request-path', () => ({
  enqueueFromRequest: jest.fn(async (...args: unknown[]) => {
    const { addJob } = jest.requireMock('@/lib/queue/client') as { addJob: (...a: unknown[]) => Promise<string> }
    try {
      return { ok: true, jobId: await addJob(...args) }
    } catch {
      return { ok: false, code: 'QUEUE_UNAVAILABLE' }
    }
  }),
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
  unstable_cache: <T,>(fn: T) => fn,
}))

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}))

const mockSubscriptionFindUnique = prisma.subscription.findUnique as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockUserUpdate = prisma.user.update as jest.Mock
const mockGetStripe = getStripe as jest.Mock
const mockAddJob = addJob as jest.Mock
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>

const adminSession = {
  user: { id: 'admin-1', name: 'Admin', email: 'admin@test.com', isAdmin: true },
  expires: new Date(Date.now() + 86400000).toISOString(),
}

const nonAdminSession = {
  user: { id: 'user-1', name: 'User', email: 'user@test.com', isAdmin: false },
  expires: new Date(Date.now() + 86400000).toISOString(),
}

function makeStripeMock() {
  return {
    subscriptions: {
      update: jest.fn().mockResolvedValue({ id: 'sub_1' }),
    },
  }
}

describe('adminCancelSubscription', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('schedules period-end cancellation without immediate Plex removal', async () => {
    mockGetServerSession.mockResolvedValue(adminSession)
    mockSubscriptionFindUnique.mockResolvedValue({ stripeSubscriptionId: 'sub_1' })
    const stripe = makeStripeMock()
    mockGetStripe.mockResolvedValue(stripe)

    const result = await adminCancelSubscription({ userId: 'user-9' })

    expect(result).toEqual({ success: true, data: null })
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_1', {
      cancel_at_period_end: true,
    })
    // No grant/revoke jobs enqueued: removal flows through the webhook.
    expect(mockAddJob).not.toHaveBeenCalled()
  })

  it('returns an error when the user has no subscription', async () => {
    mockGetServerSession.mockResolvedValue(adminSession)
    mockSubscriptionFindUnique.mockResolvedValue(null)

    const result = await adminCancelSubscription({ userId: 'user-9' })

    expect(result).toMatchObject({ success: false, error: expect.any(String) })
    expect(mockGetStripe).not.toHaveBeenCalled()
  })

  it('returns an error when Stripe is unconfigured', async () => {
    mockGetServerSession.mockResolvedValue(adminSession)
    mockSubscriptionFindUnique.mockResolvedValue({ stripeSubscriptionId: 'sub_1' })
    mockGetStripe.mockResolvedValue(null)

    const result = await adminCancelSubscription({ userId: 'user-9' })

    expect(result).toMatchObject({ success: false, error: expect.any(String) })
  })

  it('returns an error (does not throw) when Stripe update fails', async () => {
    mockGetServerSession.mockResolvedValue(adminSession)
    mockSubscriptionFindUnique.mockResolvedValue({ stripeSubscriptionId: 'sub_1' })
    const stripe = makeStripeMock()
    stripe.subscriptions.update.mockRejectedValue(new Error('Stripe down'))
    mockGetStripe.mockResolvedValue(stripe)

    const result = await adminCancelSubscription({ userId: 'user-9' })

    expect(result).toMatchObject({ success: false, error: expect.any(String) })
  })

  it('refuses a signed-out caller and an empty user id without a throw', async () => {
    mockGetServerSession.mockResolvedValue(null)
    await expect(adminCancelSubscription({ userId: 'user-9' })).resolves.toMatchObject({ code: 'UNAUTHENTICATED' })

    mockGetServerSession.mockResolvedValue(adminSession)
    await expect(adminCancelSubscription({ userId: '' })).resolves.toMatchObject({ code: 'VALIDATION' })
    expect(mockGetStripe).not.toHaveBeenCalled()
  })

  it('rejects a non-admin caller before touching Stripe', async () => {
    mockGetServerSession.mockResolvedValue(nonAdminSession)

    await expect(adminCancelSubscription({ userId: 'user-9' })).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
    expect(mockSubscriptionFindUnique).not.toHaveBeenCalled()
    expect(mockGetStripe).not.toHaveBeenCalled()
  })
})

describe('adminGrantAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.REDIS_URL = 'redis://localhost:6379/15'
  })

  afterEach(() => {
    delete process.env.REDIS_URL
  })

  it('fails fast without Redis and leaves isExempt false (GAP-15)', async () => {
    delete process.env.REDIS_URL
    mockGetServerSession.mockResolvedValue(adminSession)

    const result = await adminGrantAccess({ userId: 'user-9' })

    expect(result).toMatchObject({ success: false, error: expect.stringContaining('REDIS_URL') })
    expect(mockUserUpdate).not.toHaveBeenCalled()
    expect(mockAddJob).not.toHaveBeenCalled()
  })

  it('reverts the exemption when the enqueue throws', async () => {
    mockGetServerSession.mockResolvedValue(adminSession)
    mockUserFindUnique.mockResolvedValue({ id: 'user-9', isAdmin: false, isExempt: false, exemptReason: null })
    mockUserUpdate.mockResolvedValue({ id: 'user-9' })
    mockAddJob.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:6379'))

    const result = await adminGrantAccess({ userId: 'user-9' })

    expect(result).toMatchObject({ success: false, error: expect.not.stringContaining('ECONNREFUSED') })
    expect(mockUserUpdate).toHaveBeenLastCalledWith({
      where: { id: 'user-9' },
      data: { isExempt: false, exemptReason: null },
    })
  })

  it('enqueues the grant job and marks the user comp-exempt', async () => {
    mockGetServerSession.mockResolvedValue(adminSession)
    mockUserFindUnique.mockResolvedValue({ id: 'user-9' })
    mockUserUpdate.mockResolvedValue({ id: 'user-9' })
    mockAddJob.mockResolvedValue('plex:access:grant:user-9')

    const result = await adminGrantAccess({ userId: 'user-9' })

    expect(result).toEqual({ success: true, data: null })
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-9' },
      data: { isExempt: true, exemptReason: 'comp' },
    })
    // jobId carries a unique admin suffix so repeat comp-grants don't collapse
    // onto a stale completed job retained in Redis.
    expect(mockAddJob).toHaveBeenCalledWith(
      'plex:access:grant',
      { userId: 'user-9' },
      { jobId: expect.stringMatching(/^plex:access:grant:user-9:admin-\d+$/) }
    )
  })

  it('returns an error when the user is not found', async () => {
    mockGetServerSession.mockResolvedValue(adminSession)
    mockUserFindUnique.mockResolvedValue(null)

    const result = await adminGrantAccess({ userId: 'missing' })

    expect(result).toMatchObject({ success: false, error: expect.any(String) })
    expect(mockUserUpdate).not.toHaveBeenCalled()
    expect(mockAddJob).not.toHaveBeenCalled()
  })

  it('rejects a non-admin caller before any side effect', async () => {
    mockGetServerSession.mockResolvedValue(nonAdminSession)

    await expect(adminGrantAccess({ userId: 'user-9' })).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
    expect(mockUserFindUnique).not.toHaveBeenCalled()
    expect(mockAddJob).not.toHaveBeenCalled()
  })

  it('refuses to comp-grant an admin target (defense-in-depth)', async () => {
    mockGetServerSession.mockResolvedValue(adminSession)
    mockUserFindUnique.mockResolvedValue({ id: 'user-9', isAdmin: true })

    const result = await adminGrantAccess({ userId: 'user-9' })

    expect(result).toMatchObject({ success: false, error: expect.any(String) })
    expect(mockUserUpdate).not.toHaveBeenCalled()
    expect(mockAddJob).not.toHaveBeenCalled()
  })
})

describe('adminToggleExempt', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('enables exemption and records the reason when not currently exempt', async () => {
    mockGetServerSession.mockResolvedValue(adminSession)
    mockUserFindUnique.mockResolvedValue({ isExempt: false })
    mockUserUpdate.mockResolvedValue({ id: 'user-9' })

    const result = await adminToggleExempt({ userId: 'user-9' })

    expect(result).toEqual({ success: true, data: null })
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-9' },
      data: { isExempt: true, exemptReason: 'comp' },
    })
  })

  it('uses a provided reason when enabling exemption', async () => {
    mockGetServerSession.mockResolvedValue(adminSession)
    mockUserFindUnique.mockResolvedValue({ isExempt: false })
    mockUserUpdate.mockResolvedValue({ id: 'user-9' })

    await adminToggleExempt({ userId: 'user-9', reason: 'grandfathered' })

    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-9' },
      data: { isExempt: true, exemptReason: 'grandfathered' },
    })
  })

  it('clears the reason when disabling exemption', async () => {
    mockGetServerSession.mockResolvedValue(adminSession)
    mockUserFindUnique.mockResolvedValue({ isExempt: true })
    mockUserUpdate.mockResolvedValue({ id: 'user-9' })

    const result = await adminToggleExempt({ userId: 'user-9' })

    expect(result).toEqual({ success: true, data: null })
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-9' },
      data: { isExempt: false, exemptReason: null },
    })
  })

  it('returns an error when the user is not found', async () => {
    mockGetServerSession.mockResolvedValue(adminSession)
    mockUserFindUnique.mockResolvedValue(null)

    const result = await adminToggleExempt({ userId: 'missing' })

    expect(result).toMatchObject({ success: false, error: expect.any(String) })
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  it('rejects a non-admin caller before any side effect', async () => {
    mockGetServerSession.mockResolvedValue(nonAdminSession)

    await expect(adminToggleExempt({ userId: 'user-9' })).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
    expect(mockUserFindUnique).not.toHaveBeenCalled()
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  it('refuses to toggle exemption on an admin target (defense-in-depth)', async () => {
    mockGetServerSession.mockResolvedValue(adminSession)
    mockUserFindUnique.mockResolvedValue({ isExempt: false, isAdmin: true })

    const result = await adminToggleExempt({ userId: 'user-9' })

    expect(result).toMatchObject({ success: false, error: expect.any(String) })
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })
})
