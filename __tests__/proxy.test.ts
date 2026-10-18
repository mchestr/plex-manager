/**
 * @jest-environment node
 */

/**
 * `/wrapped/<year>` with a year the route rejects (P0.14), and
 * `/wrapped/share/<token>` with a token that shares nothing (P0.11), get a
 * real 404 status. The routes render their own not-found pages, but
 * `app/loading.tsx` streams every page, so by then the status has already
 * gone out as 200.
 *
 * The proxy also spends the share-page visitor's `rw:share-page` point before
 * its lookup, and marks a visitor over the limit busy for the page.
 */

import { NextRequest } from 'next/server'

import { prisma } from '@/lib/prisma'
import { consume } from '@/lib/security/rate-limit'
import { proxy } from '@/proxy'

const mockLogError = jest.fn()

// Keep the request context helpers; silence the per-request log line.
jest.mock('@/lib/utils/logger', () => ({
  ...jest.requireActual('@/lib/utils/logger'),
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: (...args: unknown[]) => mockLogError(...args),
  }),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: { plexWrapped: { findUnique: jest.fn() } },
}))

jest.mock('@/lib/security/rate-limit', () => ({
  consume: jest.fn(),
}))

const mockFindUnique = prisma.plexWrapped.findUnique as jest.Mock
const mockConsume = consume as jest.Mock

/** A token of the shape `generateShareToken` makes. */
const TOKEN = 'Kf-qkQFsJ4E6X_vMSKq1PiT624JyrVJtTNbepCgWYl8'

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, 'http://localhost:3000'), { headers })
}

/** The value of request header `name` the proxy hands to the page, if it overrides headers. */
function forwardedHeader(response: Response, name: string): string | null {
  return response.headers.get(`x-middleware-request-${name}`)
}

function expectNotFoundRewrite(response: Response, path: string) {
  expect(response.status).toBe(404)
  expect(new URL(response.headers.get('x-middleware-rewrite') ?? '').pathname).toBe(path)
  expect(response.headers.get('X-Request-ID')).toBeTruthy()
}

function expectPassedThrough(response: Response) {
  expect(response.status).toBe(200)
  expect(response.headers.get('x-middleware-next')).toBe('1')
  expect(response.headers.get('x-middleware-rewrite')).toBeNull()
}

beforeEach(() => {
  jest.clearAllMocks()
  mockConsume.mockResolvedValue({ ok: true })
  mockFindUnique.mockImplementation(async ({ where }: { where: { shareToken: string } }) =>
    where.shareToken === TOKEN ? { status: 'completed' } : null
  )
})

describe('proxy /wrapped/<year> status', () => {
  it.each(['/wrapped/abc', '/wrapped/1999', '/wrapped/2101', '/wrapped/0x7EA', '/wrapped/2026.0', '/wrapped/20260', '/wrapped/share'])(
    'answers %s with a 404 and the same page',
    async (path) => {
      expectNotFoundRewrite(await proxy(request(path)), path)
    }
  )

  it.each(['/wrapped/2026', '/wrapped/2010', '/wrapped/2100', '/wrapped', '/', '/admin/users'])(
    'passes %s through',
    async (path) => {
      expectPassedThrough(await proxy(request(path)))
      expect(mockFindUnique).not.toHaveBeenCalled()
      expect(mockConsume).not.toHaveBeenCalled()
    }
  )
})

describe('proxy /wrapped/share/<token> status (P0.11)', () => {
  it.each([
    '/wrapped/share/bad-token',
    '/wrapped/share/some-token',
    `/wrapped/share/${'a'.repeat(42)}`,
    `/wrapped/share/${'a'.repeat(44)}`,
    `/wrapped/share/${'a'.repeat(42)}=`,
    `/wrapped/share/${'a'.repeat(40)}%2F`,
    // Not valid percent-encoding, so it is no token at all.
    `/wrapped/share/${'a'.repeat(40)}%E0%A4%A`,
  ])('answers the malformed share path %s with a 404 and no database call', async (path) => {
    expectNotFoundRewrite(await proxy(request(path)), path)
    expect(mockFindUnique).not.toHaveBeenCalled()
    expect(mockConsume).not.toHaveBeenCalled()
  })

  it('passes a token that shares a completed Rewind through, after reading only its status', async () => {
    expectPassedThrough(await proxy(request(`/wrapped/share/${TOKEN}`)))

    expect(mockFindUnique).toHaveBeenCalledTimes(1)
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { shareToken: TOKEN }, select: { status: true } })
  })

  it('decodes the segment as the page does, so an encoded valid token passes through', async () => {
    // %4B is "K", the token's first character.
    const encoded = `%4B${TOKEN.slice(1)}`

    expectPassedThrough(await proxy(request(`/wrapped/share/${encoded}`)))
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { shareToken: TOKEN }, select: { status: true } })
  })

  it('answers an unknown or revoked token with a 404 and the same page', async () => {
    const path = '/wrapped/share/vZ2bLJpJkqoegfJ4-9rodbBNhGs3XZ-sdNzNXJC96wI'

    expectNotFoundRewrite(await proxy(request(path)), path)
    expect(mockFindUnique).toHaveBeenCalledTimes(1)
  })

  it.each(['generating', 'failed'])('answers a token whose Rewind is %s with a 404', async (status) => {
    mockFindUnique.mockResolvedValue({ status })
    const path = `/wrapped/share/${TOKEN}`

    expectNotFoundRewrite(await proxy(request(path)), path)
  })

  it("spends the visitor's rw:share-page point, keyed by the trusted proxy's entry, before the lookup", async () => {
    const response = await proxy(
      request(`/wrapped/share/${TOKEN}`, { 'x-forwarded-for': '10.0.0.1, 203.0.113.7' })
    )

    expectPassedThrough(response)
    expect(mockConsume).toHaveBeenCalledWith('rw:share-page', '203.0.113.7')
    expect(mockConsume.mock.invocationCallOrder[0]).toBeLessThan(mockFindUnique.mock.invocationCallOrder[0])
    expect(forwardedHeader(response, 'x-rewind-share-busy')).toBeNull()
  })

  it('marks a visitor over the limit busy for the page, without a lookup', async () => {
    mockConsume.mockResolvedValue({ ok: false, retryAfterSec: 30 })

    const response = await proxy(request('/wrapped/share/vZ2bLJpJkqoegfJ4-9rodbBNhGs3XZ-sdNzNXJC96wI'))

    expectPassedThrough(response)
    expect(forwardedHeader(response, 'x-rewind-share-busy')).toBe('1')
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it('drops a busy header the client sent', async () => {
    const response = await proxy(request(`/wrapped/share/${TOKEN}`, { 'x-rewind-share-busy': '1' }))

    expectPassedThrough(response)
    expect(response.headers.get('x-middleware-override-headers')).not.toContain('x-rewind-share-busy')
    expect(forwardedHeader(response, 'x-rewind-share-busy')).toBeNull()
  })

  it('looks the token up when the limiter fails', async () => {
    const error = new Error('limiter down')
    mockConsume.mockRejectedValue(error)

    expectPassedThrough(await proxy(request(`/wrapped/share/${TOKEN}`)))
    expect(mockFindUnique).toHaveBeenCalledTimes(1)
    expect(mockLogError).toHaveBeenCalledWith('Share page rate limit failed', error)
  })

  it('lets the request through when the lookup fails, so the page reports the error', async () => {
    const error = new Error('Database unavailable')
    mockFindUnique.mockRejectedValue(error)

    expectPassedThrough(await proxy(request(`/wrapped/share/${TOKEN}`)))
    expect(mockLogError).toHaveBeenCalledWith('Share token lookup failed', error)
  })
})
