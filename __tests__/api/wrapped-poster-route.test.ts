/**
 * Tests for app/api/wrapped/poster/[ratingKey]/route.ts - poster proxy route
 */

import { GET } from '@/app/api/wrapped/poster/[ratingKey]/route'
import { prisma } from '@/lib/prisma'
import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout'
import { getServerSession } from 'next-auth'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    plexWrapped: {
      findUnique: jest.fn(),
    },
    plexServer: {
      findFirst: jest.fn(),
    },
  },
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/security/rate-limit', () => ({
  posterRateLimiter: jest.fn().mockResolvedValue(null),
}))

jest.mock('@/lib/utils/fetch-with-timeout', () => ({
  fetchWithTimeout: jest.fn(),
}))

jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server')
  class MockNextResponse {
    body: unknown
    status: number
    headers: Headers

    constructor(body?: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body
      this.status = init?.status || 200
      this.headers = new Headers(init?.headers || {})
    }

    static json(data: unknown, init?: { status?: number }) {
      return {
        json: () => Promise.resolve(data),
        status: init?.status || 200,
      }
    }
  }
  return {
    ...actual,
    NextRequest: class MockNextRequest {
      nextUrl: URL
      method: string
      headers: Headers

      constructor(input: string | URL, init?: { headers?: Record<string, string>; method?: string }) {
        const url = typeof input === 'string' ? new URL(input) : input
        this.nextUrl = url
        this.method = init?.method || 'GET'
        this.headers = new Headers(init?.headers || {})
      }
    },
    NextResponse: MockNextResponse,
  }
})

const PLEX_SERVER = { url: 'http://plex.local:32400', token: 'server-token', isActive: true }

async function callRoute(url: string, ratingKey: string) {
  const { NextRequest } = await import('next/server')
  const request = new NextRequest(url)
  return GET(request as never, { params: Promise.resolve({ ratingKey }) })
}

function mockUpstreamImage() {
  ;(fetchWithTimeout as jest.Mock).mockResolvedValue({
    ok: true,
    headers: new Headers({ 'content-type': 'image/jpeg' }),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  })
}

describe('GET /api/wrapped/poster/[ratingKey]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(PLEX_SERVER)
  })

  it('rejects a non-numeric rating key', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'u1' } })

    const response = await callRoute('http://localhost/api/wrapped/poster/abc', '../secrets')

    expect(response.status).toBe(400)
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated requests without a share token', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(null)

    const response = await callRoute('http://localhost/api/wrapped/poster/123', '123')

    expect(response.status).toBe(401)
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('serves the poster for an authenticated session', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'u1' } })
    mockUpstreamImage()

    const response = await callRoute('http://localhost/api/wrapped/poster/123', '123')

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    expect(response.headers.get('Cache-Control')).toContain('max-age=86400')

    // The Plex token goes upstream as a header, never into the URL
    const [url, init] = (fetchWithTimeout as jest.Mock).mock.calls[0]
    expect(url).toContain('/photo/:/transcode')
    expect(url).toContain(encodeURIComponent('/library/metadata/123/thumb'))
    expect(url).not.toContain('server-token')
    expect(init.headers['X-Plex-Token']).toBe('server-token')
  })

  it('allows a share token whose wrapped includes the rating key', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
      status: 'completed',
      data: JSON.stringify({
        statistics: {
          topMovies: [{ title: 'Dune', ratingKey: '123' }],
          topShows: [],
        },
      }),
    })
    mockUpstreamImage()

    const response = await callRoute(
      'http://localhost/api/wrapped/poster/123?share=tok',
      '123'
    )

    expect(response.status).toBe(200)
    expect(prisma.plexWrapped.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shareToken: 'tok' } })
    )
  })

  it('rejects a share token for a rating key outside the wrapped (no library enumeration)', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
      status: 'completed',
      data: JSON.stringify({
        statistics: {
          topMovies: [{ title: 'Dune', ratingKey: '123' }],
          topShows: [],
        },
      }),
    })

    const response = await callRoute(
      'http://localhost/api/wrapped/poster/999?share=tok',
      '999'
    )

    expect(response.status).toBe(401)
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('rejects a share token for an incomplete wrapped', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
      status: 'generating',
      data: '{}',
    })

    const response = await callRoute(
      'http://localhost/api/wrapped/poster/123?share=tok',
      '123'
    )

    expect(response.status).toBe(401)
  })

  it('returns 404 when no Plex server is configured', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'u1' } })
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(null)

    const response = await callRoute('http://localhost/api/wrapped/poster/123', '123')

    expect(response.status).toBe(404)
  })

  it('returns 404 when Plex cannot produce the image', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'u1' } })
    ;(fetchWithTimeout as jest.Mock).mockResolvedValue({ ok: false, status: 404 })

    const response = await callRoute('http://localhost/api/wrapped/poster/123', '123')

    expect(response.status).toBe(404)
  })
})
