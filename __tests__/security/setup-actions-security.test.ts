/**
 * Security tests for the setup actions: anyone may run them during the first
 * run, and only an admin once setup is complete. A refusal is a coded result
 * (P11.5), never a throw, and nothing is tested or written.
 */

import { mockDeep, mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { completeSetup, saveLLMProvider, saveOverseerr, savePlexServer, saveTautulli } from '@/actions/setup'
import { testLLMProviderConnection } from '@/lib/connections/llm-provider'
import { testOverseerrConnection } from '@/lib/connections/overseerr'
import { getPlexUserInfo, testPlexConnection } from '@/lib/connections/plex'
import { testTautulliConnection } from '@/lib/connections/tautulli'
import type { Prisma } from '@/lib/generated/prisma/client'

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
jest.mock('@/lib/connections/llm-provider', () => ({ testLLMProviderConnection: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const session = jest.mocked(getServerSession)
const ADMIN = { user: { id: 'admin-user-id', isAdmin: true }, expires: '' }
const MEMBER = { user: { id: 'member-1', isAdmin: false }, expires: '' }

function setupComplete(isComplete: boolean) {
  prismaMock.setup.findFirst.mockResolvedValue({ id: 'setup-1', isComplete, currentStep: 5 } as never)
}

const ACTIONS = [
  {
    name: 'savePlexServer',
    call: () => savePlexServer({ name: 'My Plex Server', url: 'https://plex.example.com:32400', token: 'plex-token' }),
    tester: testPlexConnection,
  },
  {
    name: 'saveTautulli',
    call: () => saveTautulli({ name: 'Tautulli', url: 'http://tautulli.example.com:8181', apiKey: 'tautulli-key' }),
    tester: testTautulliConnection,
  },
  {
    name: 'saveOverseerr',
    call: () => saveOverseerr({ name: 'Overseerr', url: 'http://overseerr.example.com:5055', apiKey: 'overseerr-key' }),
    tester: testOverseerrConnection,
  },
  {
    name: 'saveLLMProvider',
    call: () => saveLLMProvider({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o' }),
    tester: testLLMProviderConnection,
  },
]

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  prismaMock.$transaction.mockImplementation((callback) => callback(mockDeep<Prisma.TransactionClient>()))
  session.mockResolvedValue(null)
  jest.mocked(testPlexConnection).mockResolvedValue({ success: true })
  jest.mocked(getPlexUserInfo).mockResolvedValue({ success: true, data: { id: 'plex-user-123' } } as never)
  jest.mocked(testTautulliConnection).mockResolvedValue({ success: true })
  jest.mocked(testOverseerrConnection).mockResolvedValue({ success: true })
  jest.mocked(testLLMProviderConnection).mockResolvedValue({ success: true })
})

describe.each(ACTIONS)('$name', ({ call, tester }) => {
  it('runs for anyone during the first run', async () => {
    setupComplete(false)

    await expect(call()).resolves.toEqual({ success: true, data: null })
    expect(tester).toHaveBeenCalled()
  })

  it('runs for an admin once setup is complete', async () => {
    setupComplete(true)
    session.mockResolvedValue(ADMIN)

    await expect(call()).resolves.toEqual({ success: true, data: null })
  })

  it('refuses a member once setup is complete, before any connection test', async () => {
    setupComplete(true)
    session.mockResolvedValue(MEMBER)

    await expect(call()).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
    expect(tester).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('refuses a signed-out caller once setup is complete', async () => {
    setupComplete(true)

    await expect(call()).resolves.toMatchObject({ success: false, code: 'UNAUTHENTICATED' })
    expect(tester).not.toHaveBeenCalled()
  })
})

describe('completeSetup', () => {
  it('completes the first run without a session', async () => {
    setupComplete(false)

    await expect(completeSetup()).resolves.toEqual({ success: true, data: null })
    expect(prismaMock.setup.update).toHaveBeenCalledWith({
      where: { id: 'setup-1' },
      data: { isComplete: true, completedAt: expect.any(Date) },
    })
  })

  it('refuses a member once setup is complete', async () => {
    setupComplete(true)
    session.mockResolvedValue(MEMBER)

    await expect(completeSetup()).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
    expect(prismaMock.setup.update).not.toHaveBeenCalled()
  })
})

it('reports a failed connection test without the save', async () => {
  setupComplete(false)
  jest.mocked(testTautulliConnection).mockResolvedValue({ success: false, error: 'Tautulli rejected the API key' })

  await expect(ACTIONS[1].call()).resolves.toEqual({
    success: false,
    code: 'UPSTREAM_UNAVAILABLE',
    error: 'Tautulli rejected the API key',
  })
  expect(prismaMock.$transaction).not.toHaveBeenCalled()
})

it('refuses invalid input with VALIDATION and field errors', async () => {
  setupComplete(false)

  const result = await saveTautulli({ name: '', url: 'not a url', apiKey: 'k' })

  expect(result).toMatchObject({ success: false, code: 'VALIDATION', fieldErrors: { name: expect.any(Array) } })
  expect(testTautulliConnection).not.toHaveBeenCalled()
})
