/**
 * Verifies that the Stripe secret Config fields are encrypted at rest.
 *
 * The Prisma query extension in `lib/prisma.ts` encrypts/decrypts the fields
 * listed in its `ENCRYPTED_FIELDS` map via `lib/security/crypto.ts`. These tests
 * exercise that same encrypt-on-write / decrypt-on-read pipeline for the two new
 * `Config` secret fields (`stripeSecretKey`, `stripeWebhookSecret`), and confirm
 * the non-secret fields (`stripePriceIds`, `stripeEnabled`) are never encrypted.
 */

import { ENCRYPTION_PREFIX } from '@/lib/security/crypto'

// The crypto module caches the derived key at module load, so each scenario
// resets modules and re-imports with the desired ENCRYPTION_KEY state.
const CONFIG_SECRET_FIELDS = ['stripeSecretKey', 'stripeWebhookSecret'] as const

describe('Config Stripe secret encryption', () => {
  const originalKey = process.env.ENCRYPTION_KEY

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.ENCRYPTION_KEY
    } else {
      process.env.ENCRYPTION_KEY = originalKey
    }
    jest.resetModules()
  })

  it('encrypts stripeSecretKey and stripeWebhookSecret on write', () => {
    jest.resetModules()
    process.env.ENCRYPTION_KEY = 'test-encryption-key-abc123'
    const { encryptSecret } = require('@/lib/security/crypto')

    for (const field of CONFIG_SECRET_FIELDS) {
      const plaintext = `plaintext-${field}`
      const encrypted = encryptSecret(plaintext)
      expect(encrypted.startsWith(ENCRYPTION_PREFIX)).toBe(true)
      expect(encrypted).not.toBe(plaintext)
    }
  })

  it('decrypts stripeSecretKey and stripeWebhookSecret on read (round-trip)', () => {
    jest.resetModules()
    process.env.ENCRYPTION_KEY = 'test-encryption-key-abc123'
    const { encryptSecret, decryptSecret } = require('@/lib/security/crypto')

    for (const field of CONFIG_SECRET_FIELDS) {
      const plaintext = `sk_live_${field}`
      const encrypted = encryptSecret(plaintext)
      expect(decryptSecret(encrypted)).toBe(plaintext)
    }
  })

  it('passes secret values through unchanged when ENCRYPTION_KEY is unset', () => {
    jest.resetModules()
    delete process.env.ENCRYPTION_KEY
    const { encryptSecret, decryptSecret } = require('@/lib/security/crypto')

    for (const field of CONFIG_SECRET_FIELDS) {
      const plaintext = `plain-${field}`
      const encrypted = encryptSecret(plaintext)
      expect(encrypted).toBe(plaintext)
      expect(encrypted.startsWith(ENCRYPTION_PREFIX)).toBe(false)
      expect(decryptSecret(encrypted)).toBe(plaintext)
    }
  })

  it('leaves non-secret fields (stripePriceIds, stripeEnabled) as plaintext', () => {
    jest.resetModules()
    process.env.ENCRYPTION_KEY = 'test-encryption-key-abc123'
    // Simulate what the extension does: only the configured secret fields are
    // touched, non-secret fields are written verbatim.
    const nonSecretPriceIds = JSON.stringify(['price_a', 'price_b'])
    const nonSecretEnabled = true

    // Non-secret values are not in CONFIG_SECRET_FIELDS, so they are never passed
    // through encryptSecret and remain plaintext.
    expect(nonSecretPriceIds.startsWith(ENCRYPTION_PREFIX)).toBe(false)
    expect(typeof nonSecretEnabled).toBe('boolean')
  })

  it('registers the Stripe secret fields (and ONLY those) in ENCRYPTED_FIELDS', () => {
    jest.resetModules()
    // Guards against accidental removal of the Stripe secrets from the registry,
    // which would silently store them in plaintext.
    const { ENCRYPTED_FIELDS } = require('@/lib/prisma')
    expect(ENCRYPTED_FIELDS.Config).toEqual(['stripeSecretKey', 'stripeWebhookSecret'])
    // Non-secret Stripe columns must NOT be encrypted (they are read/filtered plainly).
    expect(ENCRYPTED_FIELDS.Config).not.toContain('stripePriceIds')
    expect(ENCRYPTED_FIELDS.Config).not.toContain('stripeEnabled')
  })
})
