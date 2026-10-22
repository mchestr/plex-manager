/**
 * @jest-environment node
 */

/**
 * The command menu's search route (P10.16, UI-41): admin-only, Zod-checked,
 * rate-limited at 120 a minute, and selecting only public fields. The limiter
 * is the real one on its in-process store (jest.setup.js clears REDIS_URL).
 */

import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'

import { GET } from '@/app/api/admin/search/route'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { buildInvite, buildUser } from '@/__tests__/helpers/factories'
import { adminSearchResponseSchema } from '@/lib/admin/search'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const mockSession = jest.mocked(getServerSession)

let ipCounter = 0

/** Each test calls from its own address, so the limiter's counts never mix. */
function freshIp(): string {
  ipCounter += 1
  return `203.0.113.${ipCounter}`
}

function search(query: string, ip: string = freshIp()) {
  return GET(new NextRequest(`http://localhost/api/admin/search?${query}`, { headers: { 'x-forwarded-for': ip } }))
}

function signInAs(isAdmin: boolean) {
  mockSession.mockResolvedValue({ user: { id: 'u1', isAdmin }, expires: '' } as never)
}

beforeEach(() => {
  mockReset(prismaMock)
  mockSession.mockReset()
})

describe('GET /api/admin/search', () => {
  it('refuses a signed-out caller with 401 and a member with 403', async () => {
    mockSession.mockResolvedValue(null)
    expect((await search('q=mor&kind=users')).status).toBe(401)

    signInAs(false)
    expect((await search('q=mor&kind=users')).status).toBe(403)
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()
  })

  it.each([
    ['an empty q', 'q=&kind=users'],
    ['a blank q', 'q=%20%20&kind=users'],
    ['a 65-character q', `q=${'a'.repeat(65)}&kind=users`],
    ['an unknown kind', 'q=mor&kind=settings'],
    ['no kind', 'q=mor'],
  ])('answers %s with 400', async (_name, query) => {
    signInAs(true)
    const response = await search(query)
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('finds users by name or email and selects only public fields', async () => {
    signInAs(true)
    prismaMock.user.findMany.mockResolvedValue([buildUser({ id: 'user-1', name: 'Morgan', email: 'morgan@example.com', isAdmin: false })])

    const response = await search('q=%20mor%20&kind=users')
    expect(response.status).toBe(200)
    const body = adminSearchResponseSchema.parse(await response.json())
    expect(body.results).toEqual([{ id: 'user-1', label: 'Morgan', sub: 'morgan@example.com, Member', href: '/admin/users/user-1' }])

    const args = prismaMock.user.findMany.mock.calls[0][0]
    expect(args?.select).toEqual({ id: true, name: true, email: true, isAdmin: true })
    expect(args?.take).toBe(8)
    expect(args?.where).toEqual({
      OR: [{ name: { contains: 'mor', mode: 'insensitive' } }, { email: { contains: 'mor', mode: 'insensitive' } }],
    })
  })

  it('finds invites by upper-cased code prefix and selects only public fields', async () => {
    signInAs(true)
    prismaMock.invite.findMany.mockResolvedValue([
      buildInvite({ id: 'inv-1', code: 'VISUALOK', serverType: 'PLEX', useCount: 0, maxUses: 1, expiresAt: null }),
    ])

    const body = adminSearchResponseSchema.parse(await (await search('q=visual&kind=invites')).json())
    expect(body.results).toEqual([{ id: 'inv-1', label: 'VISUALOK', sub: 'Plex, 0 of 1 used', href: '/admin/invites/inv-1' }])

    const args = prismaMock.invite.findMany.mock.calls[0][0]
    expect(args?.where).toEqual({ code: { startsWith: 'visual', mode: 'insensitive' } })
    expect(args?.select).toEqual({ id: true, code: true, serverType: true, useCount: true, maxUses: true, expiresAt: true })
  })

  it('returns a code, not the error text, when the query fails', async () => {
    signInAs(true)
    prismaMock.user.findMany.mockRejectedValue(new Error('connection to db.internal:5432 refused'))

    const response = await search('q=mor&kind=users')
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.code).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(body)).not.toContain('db.internal')
  })

  it('answers the 121st call in a minute with 429', async () => {
    signInAs(true)
    prismaMock.user.findMany.mockResolvedValue([])
    const ip = freshIp()

    for (let call = 0; call < 120; call += 1) {
      expect((await search('q=mor&kind=users', ip)).status).toBe(200)
    }
    const limited = await search('q=mor&kind=users', ip)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBeTruthy()
  })
})
