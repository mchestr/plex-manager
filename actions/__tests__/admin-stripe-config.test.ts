/**
 * Tests for Stripe config actions in actions/admin/admin-config.ts
 *
 * Covers:
 * - updateStripeSettings: persistence, leave-blank-to-keep secrets, admin auth
 * - setStripeEnabled: enable-blocked when incomplete (the job queue included,
 *   GAP-15), enable-allowed when complete, disable always allowed, admin auth
 * - getStripeConfig: returns only non-secret status (no secret leakage)
 */

import {
  getStripeConfig,
  setStripeEnabled,
  updateStripeSettings,
} from '@/actions/admin/admin-config'
import { AuditEventType, logAuditEvent } from '@/lib/security/audit-log'
import { clearOfferedPricesCache } from '@/lib/stripe/prices'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

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
  updateTag: jest.fn(),
  unstable_cache: (fn: unknown) => fn,
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/security/audit-log', () => ({
  ...jest.requireActual('@/lib/security/audit-log'),
  logAuditEvent: jest.fn(),
}))

const mockPrisma = prismaMock
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
    process.env.REDIS_URL = 'redis://localhost:6379/15'
  })

  afterEach(() => {
    delete process.env.REDIS_URL
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

    it('audits the change with secretChanged and never a secret value', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue({
        stripeSecretKey: 'sk_test_old',
        stripeWebhookSecret: 'whsec_old',
        stripePriceIds: ['price_1'],
        stripeLibrarySectionIds: [],
      })

      await updateStripeSettings({ secretKey: 'sk_test_new', priceIds: ['price_1', 'price_2'], librarySectionIds: [] })

      expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.CONFIG_CHANGED, 'admin-123', {
        section: 'stripe',
        changedFields: ['stripePriceIds'],
        secretChanged: true,
        origins: { before: {}, after: {} },
      })
      expect(JSON.stringify((logAuditEvent as jest.Mock).mock.calls)).not.toMatch(/sk_test|whsec/)
    })

    it('records secretChanged: false when both secrets are left blank', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue({
        stripeSecretKey: 'sk_test_old',
        stripeWebhookSecret: 'whsec_old',
        stripePriceIds: ['price_1'],
        stripeLibrarySectionIds: [],
      })

      await updateStripeSettings({ priceIds: ['price_1'], librarySectionIds: [] })

      expect((logAuditEvent as jest.Mock).mock.calls[0][2]).toMatchObject({ changedFields: [], secretChanged: false })
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
      ).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
      expect(mockPrisma.config.upsert).not.toHaveBeenCalled()
    })

    it('returns error for invalid input', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)

      const result = await updateStripeSettings({
        priceIds: 'not-an-array',
      } as unknown as { priceIds: string[]; librarySectionIds: number[] })

      expect(result).toMatchObject({ success: false, code: 'VALIDATION' })
      expect(mockPrisma.config.upsert).not.toHaveBeenCalled()
    })

    it('handles database errors gracefully', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      ;(mockPrisma.config.upsert as jest.Mock).mockRejectedValue(new Error('DB down'))

      const result = await updateStripeSettings({ priceIds: ['price_1'], librarySectionIds: [] })

      expect(result).toEqual({ success: false, code: 'INTERNAL', error: 'Failed to update Stripe settings' })
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

      if (result.success) throw new Error('Expected enabling to be refused')
      expect(result.code).toBe('VALIDATION')
      expect(result.error).toContain('webhook secret')
      expect(result.error).toContain('at least one price ID')
      expect(result.error).not.toContain('secret key,')
      expect(mockPrisma.config.upsert).not.toHaveBeenCalled()
    })

    it('blocks enabling when config row does not exist', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await setStripeEnabled(true)

      expect(result).toMatchObject({ success: false, error: expect.stringContaining('secret key') })
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

    it('refuses enabling without REDIS_URL, which the webhook jobs need (GAP-15)', async () => {
      delete process.env.REDIS_URL
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue({
        stripeSecretKey: 'sk_test_123',
        stripeWebhookSecret: 'whsec_123',
        stripePriceIds: ['price_1'],
      })

      const result = await setStripeEnabled(true)

      expect(result).toMatchObject({ success: false, code: 'VALIDATION', error: expect.stringContaining('job queue (REDIS_URL)') })
      expect(mockPrisma.config.upsert).not.toHaveBeenCalled()
    })

    it('allows disabling an incomplete config, and audits the change', async () => {
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue({
        stripeEnabled: true,
        stripeSecretKey: null,
        stripeWebhookSecret: null,
        stripePriceIds: [],
      })
      ;(mockPrisma.config.upsert as jest.Mock).mockResolvedValue({
        id: 'config',
        stripeEnabled: false,
      })

      const result = await setStripeEnabled(false)

      expect(result.success).toBe(true)
      expect(logAuditEvent).toHaveBeenCalledWith(
        AuditEventType.CONFIG_CHANGED,
        'admin-123',
        expect.objectContaining({ section: 'stripe.enabled', changedFields: ['stripeEnabled'] })
      )
      expect(mockPrisma.config.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ stripeEnabled: false }),
        })
      )
    })

    it('rejects non-admin users', async () => {
      mockGetServerSession.mockResolvedValue(mockNonAdminSession)

      await expect(setStripeEnabled(true)).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
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
        hasJobQueue: true,
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
        hasJobQueue: true,
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
        hasJobQueue: true,
        priceIds: [],
        librarySectionIds: [],
      })
    })

    it('reports a missing job queue', async () => {
      delete process.env.REDIS_URL
      mockGetServerSession.mockResolvedValue(mockAdminSession)
      ;(mockPrisma.config.findUnique as jest.Mock).mockResolvedValue(null)

      await expect(getStripeConfig()).resolves.toMatchObject({ hasJobQueue: false })
    })

    it('rejects non-admin users', async () => {
      mockGetServerSession.mockResolvedValue(mockNonAdminSession)

      await expect(getStripeConfig()).rejects.toThrow()
    })
  })
})
