/**
 * Tests for actions/admin/admin-settings.ts secret hiding.
 *
 * getAdminSettings feeds the admin settings client forms via the RSC payload.
 * The Prisma extension decrypts secret columns on read, so this action must
 * strip every raw secret (server tokens/API keys, LLM API keys, the Discord
 * client secret and bot token) and expose only `{ last4, origin }` in their
 * place (P10.20).
 */

import { getAdminSettings } from '@/lib/data/admin-settings'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { markUnreadable, resetUnreadable } from '@/lib/security/unreadable-secrets'

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
      rewindSeasonOpens: '12-01',
      rewindSeasonCloses: '01-31',
      timezone: null,
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

  it('strips the LLM API key and exposes its last4 and destination origin (chat + wrapped)', async () => {
    mockPrisma.lLMProvider.findFirst
      .mockResolvedValueOnce({ id: 'chat', provider: 'openai', purpose: 'chat', apiKey: 'sk-chat-secret', model: 'gpt-4', temperature: 0.7, maxTokens: 1000, isActive: true })
      .mockResolvedValueOnce({ id: 'wrapped', provider: 'openai', purpose: 'wrapped', apiKey: 'sk-wrapped-secret', model: 'gpt-4', temperature: 0.8, maxTokens: 6000, isActive: true })

    const settings = await getAdminSettings()

    expect(settings.chatLLMProvider).not.toHaveProperty('apiKey')
    expect(settings.chatLLMProvider).toMatchObject({ secret: { last4: 'cret', origin: 'https://api.openai.com' }, model: 'gpt-4' })
    expect(settings.wrappedLLMProvider).not.toHaveProperty('apiKey')
    expect(settings.wrappedLLMProvider?.secret).toEqual({ last4: 'cret', origin: 'https://api.openai.com' })
    // Backward-compat alias mirrors the wrapped provider (still sanitized).
    expect(settings.llmProvider).not.toHaveProperty('apiKey')
    expect(settings.llmProvider?.secret).not.toBeNull()

    expect(JSON.stringify(settings)).not.toContain('sk-chat-secret')
    expect(JSON.stringify(settings)).not.toContain('sk-wrapped-secret')
  })

  it('strips the Plex token and server API keys, exposing last4 and the URL origin', async () => {
    mockPrisma.plexServer.findFirst.mockResolvedValue({ id: 'p', name: 'Plex', url: 'http://plex:32400', token: 'plex-token-secret', publicUrl: null, isActive: true })
    mockPrisma.tautulli.findFirst.mockResolvedValue({ id: 't', name: 'Tautulli', url: 'http://taut:8181', apiKey: 'taut-secret-0a91c', publicUrl: null, isActive: true })
    mockPrisma.sonarr.findFirst.mockResolvedValue({ id: 's', name: 'Sonarr', url: 'http://son', apiKey: 'sonarr-k1', publicUrl: null, isActive: true })

    const settings = await getAdminSettings()

    expect(settings.plexServer).not.toHaveProperty('token')
    expect(settings.plexServer).toMatchObject({ secret: { last4: 'cret', origin: 'http://plex:32400' }, name: 'Plex' })
    expect(settings.tautulli).not.toHaveProperty('apiKey')
    expect(settings.tautulli?.secret).toEqual({ last4: 'a91c', origin: 'http://taut:8181' })
    // Too short to show any of it
    expect(settings.sonarr?.secret).toEqual({ last4: '', origin: 'http://son' })

    const serialized = JSON.stringify(settings)
    expect(serialized).not.toContain('plex-token-secret')
    expect(serialized).not.toContain('taut-secret')
    expect(serialized).not.toContain('sonarr-k1')
    expect(serialized).not.toContain('sonarr-k1')
  })

  it('strips the Discord client secret and bot token, with no origin (a fixed destination)', async () => {
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
      secrets: { clientSecret: { last4: 'alue', origin: null }, botToken: { last4: 'alue', origin: null } },
      clientId: 'client-id-public',
      // Non-secret fields pass through.
      supportChannelId: 'channel-123',
      supportThreadIds: ['thread-1', 'thread-2'],
    })
    const serialized = JSON.stringify(settings)
    expect(serialized).not.toContain('discord-secret-value')
    expect(serialized).not.toContain('discord-bot-token-value')
  })

  it('reports a null secret when the column is empty', async () => {
    mockPrisma.plexServer.findFirst.mockResolvedValue({ id: 'p', name: 'Plex', url: 'http://plex', token: '', publicUrl: null, isActive: true })

    const settings = await getAdminSettings()

    expect(settings.plexServer).toMatchObject({ secret: null })
  })

  it('keeps null rows null (no secret object fabricated)', async () => {
    const settings = await getAdminSettings()

    expect(settings.plexServer).toBeNull()
    expect(settings.chatLLMProvider).toBeNull()
    expect(settings.discordIntegration).toBeNull()
  })

  it('marks a secret the current encryption key cannot read, so the form asks for it again (P11.1)', async () => {
    resetUnreadable()
    markUnreadable('Tautulli', 'apiKey', 't', 'k1', 'KEY_UNKNOWN')
    mockPrisma.tautulli.findFirst.mockResolvedValue({ id: 't', name: 'Tautulli', url: 'http://taut:8181', apiKey: null, publicUrl: null, isActive: true })
    mockPrisma.overseerr.findFirst.mockResolvedValue({ id: 'o', name: 'Overseerr', url: 'http://req:5055', apiKey: null, publicUrl: null, isActive: true })

    const settings = await getAdminSettings()

    expect(settings.tautulli?.secret).toEqual({ last4: '', origin: 'http://taut:8181', unreadable: true })
    expect(settings.overseerr?.secret).toBeNull()
    resetUnreadable()
  })
})
