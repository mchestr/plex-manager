/**
 * @jest-environment node
 */

/**
 * Tests for the rate limits on the Plex PIN actions in lib/plex-auth.ts.
 * plex.tv is never contacted: `fetch` is a stub.
 */

import { createPlexPin, getPlexAuthToken } from '@/lib/plex-auth'
import { actionClientIp, consume } from '@/lib/security/rate-limit'
import { RATE_LIMITED_MESSAGE } from '@/lib/security/rate-limit-messages'

jest.mock('@/lib/security/rate-limit', () => ({
  consume: jest.fn(),
  actionClientIp: jest.fn(),
}))

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const mockConsume = consume as jest.MockedFunction<typeof consume>
const mockActionClientIp = actionClientIp as jest.MockedFunction<typeof actionClientIp>
const mockFetch = jest.fn()

const CLIENT_IP = '203.0.113.7'
const RATE_LIMITED_RESULT = { success: false, code: 'RATE_LIMITED', error: RATE_LIMITED_MESSAGE }

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('Plex PIN actions', () => {
  const originalFetch = global.fetch
  const originalClientId = process.env.PLEX_CLIENT_IDENTIFIER

  beforeAll(() => {
    global.fetch = mockFetch as unknown as typeof fetch
    process.env.PLEX_CLIENT_IDENTIFIER = 'test-client-id'
  })

  afterAll(() => {
    global.fetch = originalFetch
    process.env.PLEX_CLIENT_IDENTIFIER = originalClientId
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockActionClientIp.mockResolvedValue(CLIENT_IP)
    mockConsume.mockResolvedValue({ ok: true })
  })

  describe('createPlexPin (plex:pin:create)', () => {
    it('spends the limit for the client IP and returns the PIN', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ id: 42, code: 'ABCD' }))

      await expect(createPlexPin()).resolves.toEqual({ success: true, data: { id: 42, code: 'ABCD' } })
      expect(mockConsume).toHaveBeenCalledWith('plex:pin:create', CLIENT_IP)
    })

    it('returns RATE_LIMITED without calling plex.tv when the limit is spent', async () => {
      mockConsume.mockResolvedValue({ ok: false, retryAfterSec: 120 })

      await expect(createPlexPin()).resolves.toEqual(RATE_LIMITED_RESULT)
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('getPlexAuthToken (plex:pin:poll)', () => {
    it('spends the limit for the client IP and returns the token once approved', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ id: 42, code: 'ABCD', authToken: 'plex-token' }))

      await expect(getPlexAuthToken('42')).resolves.toEqual({ success: true, authToken: 'plex-token' })
      expect(mockConsume).toHaveBeenCalledWith('plex:pin:poll', CLIENT_IP)
    })

    it('returns a null token while the PIN is not approved yet', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ id: 42, code: 'ABCD' }))

      await expect(getPlexAuthToken('42')).resolves.toEqual({ success: true, authToken: null })
    })

    it('returns RATE_LIMITED without calling plex.tv when the limit is spent', async () => {
      mockConsume.mockResolvedValue({ ok: false, retryAfterSec: 30 })

      await expect(getPlexAuthToken('42')).resolves.toEqual(RATE_LIMITED_RESULT)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it.each(['', '42/../../user', '42?strong=true', '-1', '1.5', '1234567890123'])(
      'refuses the PIN id %p without calling plex.tv',
      async (pinId) => {
        await expect(getPlexAuthToken(pinId)).resolves.toEqual({
          success: false,
          code: 'INVALID_PIN',
          error: expect.any(String),
        })
        expect(mockFetch).not.toHaveBeenCalled()
      }
    )
  })
})
