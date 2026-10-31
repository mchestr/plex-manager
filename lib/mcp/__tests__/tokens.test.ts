/**
 * @jest-environment node
 */
import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { authenticateToken, bearerToken, generateToken, hashToken, TOKEN_PREFIX } from '@/lib/mcp/tokens'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

const NOW = new Date('2026-10-31T12:00:00Z')

type Row = NonNullable<Awaited<ReturnType<typeof prismaMock.apiToken.findUnique>>>

function row(overrides: Record<string, unknown> = {}, user: Record<string, unknown> = {}): Row {
  return {
    id: 'tok-1',
    scope: 'full',
    revokedAt: null,
    expiresAt: null,
    lastUsedAt: NOW,
    user: { id: 'admin-1', name: 'Mike', email: 'mike@example.com', image: null, isAdmin: true, role: null, disabledAt: null, ...user },
    ...overrides,
  } as unknown as Row
}

beforeEach(() => {
  mockReset(prismaMock)
  prismaMock.apiToken.update.mockResolvedValue({} as never)
})

describe('generateToken', () => {
  it('makes a pmk_ token whose hash and prefix are what is stored', () => {
    const { token, tokenHash, prefix } = generateToken()
    expect(token).toMatch(/^pmk_[A-Za-z0-9_-]{43}$/)
    expect(tokenHash).toBe(hashToken(token))
    expect(tokenHash).not.toContain(token)
    expect(token.startsWith(prefix)).toBe(true)
    expect(prefix.length).toBe(TOKEN_PREFIX.length + 6)
  })

  it('never repeats', () => {
    expect(generateToken().token).not.toBe(generateToken().token)
  })
})

describe('bearerToken', () => {
  const { token } = generateToken()

  it('reads a well-formed bearer token', () => {
    expect(bearerToken(`Bearer ${token}`)).toBe(token)
    expect(bearerToken(`bearer ${token}`)).toBe(token)
  })

  it.each([null, '', token, `Basic ${token}`, 'Bearer pmk_short', `Bearer ${token} extra`, 'Bearer sk_live_abc'])('refuses %p', (header) => {
    expect(bearerToken(header)).toBeNull()
  })
})

describe('authenticateToken', () => {
  it('looks the token up by its hash', async () => {
    prismaMock.apiToken.findUnique.mockResolvedValue(null)
    const { token, tokenHash } = generateToken()

    await authenticateToken(token, NOW)

    expect(prismaMock.apiToken.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash } }))
  })

  it("returns the owner's current session", async () => {
    prismaMock.apiToken.findUnique.mockResolvedValue(row({}, { role: 'support' }))

    const principal = await authenticateToken('pmk_x', NOW)

    expect(principal).toEqual({
      tokenId: 'tok-1',
      scope: 'full',
      session: {
        user: { id: 'admin-1', name: 'Mike', email: 'mike@example.com', image: null, isAdmin: true, role: 'support' },
        expires: '2026-10-31T12:05:00.000Z',
      },
    })
  })

  it.each([
    ['unknown', null],
    ['revoked', row({ revokedAt: NOW })],
    ['expired', row({ expiresAt: NOW })],
    ['no longer an admin', row({}, { isAdmin: false })],
    ['disabled', row({}, { disabledAt: NOW })],
  ])('refuses a token that is %s', async (_label, found) => {
    prismaMock.apiToken.findUnique.mockResolvedValue(found)
    expect(await authenticateToken('pmk_x', NOW)).toBeNull()
  })

  it("carries a read-only token's scope", async () => {
    prismaMock.apiToken.findUnique.mockResolvedValue(row({ scope: 'read' }))
    expect(await authenticateToken('pmk_x', NOW)).toMatchObject({ scope: 'read' })
  })

  it('still accepts the token when its last use cannot be written', async () => {
    prismaMock.apiToken.findUnique.mockResolvedValue(row({ lastUsedAt: null }))
    prismaMock.apiToken.update.mockRejectedValue(new Error('database busy'))
    expect(await authenticateToken('pmk_x', NOW)).toMatchObject({ tokenId: 'tok-1' })
  })

  it('accepts a token before its expiry', async () => {
    prismaMock.apiToken.findUnique.mockResolvedValue(row({ expiresAt: new Date(NOW.getTime() + 1000) }))
    expect(await authenticateToken('pmk_x', NOW)).not.toBeNull()
  })

  it('records the last use at most every five minutes', async () => {
    prismaMock.apiToken.findUnique.mockResolvedValue(row({ lastUsedAt: new Date(NOW.getTime() - 60_000) }))
    await authenticateToken('pmk_x', NOW)
    expect(prismaMock.apiToken.update).not.toHaveBeenCalled()

    prismaMock.apiToken.findUnique.mockResolvedValue(row({ lastUsedAt: null }))
    await authenticateToken('pmk_x', NOW)
    expect(prismaMock.apiToken.update).toHaveBeenCalledWith({ where: { id: 'tok-1' }, data: { lastUsedAt: NOW } })
  })
})
