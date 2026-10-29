/**
 * Factories for full Prisma rows, built from partial overrides, so typed
 * mocks (`prismaMock.user.findUnique.mockResolvedValue(buildUser())`) get a
 * valid shape without casts.
 */
import { Prisma, type Config, type Invite, type JellyfinServer, type LLMUsage, type PlexServer, type PlexWrapped, type RewindShare, type Setup, type User } from '@/lib/generated/prisma/client'

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
    role: null,
    onboardingStatus: { plex: false, jellyfin: false },
    isExempt: false,
    exemptNote: null,
    timezone: null,
    sessionVersion: 0,
    disabledAt: null,
    announcementsSeenAt: null,
    requestTiersExcluded: false,
    watchHours: null,
    watchHoursLast30Days: null,
    watchHoursReadAt: null,
    accessEndedAt: null,
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
    kind: 'ADMIN',
    affiliateUserId: null,
    label: null,
    cancelledAt: null,
    joinedAt: null,
    joinedUserId: null,
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
    groupKey: overrides.chatConversationId ?? overrides.id ?? 'llm-usage-1',
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
    llmDailyCapPerUserUsd: 0.5,
    llmDailyCapAdminUsd: 5,
    llmDailyCapServerUsd: 5,
    lastRetentionRunAt: null,
    lastRetentionSummary: null,
    discordStatsEnabled: false,
    discordStatsIntervalMinutes: 10,
    discordStatsChannels: null,
    discordStatsLastNames: null,
    requestTiersEnabled: false,
    requestTiersRunHour: 0,
    requestTiers: null,
    affiliateInvitesEnabled: false,
    affiliateTiers: null,
    affiliateServerCap: 10,
    affiliateLibrarySectionIds: null,
    affiliatePlexMachineId: null,
    affiliateBlockKey: null,
    encryptionCanary: null,
    encryptionFieldsHash: null,
    updatedAt: fixedDate(),
    updatedBy: null,
    ...overrides,
  }
}

export function buildPlexServer(overrides: Partial<PlexServer> = {}): PlexServer {
  return {
    id: 'plex-server-1',
    name: 'Test Plex',
    url: 'https://plex.example.com:32400',
    publicUrl: null,
    token: 'plex-token',
    adminPlexUserId: null,
    machineIdentifier: null,
    isActive: true,
    createdAt: fixedDate(),
    updatedAt: fixedDate(),
    ...overrides,
  }
}

export function buildJellyfinServer(overrides: Partial<JellyfinServer> = {}): JellyfinServer {
  return {
    id: 'jellyfin-server-1',
    name: 'Test Jellyfin',
    url: 'http://jellyfin.example.com:8096',
    publicUrl: null,
    apiKey: 'jellyfin-api-key',
    adminUserId: null,
    isActive: true,
    enabledForLogin: true,
    createdAt: fixedDate(),
    updatedAt: fixedDate(),
    ...overrides,
  }
}

export function buildRewindShare(overrides: Partial<RewindShare> = {}): RewindShare {
  return {
    id: 'share-1',
    wrappedId: 'wrapped-1',
    tokenHash: 'a'.repeat(64),
    assetKey: 'AAAAAAAAAAAAAAAAAAAAAA',
    pages: ['cover', 'top-shows'],
    signed: false,
    includeArt: false,
    dailyDetail: false,
    cardFacts: [],
    expiresAt: null,
    revokedAt: null,
    createdAt: fixedDate(),
    rotatedFromId: null,
    ...overrides,
  }
}

export function buildSetup(overrides: Partial<Setup> = {}): Setup {
  return {
    id: 'setup-1',
    isComplete: false,
    currentStepId: 'plex',
    completedAt: null,
    claimCodeHash: null,
    claimCodeIssuedAt: null,
    claimId: null,
    claimedAt: null,
    createdAt: fixedDate(),
    updatedAt: fixedDate(),
    ...overrides,
  }
}
