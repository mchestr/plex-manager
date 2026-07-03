import { ensureSubscriptionOrAccess, getAccessGateStatus } from '@/lib/guards'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    config: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}))

// The guards module also pulls in these actions; stub them so importing
// `@/lib/guards` does not drag in their real dependencies.
jest.mock('@/actions/onboarding', () => ({
  getOnboardingStatus: jest.fn(),
}))
jest.mock('@/actions/setup', () => ({
  getSetupStatus: jest.fn(),
}))

const mockPrisma = prisma as unknown as {
  config: { findUnique: jest.Mock }
  user: { findUnique: jest.Mock }
}
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockRedirect = redirect as unknown as jest.Mock

describe('getAccessGateStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('allows everyone when stripe is disabled (no user lookup)', async () => {
    mockPrisma.config.findUnique.mockResolvedValue({ stripeEnabled: false })

    const allowed = await getAccessGateStatus('user-1')

    expect(allowed).toBe(true)
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('allows everyone when config row is missing', async () => {
    mockPrisma.config.findUnique.mockResolvedValue(null)

    const allowed = await getAccessGateStatus('user-1')

    expect(allowed).toBe(true)
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
  })

  describe('when stripe is enabled', () => {
    beforeEach(() => {
      mockPrisma.config.findUnique.mockResolvedValue({ stripeEnabled: true })
    })

    it('denies when the user record is missing', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)

      expect(await getAccessGateStatus('user-1')).toBe(false)
    })

    it('allows an admin regardless of subscription', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        isAdmin: true,
        isExempt: false,
        subscription: null,
      })

      expect(await getAccessGateStatus('user-1')).toBe(true)
    })

    it('allows an exempt user regardless of subscription', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        isAdmin: false,
        isExempt: true,
        subscription: null,
      })

      expect(await getAccessGateStatus('user-1')).toBe(true)
    })

    it('allows a user with an ACTIVE subscription', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        isAdmin: false,
        isExempt: false,
        subscription: { status: 'ACTIVE' },
      })

      expect(await getAccessGateStatus('user-1')).toBe(true)
    })

    it('allows a user with a PAST_DUE subscription', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        isAdmin: false,
        isExempt: false,
        subscription: { status: 'PAST_DUE' },
      })

      expect(await getAccessGateStatus('user-1')).toBe(true)
    })

    it.each(['CANCELED', 'INCOMPLETE', 'UNPAID'])(
      'denies a non-admin/non-exempt user with a %s subscription',
      async (status) => {
        mockPrisma.user.findUnique.mockResolvedValue({
          isAdmin: false,
          isExempt: false,
          subscription: { status },
        })

        expect(await getAccessGateStatus('user-1')).toBe(false)
      }
    )

    it('denies a non-admin/non-exempt user with no subscription', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        isAdmin: false,
        isExempt: false,
        subscription: null,
      })

      expect(await getAccessGateStatus('user-1')).toBe(false)
    })
  })
})

describe('ensureSubscriptionOrAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('is a no-op when there is no session', async () => {
    mockGetServerSession.mockResolvedValue(null)

    await ensureSubscriptionOrAccess()

    expect(mockRedirect).not.toHaveBeenCalled()
    expect(mockPrisma.config.findUnique).not.toHaveBeenCalled()
  })

  it('does not redirect when the user is allowed', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as never)
    mockPrisma.config.findUnique.mockResolvedValue({ stripeEnabled: false })

    await ensureSubscriptionOrAccess()

    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('redirects to /subscribe when the user is not allowed', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as never)
    mockPrisma.config.findUnique.mockResolvedValue({ stripeEnabled: true })
    mockPrisma.user.findUnique.mockResolvedValue({
      isAdmin: false,
      isExempt: false,
      subscription: null,
    })

    await ensureSubscriptionOrAccess()

    expect(mockRedirect).toHaveBeenCalledWith('/subscribe')
  })
})
