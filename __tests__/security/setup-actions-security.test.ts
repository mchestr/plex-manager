/**
 * @jest-environment node
 */

/**
 * Security tests for the setup actions (P11.32, SEC-30): before setup
 * completes every export of actions/setup.ts needs the setup claim, and after
 * it an admin. Refusals are coded results, never throws, and nothing is tested
 * or written. An export added later without the guard fails here.
 */

import { mockDeep, mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'

import { buildSetup } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import * as setupActions from '@/actions/setup'
import { claimServer } from '@/actions/setup-claim'
import { testLLMProviderConnection } from '@/lib/connections/llm-provider'
import { testOverseerrConnection } from '@/lib/connections/overseerr'
import { getPlexUserInfo, testPlexConnection } from '@/lib/connections/plex'
import { testPrometheusConnection } from '@/lib/connections/prometheus'
import { testRadarrConnection } from '@/lib/connections/radarr'
import { testSonarrConnection } from '@/lib/connections/sonarr'
import { testTautulliConnection } from '@/lib/connections/tautulli'
import type { Prisma } from '@/lib/generated/prisma/client'
import { setupClaimCookie } from '@/lib/setup/claim'
import { getDevDefaults } from '@/lib/setup/dev-defaults'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/connections/plex', () => ({
  testPlexConnection: jest.fn(),
  getPlexUserInfo: jest.fn(),
  getPlexServerIdentity: jest.fn().mockResolvedValue({ success: true, machineIdentifier: 'machine-1' }),
}))
jest.mock('@/lib/connections/tautulli', () => ({ testTautulliConnection: jest.fn() }))
jest.mock('@/lib/connections/overseerr', () => ({ testOverseerrConnection: jest.fn() }))
jest.mock('@/lib/connections/sonarr', () => ({ testSonarrConnection: jest.fn() }))
jest.mock('@/lib/connections/radarr', () => ({ testRadarrConnection: jest.fn() }))
jest.mock('@/lib/connections/prometheus', () => ({ testPrometheusConnection: jest.fn() }))
jest.mock('@/lib/connections/llm-provider', () => ({ testLLMProviderConnection: jest.fn() }))
jest.mock('@/lib/security/audit-log', () => ({ ...jest.requireActual('@/lib/security/audit-log'), logAuditEvent: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

// One browser: its cookie jar and its address
const jar = new Map<string, string>()
let address = '203.0.113.7'
jest.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (cookie: { name: string; value: string }) => jar.set(cookie.name, cookie.value),
    delete: (name: string) => jar.delete(name),
  }),
  headers: async () => new Headers({ 'x-forwarded-for': address }),
}))

const session = jest.mocked(getServerSession)
const ADMIN = { user: { id: 'admin-user-id', isAdmin: true }, expires: '' }
const MEMBER = { user: { id: 'member-1', isAdmin: false }, expires: '' }
const TOKEN = 'e2e-setup-token-0123456789'
const SETUP_CLAIM_COOKIE = 'pm-setup'

/** A valid input for each export; an export missing here is still called, with none. */
const SAMPLES: Record<string, unknown> = {
  savePlexServer: { name: 'My Plex Server', url: 'https://plex.example.com:32400', token: 'plex-token' },
  saveTautulli: { name: 'Tautulli', url: 'http://tautulli.example.com:8181', apiKey: 'tautulli-key' },
  saveOverseerr: { name: 'Overseerr', url: 'http://overseerr.example.com:5055', apiKey: 'overseerr-key' },
  saveSonarr: { name: 'Sonarr', url: 'http://sonarr.example.com:8989', apiKey: 'sonarr-key' },
  saveRadarr: { name: 'Radarr', url: 'http://radarr.example.com:7878', apiKey: 'radarr-key' },
  saveDiscordIntegration: { isEnabled: false },
  saveChatLLMProvider: { provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o' },
  saveLLMProvider: { provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o' },
  savePrometheus: { name: 'Prometheus', url: 'http://prometheus.example.com:9090', query: 'up' },
  completeSetup: undefined,
}

const EXPORTS = Object.entries(setupActions) as [string, (input?: unknown) => Promise<unknown>][]
const TESTERS = [
  testPlexConnection,
  testTautulliConnection,
  testOverseerrConnection,
  testSonarrConnection,
  testRadarrConnection,
  testPrometheusConnection,
  testLLMProviderConnection,
]

function wizard(row: Partial<Parameters<typeof buildSetup>[0]> = {}) {
  prismaMock.setup.findFirst.mockResolvedValue(buildSetup({ currentStep: 5, ...row }))
}

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  jar.clear()
  address = '203.0.113.7'
  delete process.env.SETUP_TOKEN
  prismaMock.$transaction.mockImplementation((callback) => callback(mockDeep<Prisma.TransactionClient>()))
  session.mockResolvedValue(null)
  for (const tester of TESTERS) jest.mocked(tester).mockResolvedValue({ success: true })
  jest.mocked(getPlexUserInfo).mockResolvedValue({ success: true, data: { id: 'plex-user-123' } } as never)
})

it('covers every export of actions/setup.ts', () => {
  expect(EXPORTS.map(([name]) => name).sort()).toEqual(Object.keys(SAMPLES).sort())
})

describe.each(EXPORTS)('%s', (name, action) => {
  it('refuses a browser without the claim before setup completes', async () => {
    wizard({ claimId: 'claim-1' })
    session.mockResolvedValue(ADMIN)

    await expect(action(SAMPLES[name])).resolves.toMatchObject({ success: false, code: 'SETUP_UNCLAIMED' })
    for (const tester of TESTERS) expect(tester).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(prismaMock.setup.update).not.toHaveBeenCalled()
  })

  it('refuses the cookie of an earlier claim', async () => {
    wizard({ claimId: 'claim-2' })
    jar.set(SETUP_CLAIM_COOKIE, setupClaimCookie('claim-1').value)

    await expect(action(SAMPLES[name])).resolves.toMatchObject({ success: false, code: 'SETUP_UNCLAIMED' })
  })

  it('runs for the claimed browser before setup completes', async () => {
    wizard({ claimId: 'claim-1' })
    jar.set(SETUP_CLAIM_COOKIE, setupClaimCookie('claim-1').value)

    await expect(action(SAMPLES[name])).resolves.toEqual({ success: true, data: null })
  })

  it('refuses a member, and a signed-out caller, once setup is complete', async () => {
    wizard({ isComplete: true })
    jar.set(SETUP_CLAIM_COOKIE, setupClaimCookie('claim-1').value)
    session.mockResolvedValue(MEMBER)

    await expect(action(SAMPLES[name])).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
    session.mockResolvedValue(null)
    await expect(action(SAMPLES[name])).resolves.toMatchObject({ success: false, code: 'UNAUTHENTICATED' })
    for (const tester of TESTERS) expect(tester).not.toHaveBeenCalled()
  })

  it('runs for an admin once setup is complete', async () => {
    wizard({ isComplete: true })
    session.mockResolvedValue(ADMIN)

    await expect(action(SAMPLES[name])).resolves.toEqual({ success: true, data: null })
  })
})

describe('completeSetup', () => {
  it('ends the claim: clears it from the row and deletes the cookie', async () => {
    wizard({ claimId: 'claim-1' })
    jar.set(SETUP_CLAIM_COOKIE, setupClaimCookie('claim-1').value)

    await expect(setupActions.completeSetup()).resolves.toEqual({ success: true, data: null })

    expect(prismaMock.setup.update).toHaveBeenCalledWith({
      where: { id: 'setup-1' },
      data: { isComplete: true, completedAt: expect.any(Date), claimId: null, claimCodeHash: null },
    })
    expect(jar.has(SETUP_CLAIM_COOKIE)).toBe(false)
  })
})

describe('claimServer', () => {
  it('claims with SETUP_TOKEN, after which the setup actions run', async () => {
    process.env.SETUP_TOKEN = TOKEN
    wizard()

    await expect(claimServer({ code: TOKEN })).resolves.toEqual({ success: true, data: null })
    expect(jar.has(SETUP_CLAIM_COOKIE)).toBe(true)

    // The row now holds the claim the cookie names
    wizard({ claimId: prismaMock.setup.update.mock.calls[0][0].data.claimId as string })

    await expect(setupActions.saveTautulli(SAMPLES.saveTautulli as never)).resolves.toEqual({ success: true, data: null })
  })

  it('refuses a wrong code as VALIDATION without setting a cookie', async () => {
    address = '203.0.113.20'
    process.env.SETUP_TOKEN = TOKEN
    wizard()

    await expect(claimServer({ code: 'K7QM-4WZD-P2HX' })).resolves.toMatchObject({
      success: false,
      code: 'VALIDATION',
      fieldErrors: { code: [expect.any(String)] },
    })
    expect(jar.size).toBe(0)
  })

  it('refuses the sixth try within a minute from one address', async () => {
    address = '203.0.113.30'
    wizard({ claimCodeHash: 'f'.repeat(64) })

    for (let i = 0; i < 5; i++) {
      await expect(claimServer({ code: 'AAAA-AAAA-AAAA' })).resolves.toMatchObject({ code: 'VALIDATION' })
    }
    await expect(claimServer({ code: 'AAAA-AAAA-AAAA' })).resolves.toMatchObject({ success: false, code: 'RATE_LIMITED' })

    // Another address still has its tries
    address = '203.0.113.31'
    await expect(claimServer({ code: 'AAAA-AAAA-AAAA' })).resolves.toMatchObject({ code: 'VALIDATION' })
  })

  it('refuses once setup is complete', async () => {
    address = '203.0.113.40'
    process.env.SETUP_TOKEN = TOKEN
    wizard({ isComplete: true })

    await expect(claimServer({ code: TOKEN })).resolves.toMatchObject({ success: false, code: 'CONFLICT' })
    expect(jar.size).toBe(0)
  })
})

// Last: in development `getEnv()` memoises the environment, SETUP_TOKEN included
describe('getDevDefaults', () => {
  afterEach(() => jest.restoreAllMocks())

  it('returns nothing to a browser without the claim', async () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'development')
    process.env.DEV_SETUP_PREFILL = 'true'
    process.env.DEV_PLEX_TOKEN = 'dev-plex-token'
    wizard({ claimId: 'claim-1' })
    try {
      await expect(getDevDefaults()).resolves.toMatchObject({ plex: null, isDevMode: false })

      jar.set(SETUP_CLAIM_COOKIE, setupClaimCookie('claim-1').value)
      await expect(getDevDefaults()).resolves.toMatchObject({ plex: { token: 'dev-plex-token' } })
    } finally {
      delete process.env.DEV_SETUP_PREFILL
      delete process.env.DEV_PLEX_TOKEN
    }
  })
})
