/**
 * @jest-environment node
 */

/**
 * `/rewind/<year>` with a year the route rejects (P0.14) gets a real 404
 * status. The route renders its own not-found page, but `app/loading.tsx`
 * streams every page, so by then the status has already gone out as 200.
 * The share page's statuses are in `__tests__/proxy-share.test.ts` (P7.5).
 *
 * P4.5: it sends a lapsed member to /subscribe from every `(app)` page but the
 * read-only Rewind pages, on every request (client-side navigations
 * included), and forwards the pathname as `x-pm-pathname`.
 */

import { readdirSync } from 'node:fs'
import path from 'node:path'

import { getToken } from 'next-auth/jwt'
import { NextRequest } from 'next/server'

import { getAccessLevel } from '@/lib/access'
import { isMemberAppPath } from '@/lib/access-paths'
import { prisma } from '@/lib/prisma'
import { consume } from '@/lib/security/rate-limit'
import { config as proxyConfig, proxy } from '@/proxy'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

const mockLogError = jest.fn()
const mockLogDebug = jest.fn()
const mockLogInfo = jest.fn()

// Keep the request context helpers; record the per-request log line.
jest.mock('@/lib/utils/logger', () => ({
  ...jest.requireActual('@/lib/utils/logger'),
  createLogger: () => ({
    debug: (...args: unknown[]) => mockLogDebug(...args),
    info: (...args: unknown[]) => mockLogInfo(...args),
    warn: jest.fn(),
    error: (...args: unknown[]) => mockLogError(...args),
  }),
}))

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock('@/lib/security/rate-limit', () => ({
  consume: jest.fn(),
}))

jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }))
jest.mock('@/lib/access', () => ({ getAccessLevel: jest.fn() }))

const mockGetToken = jest.mocked(getToken)
const mockGetAccessLevel = jest.mocked(getAccessLevel)

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
  mockGetToken.mockResolvedValue(null)
  mockConsume.mockResolvedValue({ ok: true })
  mockFindUnique.mockImplementation(async ({ where }: { where: { shareToken: string } }) =>
    where.shareToken === TOKEN ? { status: 'completed' } : null
  )
})

describe('proxy /rewind/<year> status', () => {
  it.each(['/rewind/abc', '/rewind/1999', '/rewind/2101', '/rewind/0x7EA', '/rewind/2026.0', '/rewind/20260', '/rewind/s'])(
    'answers %s with a 404 and the same page',
    async (path) => {
      expectNotFoundRewrite(await proxy(request(path)), path)
    }
  )

  it.each(['/rewind/2026', '/rewind/2010', '/rewind/2100', '/rewind', '/', '/admin/users'])(
    'passes %s through',
    async (path) => {
      expectPassedThrough(await proxy(request(path)))
      expect(mockFindUnique).not.toHaveBeenCalled()
      expect(mockConsume).not.toHaveBeenCalled()
    }
  )
})

describe('proxy request log (P4.16)', () => {
  it('logs the method, the masked pathname and allow-listed query keys at debug', async () => {
    await proxy(
      request(`/rewind/s/${TOKEN}?year=2026&tab=stats&code=oauth-code&state=oauth-state`, {
        'x-forwarded-for': '203.0.113.7',
      })
    )

    expect(mockLogInfo).not.toHaveBeenCalled()
    expect(mockLogDebug).toHaveBeenCalledTimes(1)
    const [message, metadata] = mockLogDebug.mock.calls[0]
    expect(message).toBe('Incoming request')
    expect(metadata).toEqual({
      method: 'GET',
      pathname: '/rewind/s/[masked]',
      query: { year: '2026', tab: 'stats' },
    })
    expect(metadata).not.toHaveProperty('searchParams')
    expect(JSON.stringify(metadata)).not.toMatch(/203\.0\.113|oauth-|Kf-qkQ/)
  })

  it('masks the invite code and leaves out the query when no key is allowed', async () => {
    await proxy(request('/invite/ABCD2345?inviteCode=ABCD2345'))

    expect(mockLogDebug).toHaveBeenCalledWith('Incoming request', { method: 'GET', pathname: '/invite/[masked]' })
  })

  it('does not log the health check the image polls, and passes it through (P4.17)', async () => {
    expectPassedThrough(await proxy(request('/api/health?probe=live')))

    expect(mockLogDebug).not.toHaveBeenCalled()
  })
})

describe('proxy x-pm-pathname header (P4.5)', () => {
  it.each(['/', '/rewind/2026', `/rewind/s/${TOKEN}`, '/admin/users'])(
    'forwards the pathname of %s to the page',
    async (path) => {
      const response = await proxy(request(path))

      expect(forwardedHeader(response, 'x-pm-pathname')).toBe(path)
    }
  )

  it('replaces a value the client sent', async () => {
    const response = await proxy(request('/', { 'x-pm-pathname': '/rewind/2026' }))

    expect(forwardedHeader(response, 'x-pm-pathname')).toBe('/')
  })

  it('forwards it on a 404 rewrite too', async () => {
    const response = await proxy(request('/rewind/abc'))

    expect(response.status).toBe(404)
    expect(forwardedHeader(response, 'x-pm-pathname')).toBe('/rewind/abc')
  })
})

describe('proxy lapsed-member redirect (P4.5, FR-51)', () => {
  function signedIn(accessLevel: 'full' | 'lapsed' | 'none' | undefined, current = accessLevel) {
    mockGetToken.mockResolvedValue({ sub: 'member-1', isAdmin: false, accessLevel })
    if (current) mockGetAccessLevel.mockResolvedValue(current)
  }

  function expectSubscribeRedirect(response: Response) {
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/subscribe')
    expect(response.headers.get('X-Request-ID')).toBeTruthy()
  }

  it.each(['/', '/announcements', '/discord/link', '/discord/connect'])(
    'sends a lapsed member from %s to /subscribe',
    async (path) => {
      signedIn('lapsed')

      expectSubscribeRedirect(await proxy(request(path)))
      expect(mockGetAccessLevel).toHaveBeenCalledWith('member-1')
    }
  )

  it.each([
    ['an RSC navigation', { RSC: '1' }],
    ['a prefetch', { RSC: '1', 'Next-Router-Prefetch': '1' }],
  ])('sends a lapsed member home through %s to /subscribe', async (_kind, headers) => {
    signedIn('lapsed')

    expectSubscribeRedirect(await proxy(request('/?from=/', headers)))
  })

  it.each(['/rewind/2026', '/rewind', '/rewind/2025'])('lets a lapsed member open %s', async (path) => {
    signedIn('lapsed')

    expectPassedThrough(await proxy(request(path)))
  })

  it.each(['/rewind/2026', '/rewind', '/'])('sends a member with no access from %s', async (path) => {
    signedIn('none')

    expectSubscribeRedirect(await proxy(request(path)))
  })

  it.each(['/subscribe', '/admin/users', '/api/wrapped/poster/1', '/api/health', '/auth/denied', `/rewind/s/${TOKEN}`, '/robots.txt'])(
    'leaves %s alone, whatever the level',
    async (path) => {
      signedIn('none')

      const response = await proxy(request(path))

      expect(response.status).not.toBe(307)
      expect(mockGetToken).not.toHaveBeenCalled()
    }
  )

  it('leaves a Server Action POST to the action, which checks entitlement itself', async () => {
    signedIn('lapsed')

    const response = await proxy(new NextRequest(new URL('/', 'http://localhost:3000'), { method: 'POST' }))

    expect(response.status).not.toBe(307)
    expect(mockGetToken).not.toHaveBeenCalled()
  })

  it('trusts a full claim without a query', async () => {
    signedIn('full')

    expectPassedThrough(await proxy(request('/')))
    expect(mockGetAccessLevel).not.toHaveBeenCalled()
  })

  it('confirms a lapsed claim from the database, so a member who renewed stays', async () => {
    signedIn('lapsed', 'full')

    expectPassedThrough(await proxy(request('/')))
  })

  it('decides nothing for a token without the claim, or without a session', async () => {
    signedIn(undefined)
    expectPassedThrough(await proxy(request('/')))

    mockGetToken.mockResolvedValue(null)
    expectPassedThrough(await proxy(request('/')))

    expect(mockGetAccessLevel).not.toHaveBeenCalled()
  })

  it('lets the request through when the check fails, so the layout decides', async () => {
    signedIn('lapsed')
    const error = new Error('Database unavailable')
    mockGetAccessLevel.mockRejectedValue(error)

    expectPassedThrough(await proxy(request('/')))
    expect(mockLogError).toHaveBeenCalledWith('Access level check failed', error)
  })
})

describe('proxy coverage of the route folders (P4.5)', () => {
  const APP_DIR = path.join(__dirname, '..', 'app')

  /** The URL of every page and route under `dir`, with each group noted. */
  function routes(dir: string, segments: string[] = [], group: string | null = null): Array<{ url: string; group: string | null }> {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.isFile()) {
        return /^(page|route)\.tsx?$/.test(entry.name) ? [{ url: `/${segments.join('/')}`, group }] : []
      }
      const name = entry.name
      if (name.startsWith('_') || name === '__tests__') return []
      const child = path.join(dir, name)
      if (/^\(.+\)$/.test(name)) return routes(child, segments, group ?? name)
      const segment = name.startsWith('[...') ? 'a/b' : name.startsWith('[') ? '2026' : name
      return routes(child, [...segments, segment], group)
    })
  }

  const all = routes(APP_DIR)
  const matcher = new RegExp(`^${proxyConfig.matcher[0]}$`)

  it('finds the (app) routes', () => {
    expect(all.filter((route) => route.group === '(app)').map((route) => route.url)).toEqual(
      expect.arrayContaining(['/', '/rewind', '/rewind/2026', '/discord/link'])
    )
  })

  it.each(all.filter((route) => route.group === '(app)').map((route) => route.url))(
    'matches the (app) route %s and treats it as a member page',
    (url) => {
      expect(matcher.test(url)).toBe(true)
      expect(isMemberAppPath(url)).toBe(true)
    }
  )

  it.each(all.filter((route) => route.group !== '(app)').map((route) => route.url))(
    'treats %s, outside (app), as no member page',
    (url) => {
      expect(isMemberAppPath(url)).toBe(false)
    }
  )
})
