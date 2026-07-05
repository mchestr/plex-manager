/**
 * Tests for actions/admin/admin-settings.ts secret hiding.
 *
 * getAdminSettings feeds the admin settings client forms via the RSC payload.
 * The Prisma extension decrypts secret columns on read, so this action must
 * strip every raw secret (server tokens/API keys, LLM API keys, the Discord
 * client secret) and expose only `has*` booleans in their place.
 */

import { getAdminSettings } from '@/actions/admin/admin-settings'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    lLMProvider: { findFirst: jest.fn() },
    plexServer: { findFirst: jest.fn() },
    jellyfinServer: { findFirst: jest.fn() },
    tautulli: { findFirst: jest.fn() },
    overseerr: { findFirst: jest.fn() },
    sonarr: { findFirst: jest.fn() },
    radarr: { findFirst: jest.fn() },
    prometheus: { findFirst: jest.fn() },
    discordIntegration: { findUnique: jest.fn() },
    discordConnection: { count: jest.fn() },
    config: { findUnique: jest.fn(), create: jest.fn() },
  },
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

const mockPrisma = prisma as unknown as {
  lLMProvider: { findFirst: jest.Mock }
  plexServer: { findFirst: jest.Mock }
  jellyfinServer: { findFirst: jest.Mock }
  tautulli: { findFirst: jest.Mock }
  overseerr: { findFirst: jest.Mock }
  sonarr: { findFirst: jest.Mock }
  radarr: { findFirst: jest.Mock }
  prometheus: { findFirst: jest.Mock }
  discordIntegration: { findUnique: jest.Mock }
  discordConnection: { count: jest.Mock }
  config: { findUnique: jest.Mock; create: jest.Mock }
}
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>

describe('getAdminSettings secret hiding', () => {
  const adminSession = {
    user: { id: 'admin-1', name: 'Admin', email: 'a@test.com', isAdmin: true },
    expires: new Date(Date.now() + 86400000).toISOString(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetServerSession.mockResolvedValue(adminSession)

    // A non-null config so getConfig returns without creating.
    mockPrisma.config.findUnique.mockResolvedValue({
      id: 'config',
      llmDisabled: false,
      wrappedEnabled: true,
      wrappedGenerationStartDate: null,
      wrappedGenerationEndDate: null,
      watchlistSyncEnabled: false,
      watchlistSyncIntervalMinutes: 60,
      stripeEnabled: false,
      stripePriceIds: null,
      updatedAt: new Date(),
      updatedBy: null,
    })

    mockPrisma.lLMProvider.findFirst.mockResolvedValue(null)
    mockPrisma.plexServer.findFirst.mockResolvedValue(null)
    mockPrisma.jellyfinServer.findFirst.mockResolvedValue(null)
    mockPrisma.tautulli.findFirst.mockResolvedValue(null)
    mockPrisma.overseerr.findFirst.mockResolvedValue(null)
    mockPrisma.sonarr.findFirst.mockResolvedValue(null)
    mockPrisma.radarr.findFirst.mockResolvedValue(null)
    mockPrisma.prometheus.findFirst.mockResolvedValue(null)
    mockPrisma.discordIntegration.findUnique.mockResolvedValue(null)
    mockPrisma.discordConnection.count.mockResolvedValue(0)
  })

  it('strips the LLM API key and exposes hasApiKey (chat + wrapped)', async () => {
    mockPrisma.lLMProvider.findFirst
      .mockResolvedValueOnce({ id: 'chat', provider: 'openai', purpose: 'chat', apiKey: 'sk-chat-secret', model: 'gpt-4', temperature: 0.7, maxTokens: 1000, isActive: true })
      .mockResolvedValueOnce({ id: 'wrapped', provider: 'openai', purpose: 'wrapped', apiKey: 'sk-wrapped-secret', model: 'gpt-4', temperature: 0.8, maxTokens: 6000, isActive: true })

    const settings = await getAdminSettings()

    expect(settings.chatLLMProvider).not.toHaveProperty('apiKey')
    expect(settings.chatLLMProvider).toMatchObject({ hasApiKey: true, model: 'gpt-4' })
    expect(settings.wrappedLLMProvider).not.toHaveProperty('apiKey')
    expect(settings.wrappedLLMProvider).toMatchObject({ hasApiKey: true })
    // Backward-compat alias mirrors the wrapped provider (still sanitized).
    expect(settings.llmProvider).not.toHaveProperty('apiKey')
    expect(settings.llmProvider).toMatchObject({ hasApiKey: true })

    expect(JSON.stringify(settings)).not.toContain('sk-chat-secret')
    expect(JSON.stringify(settings)).not.toContain('sk-wrapped-secret')
  })

  it('strips the Plex token and server API keys, exposing has* booleans', async () => {
    mockPrisma.plexServer.findFirst.mockResolvedValue({ id: 'p', name: 'Plex', url: 'http://plex', token: 'plex-token-secret', publicUrl: null, isActive: true })
    mockPrisma.tautulli.findFirst.mockResolvedValue({ id: 't', name: 'Tautulli', url: 'http://taut', apiKey: 'taut-secret', publicUrl: null, isActive: true })
    mockPrisma.sonarr.findFirst.mockResolvedValue({ id: 's', name: 'Sonarr', url: 'http://son', apiKey: 'sonarr-secret', publicUrl: null, isActive: true })

    const settings = await getAdminSettings()

    expect(settings.plexServer).not.toHaveProperty('token')
    expect(settings.plexServer).toMatchObject({ hasToken: true, name: 'Plex' })
    expect(settings.tautulli).not.toHaveProperty('apiKey')
    expect(settings.tautulli).toMatchObject({ hasApiKey: true })
    expect(settings.sonarr).toMatchObject({ hasApiKey: true })

    const serialized = JSON.stringify(settings)
    expect(serialized).not.toContain('plex-token-secret')
    expect(serialized).not.toContain('taut-secret')
    expect(serialized).not.toContain('sonarr-secret')
  })

  it('strips the Discord client secret and bot token, exposing has* booleans', async () => {
    mockPrisma.discordIntegration.findUnique.mockResolvedValue({
      id: 'discord',
      isEnabled: true,
      botEnabled: false,
      clientId: 'client-id-public',
      clientSecret: 'discord-secret-value',
      botToken: 'discord-bot-token-value',
      supportChannelId: 'channel-123',
      supportThreadIds: ['thread-1', 'thread-2'],
      guildId: null,
      serverInviteCode: null,
      platformName: 'Plex Wrapped',
      instructions: null,
    })

    const settings = await getAdminSettings()

    expect(settings.discordIntegration).not.toHaveProperty('clientSecret')
    expect(settings.discordIntegration).not.toHaveProperty('botToken')
    expect(settings.discordIntegration).toMatchObject({
      hasClientSecret: true,
      hasBotToken: true,
      clientId: 'client-id-public',
      // Non-secret fields pass through.
      supportChannelId: 'channel-123',
      supportThreadIds: ['thread-1', 'thread-2'],
    })
    const serialized = JSON.stringify(settings)
    expect(serialized).not.toContain('discord-secret-value')
    expect(serialized).not.toContain('discord-bot-token-value')
  })

  it('reports has* as false when a secret column is empty', async () => {
    mockPrisma.plexServer.findFirst.mockResolvedValue({ id: 'p', name: 'Plex', url: 'http://plex', token: '', publicUrl: null, isActive: true })

    const settings = await getAdminSettings()

    expect(settings.plexServer).toMatchObject({ hasToken: false })
  })

  it('keeps null rows null (no has* object fabricated)', async () => {
    const settings = await getAdminSettings()

    expect(settings.plexServer).toBeNull()
    expect(settings.chatLLMProvider).toBeNull()
    expect(settings.discordIntegration).toBeNull()
  })
})
