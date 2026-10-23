/**
 * @jest-environment node
 */

/**
 * GET /account/export (P11.15): signed in only, a JSON download with
 * `no-store` and a dated file name, and three a day per member. The limiter
 * is the real one on its in-process store (jest.setup.js clears REDIS_URL).
 */

import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'

import { GET } from '@/app/(app)/account/export/route'
import { buildMemberExport } from '@/lib/members/export'
import type { MemberExportV1 } from '@/lib/members/export-schema'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/members/export', () => ({ buildMemberExport: jest.fn() }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const mockSession = jest.mocked(getServerSession)
let memberCounter = 0

/** Each test is its own member, so the limiter's counts never mix. */
function signIn(): string {
  memberCounter += 1
  const id = `export-member-${memberCounter}`
  mockSession.mockResolvedValue({ user: { id }, expires: '' } as never)
  return id
}

const download = () => GET(new NextRequest('http://localhost/account/export'))

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(buildMemberExport).mockResolvedValue({ format: 'plex-manager-member-export', version: 1 } as MemberExportV1)
})

describe('GET /account/export', () => {
  it('refuses a signed-out caller with 401 and builds nothing', async () => {
    mockSession.mockResolvedValue(null)

    const response = await download()

    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(buildMemberExport).not.toHaveBeenCalled()
  })

  it("downloads the member's own export as a dated JSON attachment that is never cached", async () => {
    const id = signIn()

    const response = await download()

    expect(response.status).toBe(200)
    expect(buildMemberExport).toHaveBeenCalledWith(id, expect.any(Date))
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
    expect(response.headers.get('Content-Disposition')).toMatch(/^attachment; filename="plex-manager-data-\d{4}-\d{2}-\d{2}\.json"$/)
    expect(await response.json()).toEqual({ format: 'plex-manager-member-export', version: 1 })
  })

  it('refuses a fourth export in a day with 429 and Retry-After', async () => {
    signIn()
    for (let i = 0; i < 3; i += 1) expect((await download()).status).toBe(200)

    const response = await download()

    expect(response.status).toBe(429)
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(buildMemberExport).toHaveBeenCalledTimes(3)
  })

  it('answers 500 without the error text when the export fails', async () => {
    signIn()
    jest.mocked(buildMemberExport).mockRejectedValue(new Error('database exploded'))

    const response = await download()

    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('exploded')
  })
})
