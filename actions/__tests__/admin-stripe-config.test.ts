/**
 * Tests for Stripe config actions in actions/admin/admin-config.ts
 *
 * Covers:
 * - updateStripeSettings: persistence, leave-blank-to-keep secrets, admin auth
 * - setStripeEnabled: enable-blocked when incomplete, enable-allowed when complete,
 *   disable always allowed, admin auth
 * - getStripeConfig: returns only non-secret status (no secret leakage)
 */

import {
  getStripeConfig,
  setStripeEnabled,
  updateStripeSettings,
} from '@/actions/admin/admin-config'
import { prisma } from '@/lib/prisma'
import { clearOfferedPricesCache } from '@/lib/stripe/prices'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    config: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}))

// admin-config imports clearOfferedPricesCache; mock the prices module so this
// test doesn't pull in the real Stripe SDK / price cache.
jest.mock('@/lib/stripe/prices', () => ({
  clearOfferedPricesCache: jest.fn(),
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

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>

describe('admin Stripe config actions', () => {
  const mockAdminSession = {
    user: { id: 'admin-123', name: 'Admin', email: 'admin@test.com', isAdmin: true },
    expires: new Date(Date.now() + 86400000).toISOString(),
  }

  const mockNonAdminSession = {
    user: { id: 'user-123', name: 'User', email: 'user@test.com', isAdmin: false },
    expires: new Date(Date.now() + 86400000).toISOString(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('updateStripeSettings', () => {
    it('persists secrets and price ids for an admin', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      ;(mockPrisma.config.upsert as jest.Mock).mockResolvedValue({ id: 'config' })

      const result = await updateStripeSettings({
        secretKey: 'sk_test_123',
        webhookSecret: 'whsec_123',
        priceIds: ['price_1', 'price_2'],
        librarySectionIds: [1, 2],
      })

      expect(result.success).toBe(true)
      expect(mockPrisma.config.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'config' },
          update: expect.objectContaining({
            stripeSecretKey: 'sk_test_123',
            stripeWebhookSecret: 'whsec_123',
            stripePriceIds: ['price_1', 'price_2'],
            stripeLibrarySectionIds: [1, 2],
            updatedBy: 'admin-123',
          }),
        })
      )
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/settings')
      // Price-id changes must invalidate the offered-prices cache.
      expect(clearOfferedPricesCache).toHaveBeenCalled()
    })

    it('does not overwrite secrets when omitted (leave-blank-to-keep)', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      ;(mockPrisma.config.upsert as jest.Mock).mockResolvedValue({ id: 'config' })

      await updateStripeSettings({ priceIds: ['price_1'], librarySectionIds: [] })

      const call = (mockPrisma.config.upsert as jest.Mock).mock.calls[0][0]
      expect(call.update).not.toHaveProperty('stripeSecretKey')
      expect(call.update).not.toHaveProperty('stripeWebhookSecret')
      expect(call.update.stripePriceIds).toEqual(['price_1'])
    })

    it('rejects non-admin users', async () => {
      mockGetServerSession.mockResolvedValue(mockNonAdminSession)

      await expect(
        updateStripeSettings({ priceIds: ['price_1'], librarySectionIds: [] })
      ).rejects.toThrow()
      expect(mockPrisma.config.upsert).not.toHaveBeenCalled()
    })

    it('returns error for invalid input', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)

      const result = await updateStripeSettings({
        priceIds: 'not-an-array',
      } as unknown as { priceIds: string[]; librarySectionIds: number[] })

      expect(result).toEqual({ success: false, error: 'Invalid Stripe settings input' })
      expect(mockPrisma.config.upsert).not.toHaveBeenCalled()
    })

    it('handles database errors gracefully', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      ;(mockPrisma.config.upsert as jest.Mock).mockRejectedValue(new Error('DB down'))

      const result = await updateStripeSettings({ priceIds: ['price_1'], librarySectionIds: [] })

      expect(result).toEqual({ success: false, error: 'DB down' })
    })
  })

  describe('setStripeEnabled', () => {
    it('blocks enabling when config is incomplete and names missing pieces', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue({
        stripeSecretKey: 'sk_test_123',
        stripeWebhookSecret: null,
        stripePriceIds: [],
      })

      const result = await setStripeEnabled(true)

      expect(result.success).toBe(false)
      expect(result.error).toContain('webhook secret')
      expect(result.error).toContain('at least one price ID')
      expect(result.error).not.toContain('secret key,')
      expect(mockPrisma.config.upsert).not.toHaveBeenCalled()
    })

    it('blocks enabling when config row does not exist', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await setStripeEnabled(true)

      expect(result.success).toBe(false)
      expect(result.error).toContain('secret key')
      expect(mockPrisma.config.upsert).not.toHaveBeenCalled()
    })

    it('allows enabling when fully configured', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue({
        stripeSecretKey: 'sk_test_123',
        stripeWebhookSecret: 'whsec_123',
        stripePriceIds: ['price_1'],
      })
      ;(mockPrisma.config.upsert as jest.Mock).mockResolvedValue({
        id: 'config',
        stripeEnabled: true,
      })

      const result = await setStripeEnabled(true)

      expect(result.success).toBe(true)
      expect(mockPrisma.config.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ stripeEnabled: true, updatedBy: 'admin-123' }),
        })
      )
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/settings')
      // Enabling must invalidate the cache so /subscribe reflects it immediately.
      expect(clearOfferedPricesCache).toHaveBeenCalled()
    })

    it('allows disabling without checking config', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      ;(mockPrisma.config.upsert as jest.Mock).mockResolvedValue({
        id: 'config',
        stripeEnabled: false,
      })

      const result = await setStripeEnabled(false)

      expect(result.success).toBe(true)
      expect(mockPrisma.config.findUnique).not.toHaveBeenCalled()
      expect(mockPrisma.config.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ stripeEnabled: false }),
        })
      )
    })

    it('rejects non-admin users', async () => {
      mockGetServerSession.mockResolvedValue(mockNonAdminSession)

      await expect(setStripeEnabled(true)).rejects.toThrow()
      expect(mockPrisma.config.upsert).not.toHaveBeenCalled()
    })
  })

  describe('getStripeConfig', () => {
    it('returns only non-secret status and never raw secrets', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue({
        stripeEnabled: true,
        stripeSecretKey: 'sk_test_super_secret',
        stripeWebhookSecret: 'whsec_super_secret',
        stripePriceIds: ['price_1', 'price_2'],
        stripeLibrarySectionIds: [1, 2],
      })

      const result = await getStripeConfig()

      expect(result).toEqual({
        enabled: true,
        hasSecretKey: true,
        hasWebhookSecret: true,
        priceIds: ['price_1', 'price_2'],
        librarySectionIds: [1, 2],
      })

      const serialized = JSON.stringify(result)
      expect(serialized).not.toContain('sk_test_super_secret')
      expect(serialized).not.toContain('whsec_super_secret')
    })

    it('reports missing secrets as false booleans', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue({
        stripeEnabled: false,
        stripeSecretKey: null,
        stripeWebhookSecret: null,
        stripePriceIds: null,
        stripeLibrarySectionIds: null,
      })

      const result = await getStripeConfig()

      expect(result).toEqual({
        enabled: false,
        hasSecretKey: false,
        hasWebhookSecret: false,
        priceIds: [],
        librarySectionIds: [],
      })
    })

    it('returns defaults when config row does not exist', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await getStripeConfig()

      expect(result).toEqual({
        enabled: false,
        hasSecretKey: false,
        hasWebhookSecret: false,
        priceIds: [],
        librarySectionIds: [],
      })
    })

    it('rejects non-admin users', async () => {
      mockGetServerSession.mockResolvedValue(mockNonAdminSession)

      await expect(getStripeConfig()).rejects.toThrow()
    })
  })
})
