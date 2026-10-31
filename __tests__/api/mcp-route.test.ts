/**
 * @jest-environment node
 */

/**
 * app/api/mcp/route.ts: a bearer token of an enabled admin, a browser Origin
 * only from this app, a per-token limit, JSON-RPC in, JSON out, and 202 for
 * a notification. The protocol itself is lib/mcp/__tests__/server.test.ts.
 */

import { NextRequest } from 'next/server'

import { DELETE, GET, POST } from '@/app/api/mcp/route'
import { handleMessage } from '@/lib/mcp/server'
import { authenticateToken } from '@/lib/mcp/tokens'
import { consume } from '@/lib/security/rate-limit'

jest.mock('@/lib/mcp/server', () => ({
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  rpcError: (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } }),
  handleMessage: jest.fn(),
}))
jest.mock('@/lib/mcp/tokens', () => ({
  ...jest.requireActual('@/lib/mcp/tokens'),
  authenticateToken: jest.fn(),
}))
jest.mock('@/lib/security/rate-limit', () => ({ consume: jest.fn() }))
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), getBaseUrl: () => 'https://plex.example.com' }))
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

const TOKEN = `pmk_${'a'.repeat(43)}`
const principal = { tokenId: 'tok-1', session: { user: { id: 'admin-1', isAdmin: true }, expires: '' } }

function post(body: string, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest('https://plex.example.com/api/mcp', {
      method: 'POST',
      body,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...headers },
    })
  )
}

const ping = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(authenticateToken).mockResolvedValue(principal)
  jest.mocked(consume).mockResolvedValue({ ok: true })
  jest.mocked(handleMessage).mockResolvedValue({ jsonrpc: '2.0', id: 1, result: {} })
})

it('answers a message with its JSON-RPC response', async () => {
  const response = await post(ping)
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.json()).toEqual({ jsonrpc: '2.0', id: 1, result: {} })
  expect(handleMessage).toHaveBeenCalledWith({ jsonrpc: '2.0', id: 1, method: 'ping' }, principal, expect.any(String))
  expect(consume).toHaveBeenCalledWith('mcp', 'tok-1')
})

it('answers a notification with 202 and no body', async () => {
  jest.mocked(handleMessage).mockResolvedValue(null)
  const response = await post(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }))
  expect(response.status).toBe(202)
  expect(await response.text()).toBe('')
})

it.each([
  ['no header', {}],
  ['another scheme', { Authorization: `Basic ${TOKEN}` }],
  ['a malformed token', { Authorization: 'Bearer pmk_short' }],
])('refuses %s with 401 before any lookup', async (_label, headers) => {
  const request = new NextRequest('https://plex.example.com/api/mcp', { method: 'POST', body: ping, headers })
  const response = await POST(request)
  expect(response.status).toBe(401)
  expect(response.headers.get('www-authenticate')).toMatch(/^Bearer/)
  expect(authenticateToken).not.toHaveBeenCalled()
})

it('refuses a token that does not authenticate', async () => {
  jest.mocked(authenticateToken).mockResolvedValue(null)
  const response = await post(ping)
  expect(response.status).toBe(401)
  expect(handleMessage).not.toHaveBeenCalled()
})

it("refuses another site's Origin and accepts this app's", async () => {
  expect((await post(ping, { Origin: 'https://evil.example' })).status).toBe(403)
  expect((await post(ping, { Origin: 'not a url' })).status).toBe(403)
  expect((await post(ping, { Origin: 'https://plex.example.com' })).status).toBe(200)
})

it('limits each token', async () => {
  jest.mocked(consume).mockResolvedValue({ ok: false, retryAfterSec: 12 })
  const response = await post(ping)
  expect(response.status).toBe(429)
  expect(response.headers.get('retry-after')).toBe('12')
  expect(handleMessage).not.toHaveBeenCalled()
})

it('answers a body that is not JSON with a parse error', async () => {
  const response = await post('{nope')
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
})

it('refuses a body over 1 MB', async () => {
  const response = await post(JSON.stringify({ pad: 'x'.repeat(1_000_001) }))
  expect(response.status).toBe(413)
  expect(handleMessage).not.toHaveBeenCalled()
})

it.each([
  ['GET', GET],
  ['DELETE', DELETE],
])('answers %s with 405', async (method, handler) => {
  const response = await handler(new NextRequest('https://plex.example.com/api/mcp', { method }))
  expect(response.status).toBe(405)
  expect(response.headers.get('allow')).toBe('POST')
})
