/**
 * @jest-environment node
 */

/**
 * Tests for setup's Connect with Plex (P10.25, UI-03): every action needs the
 * setup claim, the poll result never carries a token at any depth, and the
 * choice saves only an owned server, with the PIN account as its admin.
 */

import { mockDeep, mockReset, type DeepMockProxy } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { chooseSetupPlexServer, pollSetupPlexConnect, startSetupPlexConnect } from '@/actions/setup-plex'
import { getPlexUserInfo, testPlexConnection } from '@/lib/connections/plex'
import { createPin, readPin } from '@/lib/connections/plex-pin'
import type { Prisma } from '@/lib/generated/prisma/client'
import { SETUP_PLEX_PIN_COOKIE, setupPinCookie } from '@/lib/plex-pin-cookie'
import { requireSetupClaim } from '@/lib/setup/claim'
import { readPlexResources, type PlexResource } from '@/lib/setup/plex-resources'

jest.mock('next-auth', () => ({ getServerSession: jest.fn().mockResolvedValue(null) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/setup/status', () => ({ getSetupStatus: async () => ({ isComplete: false, currentStepId: 'plex' }) }))
jest.mock('@/lib/setup/claim', () => ({ requireSetupClaim: jest.fn() }))
jest.mock('@/lib/connections/plex-pin', () => ({ createPin: jest.fn(), readPin: jest.fn() }))
jest.mock('@/lib/connections/plex', () => ({ getPlexUserInfo: jest.fn(), testPlexConnection: jest.fn() }))
jest.mock('@/lib/setup/plex-resources', () => ({
  ...jest.requireActual('@/lib/setup/plex-resources'),
  readPlexResources: jest.fn(),
}))
jest.mock('@/lib/security/audit-log', () => ({ ...jest.requireActual('@/lib/security/audit-log'), logAuditEvent: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn(), unstable_cache: (load: unknown) => load }))

const jar = new Map<string, string>()
let mockForwardedFor = '203.0.113.9'
jest.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (cookie: { name: string; value: string }) => jar.set(cookie.name, cookie.value),
    delete: (name: string) => jar.delete(name),
  }),
  headers: async () => new Headers({ 'x-forwarded-for': mockForwardedFor }),
}))

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL
afterAll(() => {
  process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
})

const CLIENT_ID = '0b6f2a3e-5c1d-4e8a-9f7b-2d4c6e8a0b1c'

function server(overrides: Partial<PlexResource> = {}): PlexResource {
  return {
    machineIdentifier: 'owned-1',
    name: 'Northfield Plex',
    owned: true,
    online: true,
    lastSeenAt: null,
    version: '1.41.3',
    platform: 'Linux',
    accessToken: 'server-token-owned',
    connections: [{ uri: 'http://192.168.1.20:32400', local: true, relay: false }],
    ...overrides,
  }
}

const RESOURCES = [
  server(),
  server({ machineIdentifier: 'shared-1', name: "Theo's Plex", owned: false, accessToken: 'server-token-shared' }),
  server({ machineIdentifier: 'offline-1', name: "Dana's laptop", online: false, lastSeenAt: '2026-10-14T10:00:00Z', accessToken: 'server-token-offline' }),
]

let tx: DeepMockProxy<Prisma.TransactionClient>

function holdPin() {
  jar.set(SETUP_PLEX_PIN_COOKIE, setupPinCookie({ pinId: 42, code: 'pin-code', clientId: CLIENT_ID }).value)
}

/** Every key of `value`, at any depth. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf)
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)])
  return []
}

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  jar.clear()
  tx = mockDeep<Prisma.TransactionClient>()
  prismaMock.$transaction.mockImplementation((callback) => callback(tx))
  jest.mocked(requireSetupClaim).mockResolvedValue({ ok: true })
  jest.mocked(readPin).mockResolvedValue({ status: 'ready', authToken: 'account-token' })
  jest.mocked(readPlexResources).mockResolvedValue({ ok: true, data: RESOURCES })
  jest.mocked(getPlexUserInfo).mockResolvedValue({ success: true, data: { id: 'plex-owner-7', username: 'dana.whitfield', email: 'd@example.com' } })
  jest.mocked(testPlexConnection).mockResolvedValue({ success: true })
})

describe('the claim', () => {
  it.each([
    ['startSetupPlexConnect', () => startSetupPlexConnect()],
    ['pollSetupPlexConnect', () => pollSetupPlexConnect()],
    ['chooseSetupPlexServer', () => chooseSetupPlexServer({ machineIdentifier: 'owned-1', uri: 'http://192.168.1.20:32400' })],
  ])('%s refuses a browser without it', async (_name, call) => {
    jest.mocked(requireSetupClaim).mockResolvedValue({ ok: false, code: 'SETUP_UNCLAIMED' })
    holdPin()

    await expect(call()).resolves.toMatchObject({ success: false, code: 'SETUP_UNCLAIMED' })
    expect(createPin).not.toHaveBeenCalled()
    expect(readPin).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })
})

describe('startSetupPlexConnect', () => {
  it('keeps the PIN in its own cookie and sends plex.tv back to the Plex step', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://plex.example.com'
    jest.mocked(createPin).mockResolvedValue({ ok: true, data: { id: 7, code: 'abc' } })

    const result = await startSetupPlexConnect()

    expect(result.success).toBe(true)
    expect(jar.has(SETUP_PLEX_PIN_COOKIE)).toBe(true)
    if (result.success) expect(decodeURIComponent(result.data.authUrl)).toContain('/setup?step=plex')
  })
})

describe('pollSetupPlexConnect', () => {
  it('is idle without a PIN', async () => {
    await expect(pollSetupPlexConnect()).resolves.toEqual({ success: true, data: { status: 'idle' } })
  })

  it('lists the servers with no token at any depth', async () => {
    holdPin()

    const result = await pollSetupPlexConnect()

    expect(result).toMatchObject({ success: true, data: { status: 'ready', account: { username: 'dana.whitfield' } } })
    expect(keysOf(result)).not.toContain('accessToken')
    expect(keysOf(result)).not.toContain('authToken')
    expect(JSON.stringify(result)).not.toMatch(/server-token|account-token/)
  })

  it('reports an expired PIN and forgets it', async () => {
    holdPin()
    jest.mocked(readPin).mockResolvedValue({ status: 'expired' })

    await expect(pollSetupPlexConnect()).resolves.toEqual({ success: true, data: { status: 'expired' } })
    expect(jar.has(SETUP_PLEX_PIN_COOKIE)).toBe(false)
  })
})

describe('chooseSetupPlexServer', () => {
  it('saves an owned server with its own token and the PIN account as admin, then advances', async () => {
    holdPin()

    await expect(chooseSetupPlexServer({ machineIdentifier: 'owned-1', uri: 'http://192.168.1.20:32400' })).resolves.toEqual({ success: true, data: null })

    expect(tx.plexServer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Northfield Plex',
        url: 'http://192.168.1.20:32400',
        token: 'server-token-owned',
        adminPlexUserId: 'plex-owner-7',
        machineIdentifier: 'owned-1',
        isActive: true,
      }),
    })
    expect(tx.setup.create).toHaveBeenCalledWith({ data: { currentStepId: 'tautulli' } })
    expect(jar.has(SETUP_PLEX_PIN_COOKIE)).toBe(false)
  })

  it('refuses a server shared with the account', async () => {
    holdPin()

    await expect(chooseSetupPlexServer({ machineIdentifier: 'shared-1', uri: 'http://192.168.1.20:32400' })).resolves.toMatchObject({
      success: false,
      code: 'FORBIDDEN',
    })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('refuses an unknown server and an address it does not list', async () => {
    holdPin()

    await expect(chooseSetupPlexServer({ machineIdentifier: 'nope', uri: 'http://192.168.1.20:32400' })).resolves.toMatchObject({ code: 'NOT_FOUND' })
    await expect(chooseSetupPlexServer({ machineIdentifier: 'owned-1', uri: 'http://evil.example.com:32400' })).resolves.toMatchObject({ code: 'VALIDATION' })
    expect(testPlexConnection).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('is limited per address (setup:plex:choose), before plex.tv is asked', async () => {
    mockForwardedFor = '198.51.100.77'
    try {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await expect(chooseSetupPlexServer({ machineIdentifier: 'nope', uri: 'http://192.168.1.20:32400' })).resolves.toMatchObject({ code: 'CONFLICT' })
      }
      jest.mocked(readPin).mockClear()

      await expect(chooseSetupPlexServer({ machineIdentifier: 'nope', uri: 'http://192.168.1.20:32400' })).resolves.toMatchObject({
        success: false,
        code: 'RATE_LIMITED',
      })
      expect(readPin).not.toHaveBeenCalled()
    } finally {
      mockForwardedFor = '203.0.113.9'
    }
  })

  it('asks to connect again once the PIN has gone', async () => {
    await expect(chooseSetupPlexServer({ machineIdentifier: 'owned-1', uri: 'http://192.168.1.20:32400' })).resolves.toMatchObject({ code: 'CONFLICT' })
    expect(readPlexResources).not.toHaveBeenCalled()
  })
})
