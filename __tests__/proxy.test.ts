/**
 * @jest-environment node
 */

/**
 * `/wrapped/<year>` with a year the route rejects (P0.14), and
 * `/wrapped/share/<token>` with a token that cannot exist (P0.11), get a real
 * 404 status. The routes render their own not-found pages, but
 * `app/loading.tsx` streams every page, so by then the status has already
 * gone out as 200.
 */

import { NextRequest } from 'next/server'

import { proxy } from '@/proxy'

// Keep the request context helpers; silence the per-request log line.
jest.mock('@/lib/utils/logger', () => ({
  ...jest.requireActual('@/lib/utils/logger'),
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

function request(path: string) {
  return new NextRequest(new URL(path, 'http://localhost:3000'))
}

describe('proxy /wrapped/<year> status', () => {
  it.each(['/wrapped/abc', '/wrapped/1999', '/wrapped/2101', '/wrapped/0x7EA', '/wrapped/2026.0', '/wrapped/20260', '/wrapped/share'])(
    'answers %s with a 404 and the same page',
    async (path) => {
      const response = await proxy(request(path))

      expect(response.status).toBe(404)
      expect(new URL(response.headers.get('x-middleware-rewrite') ?? '').pathname).toBe(path)
      expect(response.headers.get('X-Request-ID')).toBeTruthy()
    }
  )

  it.each([
    '/wrapped/share/bad-token',
    '/wrapped/share/some-token',
    `/wrapped/share/${'a'.repeat(42)}`,
    `/wrapped/share/${'a'.repeat(44)}`,
    `/wrapped/share/${'a'.repeat(42)}=`,
    `/wrapped/share/${'a'.repeat(40)}%2F`,
  ])('answers the malformed share path %s with a 404 and the same page (P0.11)', async (path) => {
    const response = await proxy(request(path))

    expect(response.status).toBe(404)
    expect(new URL(response.headers.get('x-middleware-rewrite') ?? '').pathname).toBe(path)
  })

  it.each([
    '/wrapped/2026',
    '/wrapped/2010',
    '/wrapped/2100',
    '/wrapped',
    '/wrapped/share/Kf-qkQFsJ4E6X_vMSKq1PiT624JyrVJtTNbepCgWYl8',
    '/',
    '/admin/users',
  ])(
    'passes %s through',
    async (path) => {
      const response = await proxy(request(path))

      expect(response.status).toBe(200)
      expect(response.headers.get('x-middleware-next')).toBe('1')
      expect(response.headers.get('x-middleware-rewrite')).toBeNull()
    }
  )
})
