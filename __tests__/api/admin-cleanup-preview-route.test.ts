/**
 * @jest-environment node
 */

/**
 * The media cleanup live preview route (TS 10.6, E9): rate limited by
 * address at 120 a minute, admin only, a Zod body of at most 64 KB, the
 * request signal passed on, the requester names audited, never cached, and
 * a safe 500. The limiter is the real one on its in-process store
 * (jest.setup.js clears REDIS_URL).
 */

import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'

import { POST } from '@/app/api/admin/cleanup/preview/route'
import { runPreview } from '@/lib/cleanup/preview/run-preview'
import type { PreviewResponse } from '@/lib/cleanup/types/preview'
import { auditMemberListed } from '@/lib/security/audit-log'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/cleanup/preview/run-preview', () => ({ runPreview: jest.fn() }))
jest.mock('@/lib/security/audit-log', () => ({ auditMemberListed: jest.fn() }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const mockSession = jest.mocked(getServerSession)
const mockPreview = jest.mocked(runPreview)

const DEFINITION = {
  schemaVersion: 1,
  level: 'movie',
  libraries: ['1'],
  conditions: [{ id: 'c1', field: 'watch.lastPlayed', op: 'never', value: { duration: { amount: 365, unit: 'days' }, orNever: true } }],
  protections: [],
  then: { graceDays: 30, action: 'movie.delete', importListExclusion: true },
}

let ipCounter = 0
/** Each test calls from its own address, so the limiter's counts never mix. */
function freshIp(): string {
  ipCounter += 1
  return `198.51.100.${ipCounter}`
}

function post(body: unknown, { ip = freshIp(), signal }: { ip?: string; signal?: AbortSignal } = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return POST(new NextRequest('http://localhost/api/admin/cleanup/preview', {
    method: 'POST', body: text, headers: { 'x-forwarded-for': ip, 'content-type': 'application/json' }, signal,
  }))
}

function preview(rows: Partial<PreviewResponse['rows'][number]>[] = []): PreviewResponse {
  return { rows, matches: 1 } as unknown as PreviewResponse
}

function signInAs(isAdmin: boolean) {
  mockSession.mockResolvedValue({ user: { id: 'admin-1', isAdmin }, expires: '' } as never)
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPreview.mockResolvedValue(preview())
})

describe('POST /api/admin/cleanup/preview', () => {
  it('refuses a signed-out caller with 401 and a member with 403', async () => {
    mockSession.mockResolvedValue(null)
    expect((await post({ definition: DEFINITION })).status).toBe(401)
    signInAs(false)
    expect((await post({ definition: DEFINITION })).status).toBe(403)
    expect(mockPreview).not.toHaveBeenCalled()
  })

  it.each([
    ['a body that is not JSON', '{"definition":'],
    ['a draft of an unknown level', { definition: { ...DEFINITION, level: 'episode' } }],
    ['a page beyond 200', { definition: DEFINITION, page: 201 }],
    ['no definition', { tab: 'matches' }],
  ])('answers %s with 400', async (_name, body) => {
    signInAs(true)
    const response = await post(body)
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(mockPreview).not.toHaveBeenCalled()
  })

  it('answers a body above 64 KB with 413', async () => {
    signInAs(true)
    const response = await post({ definition: DEFINITION, search: 'x'.repeat(70 * 1024) })
    expect(response.status).toBe(413)
    expect(mockPreview).not.toHaveBeenCalled()
  })

  it('answers 200 with the preview, never cached, and passes the request signal', async () => {
    signInAs(true)
    const response = await post({ definition: DEFINITION, ruleId: 'rule-1', tab: 'nearMisses' })
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ rows: [], matches: 1 })
    const [request, options] = mockPreview.mock.calls[0]
    expect(request).toMatchObject({ ruleId: 'rule-1', tab: 'nearMisses', sort: 'largest', page: 1 })
    expect(options.actorId).toBe('admin-1')
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(auditMemberListed).not.toHaveBeenCalled()
  })

  it('audits the read when the rows name requesters', async () => {
    signInAs(true)
    mockPreview.mockResolvedValue(preview([{ requestedBy: 'none' }, { requestedBy: [{ name: 'Avery Example', status: 'member', at: '2026-01-01T00:00:00.000Z' }] }]))
    expect((await post({ definition: DEFINITION, ruleId: 'rule-1' })).status).toBe(200)
    expect(auditMemberListed).toHaveBeenCalledWith('cleanup-requesters', 'admin-1', { ruleId: 'rule-1' })
    await post({ definition: DEFINITION })
    expect(auditMemberListed).toHaveBeenLastCalledWith('cleanup-requesters', 'admin-1', {})
  })

  it('stops early when the client aborts, and logs no error', async () => {
    signInAs(true)
    const controller = new AbortController()
    mockPreview.mockImplementation(async (_request, { signal }) => {
      controller.abort()
      signal?.throwIfAborted()
      return preview()
    })
    const response = await post({ definition: DEFINITION }, { signal: controller.signal })
    expect(response.status).toBe(499)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('returns a code, not the error text, when the preview fails', async () => {
    signInAs(true)
    mockPreview.mockRejectedValue(new Error('connection to db.internal:5432 refused'))
    const response = await post({ definition: DEFINITION })
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.code).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(body)).not.toContain('db.internal')
  })

  it('answers the 121st call in a minute from one address with 429', async () => {
    signInAs(true)
    const ip = freshIp()
    for (let call = 0; call < 120; call += 1) expect((await post({ definition: DEFINITION }, { ip })).status).toBe(200)
    const limited = await post({ definition: DEFINITION }, { ip })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBeTruthy()
  })
})
