/**
 * @jest-environment node
 */

/**
 * The CSP report endpoint (P11.20): both report formats are logged as
 * `csp.violation` with the directive, the blocked origin and the masked path;
 * a body over 8 KB gets 413; the per-address limiter applies (the real one on
 * its in-process store, since jest.setup.js clears REDIS_URL); and nothing
 * touches the database.
 */

import { NextRequest } from 'next/server'

import { POST } from '@/app/api/csp-report/route'
import { LIMITS } from '@/lib/security/rate-limit-config'

// Any read of the client counts as a database call
const mockPrismaAccess = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: new Proxy({}, { get: (_target, key) => mockPrismaAccess(key) }),
}))

const mockWarn = jest.fn()
jest.mock('@/lib/utils/logger', () => ({
  ...jest.requireActual('@/lib/utils/logger'),
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args), error: jest.fn() }),
}))

let ipCounter = 0

/** Each test reports from its own address, so the limiter's counts never mix. */
function freshIp(): string {
  ipCounter += 1
  return `198.51.100.${ipCounter}`
}

function report(body: string, contentType: string, ip: string = freshIp()) {
  return POST(
    new NextRequest('http://localhost/api/csp-report', {
      method: 'POST',
      body,
      headers: { 'content-type': contentType, 'x-forwarded-for': ip },
    })
  )
}

const SHARE_TOKEN = 'Kf-qkQFsJ4E6X_vMSKq1PiT624JyrVJtTNbepCgWYl8'

const legacy = JSON.stringify({
  'csp-report': {
    'document-uri': `https://plex.example.com/rewind/s/${SHARE_TOKEN}?utm=x`,
    'violated-directive': 'script-src-elem',
    'effective-directive': 'script-src-elem',
    'blocked-uri': 'https://evil.example/x.js?k=secret',
    disposition: 'enforce',
  },
})

const reporting = JSON.stringify([
  {
    type: 'csp-violation',
    url: 'https://plex.example.com/admin',
    body: { documentURL: 'https://plex.example.com/admin?tab=x', effectiveDirective: 'script-src', blockedURL: 'inline', disposition: 'report' },
  },
  { type: 'deprecation', body: { id: 'x' } },
])

beforeEach(() => {
  mockWarn.mockReset()
})

afterEach(() => {
  expect(mockPrismaAccess).not.toHaveBeenCalled()
})

describe('POST /api/csp-report', () => {
  it('logs an application/csp-report body with the origin and the masked path, and answers 204', async () => {
    const response = await report(legacy, 'application/csp-report')

    expect(response.status).toBe(204)
    expect(mockWarn).toHaveBeenCalledWith('csp.violation', {
      directive: 'script-src-elem',
      blocked: 'https://evil.example',
      documentPath: '/rewind/s/[masked]',
      disposition: 'enforce',
    })
    expect(JSON.stringify(mockWarn.mock.calls)).not.toMatch(/secret|utm|Kf-qkQ/)
  })

  it('logs each csp-violation of an application/reports+json body', async () => {
    const response = await report(reporting, 'application/reports+json; charset=utf-8')

    expect(response.status).toBe(204)
    expect(mockWarn).toHaveBeenCalledTimes(1)
    expect(mockWarn).toHaveBeenCalledWith('csp.violation', {
      directive: 'script-src',
      blocked: 'inline',
      documentPath: '/admin',
      disposition: 'report',
    })
  })

  it('answers 413 for a body over 8 KB without logging it', async () => {
    const response = await report(JSON.stringify({ 'csp-report': { 'document-uri': 'x'.repeat(9000) } }), 'application/csp-report')

    expect(response.status).toBe(413)
    expect(mockWarn).not.toHaveBeenCalled()
  })

  it('answers 415 for another content type and 400 for a body that is not a report', async () => {
    expect((await report(legacy, 'application/json')).status).toBe(415)
    expect((await report('not json', 'application/csp-report')).status).toBe(400)
    expect((await report('{"x":1}', 'application/reports+json')).status).toBe(400)
    expect(mockWarn).not.toHaveBeenCalled()
  })

  it('rate-limits each address', async () => {
    const ip = freshIp()
    const { points } = LIMITS['csp-report']
    for (let i = 0; i < points; i += 1) {
      expect((await report(legacy, 'application/csp-report', ip)).status).toBe(204)
    }

    const limited = await report(legacy, 'application/csp-report', ip)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBeTruthy()
    expect((await report(legacy, 'application/csp-report')).status).toBe(204)
  })
})
