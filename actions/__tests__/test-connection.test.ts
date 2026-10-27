/**
 * testServiceConnection (P10.20, SEC-31): Test connection with typed values.
 * A blank key for a new origin is refused before any request; codes map to
 * copy, and a tester's message is never echoed.
 */

import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'

import { testServiceConnection } from '@/actions/admin/test-connection'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { testOverseerrConnection } from '@/lib/connections/overseerr'
import { testPlexConnection } from '@/lib/connections/plex-connection'
import { testTautulliConnection } from '@/lib/connections/tautulli'
import { consume } from '@/lib/security/rate-limit'
import { connectionTestCopy } from '@/lib/ui/error-copy'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/security/rate-limit', () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock('@/lib/connections/plex-connection', () => ({ testPlexConnection: jest.fn() }))
jest.mock('@/lib/connections/jellyfin-connection', () => ({ testJellyfinConnection: jest.fn() }))
jest.mock('@/lib/connections/tautulli', () => ({ testTautulliConnection: jest.fn() }))
jest.mock('@/lib/connections/overseerr', () => ({ testOverseerrConnection: jest.fn() }))
jest.mock('@/lib/connections/sonarr', () => ({ testSonarrConnection: jest.fn() }))
jest.mock('@/lib/connections/radarr', () => ({ testRadarrConnection: jest.fn() }))

const STORED_URL = 'http://requests.lan:5055'
const STORED_KEY = 'stored-overseerr-key-a91c'
const UPSTREAM_MESSAGE = 'connect ECONNREFUSED 10.0.0.9:5055 apikey=hunter2'

const mockFetch = jest.fn()
const admin = {
  user: { id: 'admin-1', name: 'Dana', email: 'd@test.com', isAdmin: true },
  expires: new Date(Date.now() + 86400000).toISOString(),
}

/** The tester "sends" the key it is given to the URL, through the mocked fetch. */
async function sendsKey(config: { url: string; apiKey: string }) {
  await fetch(`${config.url}/api/v1/auth/me?key=${config.apiKey}`)
  return { success: true }
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  mockFetch.mockResolvedValue({ ok: true })
  global.fetch = mockFetch
  jest.mocked(getServerSession).mockResolvedValue(admin)
  jest.mocked(consume).mockResolvedValue({ ok: true })
  prismaMock.overseerr.findFirst.mockResolvedValue({ url: STORED_URL, apiKey: STORED_KEY } as never)
  jest.mocked(testOverseerrConnection).mockImplementation(sendsKey)
})

describe('testServiceConnection', () => {
  it('refuses a blank key for a new origin with SECRET_REQUIRED, before any request', async () => {
    const result = await testServiceConnection({ service: 'overseerr', url: 'http://listener.example:5055', secret: '' })

    expect(result).toMatchObject({ success: false, code: 'SECRET_REQUIRED', fieldErrors: { secret: [expect.any(String)] } })
    expect(testOverseerrConnection).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(JSON.stringify(mockFetch.mock.calls)).not.toContain(STORED_KEY)
  })

  it('reuses the stored key for the same origin with a new path', async () => {
    const result = await testServiceConnection({ service: 'overseerr', url: `${STORED_URL}/requests` })

    expect(result).toEqual({ success: true, data: { status: 'ok', code: null } })
    expect(mockFetch).toHaveBeenCalledWith(`${STORED_URL}/api/v1/auth/me?key=${STORED_KEY}`)
  })

  it('sends a typed key to a new origin, never the stored one', async () => {
    await testServiceConnection({ service: 'overseerr', url: 'http://new.lan:5055', secret: 'typed-key' })

    expect(mockFetch).toHaveBeenCalledWith('http://new.lan:5055/api/v1/auth/me?key=typed-key')
    expect(JSON.stringify(mockFetch.mock.calls)).not.toContain(STORED_KEY)
  })

  it('returns a code, never the tester message, and the code maps to copy', async () => {
    jest.mocked(testTautulliConnection).mockResolvedValue({ success: false, error: `Tautulli server not found at this address: ${UPSTREAM_MESSAGE}` })
    prismaMock.tautulli.findFirst.mockResolvedValue(null)

    const result = await testServiceConnection({ service: 'tautulli', url: 'http://tautulli.lan:8181', secret: 'typed' })

    expect(result).toEqual({ success: true, data: { status: 'unreachable', code: 'NOT_FOUND' } })
    expect(JSON.stringify(result)).not.toContain('ECONNREFUSED')
    expect(connectionTestCopy('NOT_FOUND')).toMatchObject({ field: 'url', fieldError: 'Nothing answered at this address' })
  })

  it('maps a refused key to the secret field', async () => {
    jest.mocked(testPlexConnection).mockResolvedValue({ success: false, error: 'Invalid Plex token' })

    const result = await testServiceConnection({ service: 'plex', url: 'http://plex.lan:32400', secret: 'typed' })

    expect(result).toEqual({ success: true, data: { status: 'unreachable', code: 'UNAUTHORIZED' } })
    expect(connectionTestCopy('UNAUTHORIZED', 'Plex token')).toMatchObject({ field: 'secret', fieldError: 'The server refused this Plex token' })
  })

  it('maps a thrown tester to UNREACHABLE without its text', async () => {
    jest.mocked(testOverseerrConnection).mockRejectedValue(new Error(UPSTREAM_MESSAGE))

    const result = await testServiceConnection({ service: 'overseerr', url: STORED_URL })

    expect(result).toEqual({ success: true, data: { status: 'unreachable', code: 'UNREACHABLE' } })
  })

  it('returns a field error for an unparseable URL', async () => {
    const result = await testServiceConnection({ service: 'overseerr', url: 'ftp://requests.lan', secret: 'typed' })

    expect(result).toMatchObject({ success: false, code: 'VALIDATION', fieldErrors: { url: [expect.any(String)] } })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('spends the admin:test limit and refuses non-admins', async () => {
    await testServiceConnection({ service: 'overseerr', url: STORED_URL })
    expect(consume).toHaveBeenCalledWith('admin:test', 'admin-1')

    jest.mocked(getServerSession).mockResolvedValue({ ...admin, user: { ...admin.user, isAdmin: false } })
    await expect(testServiceConnection({ service: 'overseerr', url: STORED_URL })).resolves.toMatchObject({ code: 'FORBIDDEN' })
  })
})
