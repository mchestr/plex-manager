/**
 * @jest-environment node
 */

/**
 * The strict CSP the proxy sends (P11.20): a fresh nonce per request, on the
 * response and on the forwarded request (where Next reads it), no
 * 'unsafe-eval' outside development, report-only behind CSP_REPORT_ONLY, and
 * HSTS only for an https NEXTAUTH_URL. The request id is still set.
 */

import { getToken } from 'next-auth/jwt'
import { NextRequest } from 'next/server'

import { consume } from '@/lib/security/rate-limit'
import { proxy } from '@/proxy'

jest.mock('@/lib/utils/logger', () => ({
  ...jest.requireActual('@/lib/utils/logger'),
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/security/rate-limit', () => ({ consume: jest.fn() }))
jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }))
jest.mock('@/lib/access', () => ({ getAccessLevel: jest.fn() }))
// getEnv memoises outside NODE_ENV=test, which the development case sets
jest.mock('@/lib/env', () => {
  const actual = jest.requireActual('@/lib/env')
  return { ...actual, getEnv: () => actual.envSchema.parse(process.env) }
})

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, 'http://localhost:3000'), { headers })
}

function directives(policy: string | null): Map<string, string[]> {
  return new Map(
    (policy ?? '')
      .split(';')
      .map((directive) => directive.trim().split(/\s+/))
      .filter((tokens) => tokens[0] !== '')
      .map(([name, ...sources]) => [name, sources])
  )
}

function nonceOf(policy: string | null): string | undefined {
  return /'nonce-([^']+)'/.exec(policy ?? '')?.[1]
}

const env = process.env as Record<string, string | undefined>
const saved = new Map<string, string | undefined>()

/** Sets a variable for one test; afterEach puts the old value back. */
function setEnv(name: string, value: string) {
  if (!saved.has(name)) saved.set(name, env[name])
  env[name] = value
}

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete env[name]
    else env[name] = value
  }
  saved.clear()
})

beforeEach(() => {
  jest.mocked(getToken).mockResolvedValue(null)
  jest.mocked(consume).mockResolvedValue({ ok: true })
})

describe('proxy Content-Security-Policy (P11.20)', () => {
  it('gives each request its own nonce, on the response and the forwarded request', async () => {
    const first = await proxy(request('/'))
    const second = await proxy(request('/'))
    const policy = first.headers.get('Content-Security-Policy')
    const nonce = nonceOf(policy)

    expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(nonceOf(second.headers.get('Content-Security-Policy'))).not.toBe(nonce)
    expect(first.headers.get('x-middleware-request-x-nonce')).toBe(nonce)
    expect(first.headers.get('x-middleware-request-content-security-policy')).toBe(policy)
    expect(directives(policy).get('script-src')).toEqual(["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"])
  })

  it('replaces a nonce or policy the client sent', async () => {
    const response = await proxy(request('/', { 'x-nonce': 'forged', 'content-security-policy': "script-src 'nonce-forged'" }))
    const nonce = nonceOf(response.headers.get('Content-Security-Policy'))

    expect(response.headers.get('x-middleware-request-x-nonce')).toBe(nonce)
    expect(response.headers.get('x-middleware-request-content-security-policy')).not.toContain('forged')
  })

  it('sends the strict directives and the reporting endpoint', async () => {
    const response = await proxy(request('/'))
    const policy = directives(response.headers.get('Content-Security-Policy'))

    expect(policy.get('object-src')).toEqual(["'none'"])
    expect(policy.get('base-uri')).toEqual(["'self'"])
    expect(policy.get('frame-ancestors')).toEqual(["'self'"])
    expect(policy.get('connect-src')).toEqual(["'self'"])
    expect(policy.get('form-action')).toEqual(["'self'", 'https://checkout.stripe.com', 'https://billing.stripe.com'])
    expect(policy.get('report-uri')).toEqual(['/api/csp-report'])
    expect(policy.get('report-to')).toEqual(['csp'])
    expect(response.headers.get('Reporting-Endpoints')).toBe('csp="/api/csp-report"')
  })

  it("has no 'unsafe-eval' or ws: outside development, and both in development", async () => {
    const production = directives((await proxy(request('/'))).headers.get('Content-Security-Policy'))
    expect([...production.values()].flat()).not.toContain("'unsafe-eval'")
    expect(production.get('connect-src')).not.toContain('ws:')

    jest.replaceProperty(process.env, 'NODE_ENV', 'development')
    const development = directives((await proxy(request('/'))).headers.get('Content-Security-Policy'))
    expect(development.get('script-src')).toContain("'unsafe-eval'")
    expect(development.get('connect-src')).toContain('ws:')
  })

  it('goes out report-only with CSP_REPORT_ONLY=true, and the nonce still reaches the page', async () => {
    setEnv('CSP_REPORT_ONLY', 'true')

    const response = await proxy(request('/'))
    const policy = response.headers.get('Content-Security-Policy-Report-Only')

    expect(response.headers.get('Content-Security-Policy')).toBeNull()
    expect(nonceOf(policy)).toBe(response.headers.get('x-middleware-request-x-nonce'))
    expect(response.headers.get('x-middleware-request-content-security-policy-report-only')).toBe(policy)
  })

  it('is on every response the proxy answers itself', async () => {
    setEnv('PROCESS_ROLE', 'worker')

    const response = await proxy(request('/'))

    expect(response.status).toBe(404)
    expect(nonceOf(response.headers.get('Content-Security-Policy'))).toBeTruthy()
  })

  it('keeps the request id', async () => {
    const response = await proxy(request('/', { 'x-request-id': 'req-abcdef12' }))

    expect(response.headers.get('X-Request-ID')).toBe('req-abcdef12')
    expect(response.headers.get('x-middleware-request-x-request-id')).toBe('req-abcdef12')
  })
})

describe('proxy HSTS and upgrade-insecure-requests (P11.20)', () => {
  it('sends neither over http', async () => {
    setEnv('NEXTAUTH_URL', 'http://localhost:3000')

    const response = await proxy(request('/'))

    expect(response.headers.get('Strict-Transport-Security')).toBeNull()
    expect(directives(response.headers.get('Content-Security-Policy')).has('upgrade-insecure-requests')).toBe(false)
  })

  it('sends one year without includeSubDomains or preload by default over https', async () => {
    setEnv('NEXTAUTH_URL', 'https://plex.example.com')

    const response = await proxy(request('/'))

    expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=31536000')
    expect(directives(response.headers.get('Content-Security-Policy')).has('upgrade-insecure-requests')).toBe(true)
  })

  it('takes the max-age and the opt-in flags from the environment', async () => {
    setEnv('NEXTAUTH_URL', 'https://plex.example.com')
    setEnv('HSTS_MAX_AGE', '600')
    setEnv('HSTS_INCLUDE_SUBDOMAINS', 'true')
    setEnv('HSTS_PRELOAD', 'true')

    const response = await proxy(request('/'))

    expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=600; includeSubDomains; preload')
  })
})
