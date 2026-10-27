/**
 * Tests for actions/admin/admin-servers.ts
 *
 * - The six secret-holding services (P4.6, SEC-31): a blank key is reused only
 *   for the stored row's origin, the connection test never receives the stored
 *   key for a new address, and every save is audited with origins only.
 * - toggleJellyfinLogin: allow Jellyfin sign-in or turn it off.
 */

import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'

import {
  toggleJellyfinLogin,
  updateJellyfinServer,
  updateOverseerr,
  updatePlexServer,
  updateRadarr,
  updateSonarr,
  updateTautulli,
} from '@/actions/admin/admin-servers'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { testJellyfinConnection } from '@/lib/connections/jellyfin'
import { testOverseerrConnection } from '@/lib/connections/overseerr'
import { getPlexServerIdentity, getPlexUserInfo, testPlexConnection } from '@/lib/connections/plex'
import { testRadarrConnection } from '@/lib/connections/radarr'
import { testSonarrConnection } from '@/lib/connections/sonarr'
import { testTautulliConnection } from '@/lib/connections/tautulli'
import { AuditEventType, logAuditEvent } from '@/lib/security/audit-log'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn(), updateTag: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/security/audit-log', () => ({
  ...jest.requireActual('@/lib/security/audit-log'),
  logAuditEvent: jest.fn(),
}))

/** Each connection test "sends" its secret to the configured URL through the mocked fetch. */
function sendsSecret(secretField: 'apiKey' | 'token') {
  return async (config: Record<string, string>) => {
    await fetch(`${config.url}/api?secret=${config[secretField]}`)
    return { success: true }
  }
}

jest.mock('@/lib/connections/plex', () => ({
  testPlexConnection: jest.fn(),
  getPlexUserInfo: jest.fn(),
  getPlexServerIdentity: jest.fn(),
}))
jest.mock('@/lib/connections/jellyfin', () => ({ testJellyfinConnection: jest.fn() }))
jest.mock('@/lib/connections/tautulli', () => ({ testTautulliConnection: jest.fn() }))
jest.mock('@/lib/connections/overseerr', () => ({ testOverseerrConnection: jest.fn() }))
jest.mock('@/lib/connections/sonarr', () => ({ testSonarrConnection: jest.fn() }))
jest.mock('@/lib/connections/radarr', () => ({ testRadarrConnection: jest.fn() }))

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>
const mockAudit = logAuditEvent as jest.Mock
const mockFetch = jest.fn()

const mockAdminSession = {
  user: { id: 'admin-123', name: 'Admin', email: 'admin@test.com', isAdmin: true },
  expires: new Date(Date.now() + 86400000).toISOString(),
}

const mockNonAdminSession = {
  user: { id: 'user-123', name: 'User', email: 'user@test.com', isAdmin: false },
  expires: new Date(Date.now() + 86400000).toISOString(),
}

const STORED_URL = 'http://media.lan:8181'
const STORED_SECRET = 'stored-secret-value'

function storedRow(secretField: 'apiKey' | 'token') {
  return {
    id: 'row-1',
    name: 'Stored',
    url: STORED_URL,
    publicUrl: null,
    [secretField]: STORED_SECRET,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

type SaveInput = { name: string; url: string; apiKey?: string; token?: string; publicUrl?: string }

/** Each service's action, the delegate that stores it, and its connection test. */
const SERVICES: Array<{
  name: string
  secretField: 'apiKey' | 'token'
  save: (input: SaveInput) => Promise<{ success: boolean; code?: string; error?: string }>
  delegate: () => { findFirst: jest.Mock; updateMany: jest.Mock; create: jest.Mock; update: jest.Mock }
  test: jest.Mock
}> = [
  {
    name: 'plex',
    secretField: 'token',
    save: (input) => updatePlexServer(input),
    delegate: () => prismaMock.plexServer as unknown as ReturnType<(typeof SERVICES)[number]['delegate']>,
    test: testPlexConnection as jest.Mock,
  },
  {
    name: 'jellyfin',
    secretField: 'apiKey',
    save: (input) => updateJellyfinServer(input),
    delegate: () => prismaMock.jellyfinServer as unknown as ReturnType<(typeof SERVICES)[number]['delegate']>,
    test: testJellyfinConnection as jest.Mock,
  },
  {
    name: 'tautulli',
    secretField: 'apiKey',
    save: (input) => updateTautulli(input),
    delegate: () => prismaMock.tautulli as unknown as ReturnType<(typeof SERVICES)[number]['delegate']>,
    test: testTautulliConnection as jest.Mock,
  },
  {
    name: 'overseerr',
    secretField: 'apiKey',
    save: (input) => updateOverseerr(input),
    delegate: () => prismaMock.overseerr as unknown as ReturnType<(typeof SERVICES)[number]['delegate']>,
    test: testOverseerrConnection as jest.Mock,
  },
  {
    name: 'sonarr',
    secretField: 'apiKey',
    save: (input) => updateSonarr(input),
    delegate: () => prismaMock.sonarr as unknown as ReturnType<(typeof SERVICES)[number]['delegate']>,
    test: testSonarrConnection as jest.Mock,
  },
  {
    name: 'radarr',
    secretField: 'apiKey',
    save: (input) => updateRadarr(input),
    delegate: () => prismaMock.radarr as unknown as ReturnType<(typeof SERVICES)[number]['delegate']>,
    test: testRadarrConnection as jest.Mock,
  },
]

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  mockFetch.mockResolvedValue({ ok: true })
  global.fetch = mockFetch
  mockGetServerSession.mockResolvedValue(mockAdminSession)
  prismaMock.$transaction.mockImplementation((async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock)) as never)
  for (const service of SERVICES) service.test.mockImplementation(sendsSecret(service.secretField))
  ;(getPlexUserInfo as jest.Mock).mockResolvedValue({ success: true, data: { id: 'plex-admin' } })
  ;(getPlexServerIdentity as jest.Mock).mockResolvedValue({ success: false, error: 'Plex did not respond in time' })
})

describe.each(SERVICES)('$name: a stored secret never goes to a new address', (service) => {
  beforeEach(() => {
    service.delegate().findFirst.mockImplementation((async (args: { where: { isActive?: boolean } }) =>
      args.where.isActive ? storedRow(service.secretField) : null) as never)
  })

  it('refuses a blank secret with a new host, and fetch never receives the stored one', async () => {
    const result = await service.save({ name: 'Moved', url: 'http://listener.example:8181' })

    expect(result).toMatchObject({
      success: false,
      code: 'SECRET_REQUIRED',
      error: 'Enter the API key again to use it with the new address.',
      // P10.20: the form shows it on the field
      fieldErrors: { [service.secretField]: ['Enter the API key again to use it with the new address.'] },
    })
    expect(service.test).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(JSON.stringify(mockFetch.mock.calls)).not.toContain(STORED_SECRET)
    expect(service.delegate().create).not.toHaveBeenCalled()
    expect(service.delegate().update).not.toHaveBeenCalled()
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it.each([
    ['port', 'http://media.lan:9999'],
    ['scheme', 'https://media.lan:8181'],
  ])('refuses a blank secret after a change of %s', async (_change, url) => {
    const result = await service.save({ name: 'Moved', url })

    expect(result).toMatchObject({ success: false, code: 'SECRET_REQUIRED' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('saves a blank secret for the same origin, and audits origins and secretChanged: false', async () => {
    const result = await service.save({ name: 'Renamed', url: `${STORED_URL}/` })

    expect(result).toEqual({ success: true, data: null })
    expect(mockFetch).toHaveBeenCalledWith(`${STORED_URL}/api?secret=${STORED_SECRET}`)
    expect(service.delegate().create).toHaveBeenCalledWith({
      data: expect.objectContaining({ url: STORED_URL, [service.secretField]: STORED_SECRET, isActive: true }),
    })
    expect(mockAudit).toHaveBeenCalledTimes(1)
    const [type, actor, details] = mockAudit.mock.calls[0]
    expect(type).toBe(AuditEventType.CONFIG_CHANGED)
    expect(actor).toBe('admin-123')
    expect(details).toEqual({
      section: service.name,
      changedFields: ['name'],
      secretChanged: false,
      origins: {
        before: { url: STORED_URL, publicUrl: null },
        after: { url: STORED_URL, publicUrl: null },
      },
    })
    expect(JSON.stringify(details)).not.toContain(STORED_SECRET)
  })

  it('sends a newly entered secret to a new address and records secretChanged: true', async () => {
    const result = await service.save({
      name: 'Moved',
      url: 'https://new.lan',
      [service.secretField]: 'fresh-secret',
    })

    expect(result).toEqual({ success: true, data: null })
    expect(mockFetch).toHaveBeenCalledWith('https://new.lan/api?secret=fresh-secret')
    expect(mockAudit.mock.calls[0][2]).toMatchObject({
      secretChanged: true,
      origins: { before: { url: STORED_URL }, after: { url: 'https://new.lan' } },
    })
  })

  it('asks for the secret as a required field when nothing is stored', async () => {
    service.delegate().findFirst.mockResolvedValue(null)

    const result = await service.save({ name: 'First', url: STORED_URL })

    expect(result).toMatchObject({ success: false, code: 'VALIDATION', fieldErrors: { [service.secretField]: [expect.any(String)] } })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('refuses non-admins without throwing or reading the stored row', async () => {
    mockGetServerSession.mockResolvedValue(mockNonAdminSession)

    await expect(service.save({ name: 'X', url: STORED_URL })).resolves.toMatchObject({ code: 'FORBIDDEN' })
    expect(service.delegate().findFirst).not.toHaveBeenCalled()
  })

  it('returns the connection failure as code copy on the secret field, without saving', async () => {
    service.test.mockResolvedValue({ success: false, error: 'Invalid API key' })

    const result = await service.save({ name: 'X', url: STORED_URL })

    expect(result).toMatchObject({
      success: false,
      code: 'UPSTREAM_UNAVAILABLE',
      fieldErrors: { [service.secretField]: [expect.stringMatching(/^The server refused this/)] },
    })
    expect(service.delegate().create).not.toHaveBeenCalled()
    expect(mockAudit).not.toHaveBeenCalled()
  })
})

describe('toggleJellyfinLogin', () => {
  it('should enable Jellyfin login when passed true, and audit the change', async () => {
    prismaMock.jellyfinServer.findFirst.mockResolvedValue({ enabledForLogin: false } as never)
    prismaMock.jellyfinServer.updateMany.mockResolvedValue({ count: 1 })

    const result = await toggleJellyfinLogin(true)

    expect(result).toEqual({ success: true, data: null })
    expect(prismaMock.jellyfinServer.updateMany).toHaveBeenCalledWith({
      where: { isActive: true },
      data: { enabledForLogin: true },
    })
    expect(mockAudit).toHaveBeenCalledWith(
      AuditEventType.CONFIG_CHANGED,
      'admin-123',
      expect.objectContaining({ section: 'jellyfin.login', changedFields: ['enabledForLogin'] })
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/settings')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/')
  })

  it('should disable Jellyfin login when passed false', async () => {
    prismaMock.jellyfinServer.findFirst.mockResolvedValue(null)
    prismaMock.jellyfinServer.updateMany.mockResolvedValue({ count: 1 })

    const result = await toggleJellyfinLogin(false)

    expect(result).toEqual({ success: true, data: null })
    expect(prismaMock.jellyfinServer.updateMany).toHaveBeenCalledWith({
      where: { isActive: true },
      data: { enabledForLogin: false },
    })
  })

  it('should refuse non-admin users', async () => {
    mockGetServerSession.mockResolvedValue(mockNonAdminSession)

    await expect(toggleJellyfinLogin(true)).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
  })

  it('should refuse unauthenticated users', async () => {
    mockGetServerSession.mockResolvedValue(null)

    await expect(toggleJellyfinLogin(true)).resolves.toMatchObject({ success: false, code: 'UNAUTHENTICATED' })
  })

  it('should return error for invalid input', async () => {
    // TypeScript would normally catch this, but testing runtime validation
    const result = await toggleJellyfinLogin('invalid' as unknown as boolean)

    expect(result).toMatchObject({
      success: false,
      code: 'VALIDATION',
      error: 'Invalid input: enabled must be a boolean',
    })
    expect(prismaMock.jellyfinServer.updateMany).not.toHaveBeenCalled()
  })

  it('should not echo database errors', async () => {
    prismaMock.jellyfinServer.updateMany.mockRejectedValue(new Error('Database error at db:5432'))

    const result = await toggleJellyfinLogin(true)

    expect(result).toEqual({
      success: false,
      code: 'INTERNAL',
      error: 'Failed to toggle Jellyfin login setting',
    })
  })
})
