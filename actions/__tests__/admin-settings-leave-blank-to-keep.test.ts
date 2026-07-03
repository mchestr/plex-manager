/**
 * Tests for "leave blank to keep current value" secret handling in the admin
 * update actions.
 *
 * Since secrets are no longer sent to the client, a blank secret submission must
 * be treated as "keep the currently-stored secret": the action fetches the
 * stored (decrypted) value and reuses it for the connection test and the write.
 * A non-blank submission overwrites it.
 */

import { updateTautulli } from '@/actions/admin/admin-servers'
import { updateChatLLMProvider } from '@/actions/admin/admin-llm-providers'
import { updateDiscordIntegrationSettings } from '@/actions/discord'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    tautulli: { findFirst: jest.fn(), updateMany: jest.fn(), update: jest.fn(), create: jest.fn() },
    lLMProvider: { findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn(), create: jest.fn() },
    discordIntegration: { findUnique: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn(),
  },
}))

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

// Connection/validation modules are dynamically imported by the actions.
jest.mock('@/lib/connections/tautulli', () => ({
  testTautulliConnection: jest.fn(),
}))
jest.mock('@/lib/connections/llm-provider', () => ({
  testLLMProviderConnection: jest.fn(),
}))
jest.mock('@/lib/discord/integration', () => ({
  syncDiscordRoleConnection: jest.fn(),
  clearDiscordRoleForUser: jest.fn(),
}))

import { testTautulliConnection } from '@/lib/connections/tautulli'
import { testLLMProviderConnection } from '@/lib/connections/llm-provider'

const mockPrisma = prisma as unknown as {
  tautulli: { findFirst: jest.Mock; updateMany: jest.Mock; update: jest.Mock; create: jest.Mock }
  lLMProvider: { findFirst: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock; update: jest.Mock; create: jest.Mock }
  discordIntegration: { findUnique: jest.Mock; upsert: jest.Mock }
  $transaction: jest.Mock
}
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockTestTautulli = testTautulliConnection as jest.Mock
const mockTestLLM = testLLMProviderConnection as jest.Mock

const adminSession = {
  user: { id: 'admin-1', name: 'Admin', email: 'a@test.com', isAdmin: true },
  expires: new Date(Date.now() + 86400000).toISOString(),
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetServerSession.mockResolvedValue(adminSession)
  // Run the transaction callback against the mocked client.
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockPrisma))
})

describe('updateTautulli leave-blank-to-keep', () => {
  it('reuses the stored API key when the submitted key is blank', async () => {
    mockPrisma.tautulli.findFirst.mockResolvedValue({ id: 't1', url: 'http://taut', apiKey: 'stored-secret' })
    mockTestTautulli.mockResolvedValue({ success: true })
    mockPrisma.tautulli.update.mockResolvedValue({})

    const result = await updateTautulli({ name: 'Tautulli', url: 'http://taut', apiKey: undefined })

    expect(result).toEqual({ success: true })
    // Connection test must run with the stored secret, not a blank one.
    expect(mockTestTautulli).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'stored-secret' }))
    // Persisted with the stored secret.
    expect(mockPrisma.tautulli.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ apiKey: 'stored-secret' }) })
    )
  })

  it('uses the submitted API key when a new one is provided', async () => {
    mockPrisma.tautulli.findFirst.mockResolvedValue({ id: 't1', url: 'http://taut', apiKey: 'stored-secret' })
    mockTestTautulli.mockResolvedValue({ success: true })
    mockPrisma.tautulli.update.mockResolvedValue({})

    await updateTautulli({ name: 'Tautulli', url: 'http://taut', apiKey: 'new-secret' })

    expect(mockTestTautulli).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'new-secret' }))
    expect(mockPrisma.tautulli.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ apiKey: 'new-secret' }) })
    )
  })

  it('fails validation when blank and nothing is stored', async () => {
    mockPrisma.tautulli.findFirst.mockResolvedValue(null)

    const result = await updateTautulli({ name: 'Tautulli', url: 'http://taut', apiKey: undefined })

    expect(result.success).toBe(false)
    expect(mockTestTautulli).not.toHaveBeenCalled()
  })
})

describe('updateChatLLMProvider leave-blank-to-keep', () => {
  it('reuses the stored key when the submitted key is blank', async () => {
    // First findFirst: resolve stored key. Inside tx: deactivate then findMany.
    mockPrisma.lLMProvider.findFirst.mockResolvedValue({ id: 'p1', apiKey: 'stored-llm-key', purpose: 'chat' })
    mockPrisma.lLMProvider.findMany.mockResolvedValue([])
    mockPrisma.lLMProvider.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.lLMProvider.create.mockResolvedValue({})
    mockTestLLM.mockResolvedValue({ success: true })

    const result = await updateChatLLMProvider({ provider: 'openai', apiKey: undefined, model: 'gpt-4' })

    expect(result).toEqual({ success: true })
    expect(mockTestLLM).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'stored-llm-key' }))
    expect(mockPrisma.lLMProvider.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ apiKey: 'stored-llm-key' }) })
    )
  })

  it('fails validation when blank and no active provider is stored', async () => {
    mockPrisma.lLMProvider.findFirst.mockResolvedValue(null)

    const result = await updateChatLLMProvider({ provider: 'openai', apiKey: undefined, model: 'gpt-4' })

    expect(result.success).toBe(false)
    expect(mockTestLLM).not.toHaveBeenCalled()
  })
})

describe('updateDiscordIntegrationSettings leave-blank-to-keep', () => {
  it('keeps the stored client secret and allows enabling when blank', async () => {
    mockPrisma.discordIntegration.findUnique.mockResolvedValue({ id: 'discord', clientSecret: 'stored-discord-secret' })
    mockPrisma.discordIntegration.upsert.mockResolvedValue({})

    const result = await updateDiscordIntegrationSettings({
      isEnabled: true,
      clientId: 'client-id',
      clientSecret: '',
    })

    expect(result).toEqual({ success: true })
    expect(mockPrisma.discordIntegration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ clientSecret: 'stored-discord-secret' }),
      })
    )
  })

  it('rejects enabling when blank and no secret is stored', async () => {
    mockPrisma.discordIntegration.findUnique.mockResolvedValue(null)

    const result = await updateDiscordIntegrationSettings({
      isEnabled: true,
      clientId: 'client-id',
      clientSecret: '',
    })

    expect(result.success).toBe(false)
    expect(mockPrisma.discordIntegration.upsert).not.toHaveBeenCalled()
  })

  it('overwrites the client secret when a new value is provided', async () => {
    mockPrisma.discordIntegration.findUnique.mockResolvedValue({ id: 'discord', clientSecret: 'stored-discord-secret' })
    mockPrisma.discordIntegration.upsert.mockResolvedValue({})

    await updateDiscordIntegrationSettings({
      isEnabled: true,
      clientId: 'client-id',
      clientSecret: 'new-discord-secret',
    })

    expect(mockPrisma.discordIntegration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ clientSecret: 'new-discord-secret' }),
      })
    )
  })
})
