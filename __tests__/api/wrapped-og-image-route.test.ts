/**
 * Tests for app/api/wrapped/og-image/route.tsx - wrapped OG image API route
 *
 * ImageResponse (satori) can't render in jsdom, so next/og is mocked and the
 * tests assert the element tree passed to it plus the route's guard behavior.
 */

import { GET } from '@/app/api/wrapped/og-image/route'
import { prisma } from '@/lib/prisma'
import { shareRateLimiter } from '@/lib/security/rate-limit'
import { NextRequest } from 'next/server'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    plexWrapped: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/lib/security/rate-limit', () => ({
  shareRateLimiter: jest.fn(),
}))

interface MockImageCall {
  element: unknown
  options: { width: number; height: number }
}

const imageCalls: MockImageCall[] = []

jest.mock('next/og', () => ({
  ImageResponse: class MockImageResponse {
    status = 200
    headers = new Map<string, string>()
    constructor(element: unknown, options: { width: number; height: number }) {
      imageCalls.push({ element, options })
    }
  },
}))

jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server')
  return {
    ...actual,
    NextRequest: class MockNextRequest {
      url: string
      nextUrl: URL
      method: string
      headers: Headers

      constructor(input: string | URL, init?: { headers?: Record<string, string>; method?: string }) {
        const url = typeof input === 'string' ? input : input.toString()
        this.url = url
        this.nextUrl = new URL(url)
        this.method = init?.method || 'GET'
        this.headers = new Headers(init?.headers || {})
      }
    },
    NextResponse: class MockNextResponse {
      body: unknown
      status: number
      headers: Map<string, string>

      constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
        this.body = body
        this.status = init?.status || 200
        this.headers = new Map(Object.entries(init?.headers || {}))
      }
    },
  }
})

/** Flatten the mocked JSX element tree into a searchable string */
function elementText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(elementText).join(' ')
  if (typeof node === 'object') {
    const el = node as { props?: { children?: unknown } & Record<string, unknown> }
    return elementText(el.props?.children) + ' ' + JSON.stringify(el.props ?? {})
  }
  return ''
}

function buildRequest(url: string): NextRequest {
  return new NextRequest(url)
}

describe('GET /api/wrapped/og-image', () => {
  const mockWrapped = {
    id: 'wrapped-1',
    year: 2026,
    shareToken: 'test-token',
    status: 'completed',
    summary: 'Test summary',
    archetype: 'The Midnight Marathoner',
    data: JSON.stringify({
      statistics: {
        totalWatchTime: { total: 2880 }, // 48 hours = 2 days
        moviesWatched: 10,
        showsWatched: 5,
      },
    }),
    user: {
      name: 'Test User',
      email: 'test@example.com',
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    imageCalls.length = 0
    ;(shareRateLimiter as jest.Mock).mockResolvedValue(null)
  })

  it('renders a 1200x630 OG image with archetype and stats', async () => {
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(mockWrapped)

    const response = await GET(buildRequest('http://localhost/api/wrapped/og-image?token=test-token'))

    expect(response.status).toBe(200)
    expect(imageCalls).toHaveLength(1)
    expect(imageCalls[0].options).toEqual({ width: 1200, height: 630 })
    const text = elementText(imageCalls[0].element)
    expect(text).toContain('Test User')
    expect(text).toContain('2026')
    expect(text).toContain('The Midnight Marathoner')
    expect(text).toContain('2 days')
  })

  it('renders a 1080x1920 story card when format=card', async () => {
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(mockWrapped)

    const response = await GET(
      buildRequest('http://localhost/api/wrapped/og-image?token=test-token&format=card')
    )

    expect(response.status).toBe(200)
    expect(imageCalls[0].options).toEqual({ width: 1080, height: 1920 })
    expect(elementText(imageCalls[0].element)).toContain('The Midnight Marathoner')
  })

  it('omits archetype billing when column is null (v1 wrappeds)', async () => {
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
      ...mockWrapped,
      archetype: null,
    })

    const response = await GET(buildRequest('http://localhost/api/wrapped/og-image?token=test-token'))

    expect(response.status).toBe(200)
    expect(elementText(imageCalls[0].element)).not.toContain('Midnight Marathoner')
  })

  it('returns 400 when token is missing', async () => {
    const response = await GET(buildRequest('http://localhost/api/wrapped/og-image'))
    const data = JSON.parse(response.body as string)

    expect(response.status).toBe(400)
    expect(data.code).toBe('VALIDATION_ERROR')
    expect(imageCalls).toHaveLength(0)
  })

  it('returns 404 when wrapped is not found', async () => {
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)

    const response = await GET(buildRequest('http://localhost/api/wrapped/og-image?token=nope'))

    expect(response.status).toBe(404)
    expect(response.body).toBe('Wrapped not found')
  })

  it('returns 404 when wrapped is not completed (same message, no enumeration)', async () => {
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
      ...mockWrapped,
      status: 'generating',
    })

    const response = await GET(buildRequest('http://localhost/api/wrapped/og-image?token=test-token'))

    expect(response.status).toBe(404)
    expect(response.body).toBe('Wrapped not found')
  })

  it('falls back to email then "Someone" for the display name', async () => {
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
      ...mockWrapped,
      user: { name: null, email: null },
    })

    const response = await GET(buildRequest('http://localhost/api/wrapped/og-image?token=test-token'))

    expect(response.status).toBe(200)
    expect(elementText(imageCalls[0].element)).toContain('Someone')
  })

  it('formats short watch times in hours', async () => {
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
      ...mockWrapped,
      data: JSON.stringify({
        statistics: { totalWatchTime: { total: 120 }, moviesWatched: 1, showsWatched: 1 },
      }),
    })

    await GET(buildRequest('http://localhost/api/wrapped/og-image?token=test-token'))

    expect(elementText(imageCalls[0].element)).toContain('2 hours')
  })

  it('handles missing statistics gracefully', async () => {
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
      ...mockWrapped,
      data: JSON.stringify({}),
    })

    const response = await GET(buildRequest('http://localhost/api/wrapped/og-image?token=test-token'))

    expect(response.status).toBe(200)
    expect(elementText(imageCalls[0].element)).toContain('0 hours')
  })

  it('short-circuits on rate limit', async () => {
    const mockRateLimitResponse = { status: 429 }
    ;(shareRateLimiter as jest.Mock).mockResolvedValue(mockRateLimitResponse)

    const response = await GET(buildRequest('http://localhost/api/wrapped/og-image?token=test-token'))

    expect(response).toBe(mockRateLimitResponse)
    expect(prisma.plexWrapped.findUnique).not.toHaveBeenCalled()
  })

  it('handles database errors gracefully', async () => {
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'))
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

    const response = await GET(buildRequest('http://localhost/api/wrapped/og-image?token=test-token'))
    const data = JSON.parse(response.body as string)

    expect(response.status).toBe(500)
    expect(data.error).toContain('Failed to generate image')
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
})
