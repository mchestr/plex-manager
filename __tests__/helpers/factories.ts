/**
 * Factories for full Prisma rows, built from partial overrides, so typed
 * mocks (`prismaMock.user.findUnique.mockResolvedValue(buildUser())`) get a
 * valid shape without casts.
 */
import { Prisma, type Config, type Invite, type LLMUsage, type PlexWrapped, type User } from '@/lib/generated/prisma/client'

// A fresh Date per row, so a test that mutates one cannot leak into another.
const fixedDate = () => new Date('2026-01-01T00:00:00.000Z')

export function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: null,
    image: null,
    plexUserId: 'plex-1',
    plexAuthToken: null,
    jellyfinUserId: null,
    primaryAuthService: 'plex',
    isAdmin: false,
    onboardingStatus: { plex: false, jellyfin: false },
    isExempt: false,
    exemptReason: null,
    timezone: null,
    sessionVersion: 0,
    disabledAt: null,
    createdAt: fixedDate(),
    updatedAt: fixedDate(),
    ...overrides,
  }
}

export function buildPlexWrapped(overrides: Partial<PlexWrapped> = {}): PlexWrapped {
  return {
    id: 'wrapped-1',
    userId: 'user-1',
    data: '{}',
    year: 2026,
    status: 'completed',
    error: null,
    shareToken: null,
    summary: null,
    archetype: null,
    generatedAt: fixedDate(),
    dataVersion: 2,
    edition: null,
    factsHash: null,
    dataThrough: null,
    finalCutAt: null,
    notifiedAt: null,
    createdAt: fixedDate(),
    updatedAt: fixedDate(),
    ...overrides,
  }
}

export function buildInvite(overrides: Partial<Invite> = {}): Invite {
  return {
    id: 'invite-1',
    code: 'ABC123',
    serverType: 'PLEX',
    maxUses: 1,
    useCount: 0,
    expiresAt: null,
    createdAt: fixedDate(),
    updatedAt: fixedDate(),
    createdBy: null,
    librarySectionIds: null,
    allowDownloads: false,
    jellyfinLibraryIds: null,
    ...overrides,
  }
}

export function buildLLMUsage(overrides: Partial<LLMUsage> = {}): LLMUsage {
  return {
    id: 'llm-usage-1',
    wrappedId: null,
    chatConversationId: null,
    userId: 'user-1',
    provider: 'openai',
    model: 'gpt-4',
    prompt: null,
    response: null,
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    cost: 0.01,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    serviceTier: null,
    batchId: null,
    promptVersion: null,
    factsHash: null,
    generationId: null,
    outcome: 'ok',
    createdAt: fixedDate(),
    ...overrides,
  }
}

export function buildConfig(overrides: Partial<Config> = {}): Config {
  return {
    id: 'config',
    llmDisabled: false,
    wrappedEnabled: true,
    wrappedGenerationStartDate: null,
    wrappedGenerationEndDate: null,
    watchlistSyncEnabled: false,
    watchlistSyncIntervalMinutes: 60,
    stripeEnabled: false,
    stripeSecretKey: null,
    stripeWebhookSecret: null,
    stripePriceIds: null,
    stripeLibrarySectionIds: null,
    timezone: null,
    locale: 'en-US',
    serverName: null,
    rewindSeasonOpens: '12-01',
    rewindSeasonCloses: '01-31',
    rewindEnabled: false,
    rewindAudience: 'admins',
    rewindLlmMode: 'standard',
    rewindLlmBudgetUsd: new Prisma.Decimal(10),
    rewindNotifyChannels: ['discord', 'banner'],
    rewindPublicLinks: true,
    rewindPublicCounts: false,
    rewindShowServerNameOnCards: true,
    rewindAllowArtOnCards: true,
    rewindExcludedSectionIds: null,
    rewindExcludedContentRatings: null,
    rewindIncludeManagedUsers: false,
    rewindAudio: false,
    rewindDisabledPages: null,
    rewindSerialKey: null,
    updatedAt: fixedDate(),
    updatedBy: null,
    ...overrides,
  }
}
