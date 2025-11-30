/**
 * Test Builders - Centralized test object factories
 *
 * This module provides builder functions for creating test objects with sensible defaults.
 * All builders accept partial overrides to customize specific properties while keeping defaults.
 *
 * Usage:
 *   const user = makePrismaUser({ name: 'Custom Name' })
 *   const session = makeSession({ user: { isAdmin: true } })
 */

import {
  AdminUserWithWrappedStats,
  DiscordCommandActivity,
  LlmUsageStats,
  MediaMarkActivity,
  UserActivityItem,
  UserActivityTimelineData,
  WrappedSummary,
} from '@/types/admin'

// ============================================================================
// Domain Object Builders (for application types)
// ============================================================================

/**
 * Creates a mock LLM usage statistics object
 * @param overrides - Partial properties to override defaults
 * @returns LlmUsageStats object with sensible defaults
 */
export const makeLlmUsageStats = (
  overrides: Partial<LlmUsageStats> = {}
): LlmUsageStats => ({
  totalTokens: 1000,
  promptTokens: 500,
  completionTokens: 500,
  cost: 0.01,
  provider: 'openai',
  model: 'gpt-4',
  count: 1,
  ...overrides,
})

/**
 * Creates a mock wrapped summary object
 * @param overrides - Partial properties to override defaults
 * @returns WrappedSummary object with sensible defaults
 */
export const makeWrappedSummary = (
  overrides: Partial<WrappedSummary> = {}
): WrappedSummary => ({
  id: 'wrapped-1',
  year: 2024,
  status: 'completed',
  generatedAt: new Date('2024-01-01T00:00:00Z'),
  createdAt: new Date('2024-01-01T00:00:00Z'),
  shareToken: null,
  shareVisits: 0,
  ...overrides,
})

/**
 * Creates a mock admin user with wrapped statistics
 * @param overrides - Partial properties to override defaults
 * @returns AdminUserWithWrappedStats object with sensible defaults
 */
export const makeAdminUserWithStats = (
  overrides: Partial<AdminUserWithWrappedStats> = {}
): AdminUserWithWrappedStats => ({
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  image: 'https://example.com/avatar.jpg',
  plexUserId: 'plex-123',
  isAdmin: false,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  wrappedStatus: 'completed',
  wrappedGeneratedAt: new Date('2024-01-01T00:00:00Z'),
  totalWrappedCount: 1,
  totalShares: 0,
  totalVisits: 0,
  hasPlexAccess: true,
  llmUsage: makeLlmUsageStats(),
  totalLlmUsage: makeLlmUsageStats(),
  ...overrides,
})

// ============================================================================
// Prisma Mock Builders (for database entities)
// ============================================================================

/**
 * Creates a mock Prisma LLM usage record
 * @param overrides - Partial properties to override defaults
 * @returns Prisma LlmUsage object with sensible defaults
 */
export const makePrismaLlmUsage = (overrides: any = {}) => ({
  totalTokens: 1000,
  promptTokens: 500,
  completionTokens: 500,
  cost: 0.01,
  provider: 'openai',
  model: 'gpt-4',
  ...overrides,
})

/**
 * Creates a mock Prisma wrapped record
 * @param overrides - Partial properties to override defaults
 * @returns Prisma PlexWrapped object with sensible defaults
 */
export const makePrismaWrapped = (overrides: any = {}) => ({
  id: 'wrapped-1',
  year: 2024,
  status: 'completed',
  generatedAt: new Date('2024-01-01T00:00:00Z'),
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  userId: 'user-1',
  content: {},
  llmUsage: [makePrismaLlmUsage()],
  ...overrides,
})

/**
 * Creates a mock Prisma user record
 * @param overrides - Partial properties to override defaults
 * @returns Prisma User object with sensible defaults
 */
export const makePrismaUser = (overrides: any = {}) => ({
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  image: null,
  plexUserId: 'plex-1',
  isAdmin: false,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  plexWrapped: [makePrismaWrapped()],
  llmUsage: [makePrismaLlmUsage()],
  _count: {
    plexWrapped: 1,
  },
  ...overrides,
})

// ============================================================================
// NextAuth Session Builders
// ============================================================================

/**
 * Creates a mock NextAuth session for a regular user
 * @param overrides - Partial properties to override defaults
 * @returns NextAuth Session object
 */
export const makeSession = (overrides: any = {}) => ({
  user: {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    isAdmin: false,
    ...overrides.user,
  },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  ...overrides,
})

/**
 * Creates a mock NextAuth session for an admin user
 * @param overrides - Partial properties to override defaults
 * @returns NextAuth Session object for admin
 */
export const makeAdminSession = (overrides: any = {}) => ({
  user: {
    id: 'admin-1',
    email: 'admin@example.com',
    name: 'Admin User',
    isAdmin: true,
    ...overrides.user,
  },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  ...overrides,
})

// ============================================================================
// Server Configuration Builders
// ============================================================================

/**
 * Creates a mock Plex server configuration
 * @param overrides - Partial properties to override defaults
 * @returns Plex server config object
 */
export const makePlexServerConfig = (overrides: any = {}) => ({
  url: 'https://plex.example.com:32400',
  token: 'plex-token',
  ...overrides,
})

/**
 * Creates a mock Prisma Plex server record
 * @param overrides - Partial properties to override defaults
 * @returns Prisma PlexServer object
 */
export const makePrismaPlexServer = (overrides: any = {}) => ({
  id: 'server-1',
  url: 'https://plex.example.com:32400',
  token: 'server-token',
  name: 'Test Server',
  isActive: true,
  adminPlexUserId: 'admin-plex-id',
  publicUrl: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  ...overrides,
})

/**
 * Creates a mock Tautulli server configuration
 * @param overrides - Partial properties to override defaults
 * @returns Tautulli server config object
 */
export const makeTautulliConfig = (overrides: any = {}) => ({
  url: 'https://tautulli.example.com:8181',
  apiKey: 'tautulli-key',
  ...overrides,
})

/**
 * Creates a mock Prisma Tautulli server record
 * @param overrides - Partial properties to override defaults
 * @returns Prisma Tautulli object
 */
export const makePrismaTautulli = (overrides: any = {}) => ({
  id: 'tautulli-1',
  url: 'https://tautulli.example.com:8181',
  apiKey: 'tautulli-key',
  name: 'Test Tautulli',
  isActive: true,
  publicUrl: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  ...overrides,
})

/**
 * Creates a mock Overseerr server configuration
 * @param overrides - Partial properties to override defaults
 * @returns Overseerr server config object
 */
export const makeOverseerrConfig = (overrides: any = {}) => ({
  url: 'https://overseerr.example.com:5055',
  apiKey: 'overseerr-key',
  ...overrides,
})

/**
 * Creates a mock Prisma Overseerr server record
 * @param overrides - Partial properties to override defaults
 * @returns Prisma Overseerr object
 */
export const makePrismaOverseerr = (overrides: any = {}) => ({
  id: 'overseerr-1',
  url: 'https://overseerr.example.com:5055',
  apiKey: 'overseerr-key',
  name: 'Test Overseerr',
  isActive: true,
  publicUrl: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  ...overrides,
})

// ============================================================================
// Plex API Response Builders
// ============================================================================

/**
 * Creates a mock Plex user info response
 * @param overrides - Partial properties to override defaults
 * @returns Plex user info object
 */
export const makePlexUserInfo = (overrides: any = {}) => ({
  id: 'plex-user-123',
  username: 'testuser',
  email: 'test@example.com',
  thumb: 'https://example.com/thumb.jpg',
  ...overrides,
})

/**
 * Creates a mock Tautulli user response
 * @param overrides - Partial properties to override defaults
 * @returns Tautulli user object
 */
export const makeTautulliUser = (overrides: any = {}) => ({
  user_id: '123',
  username: 'testuser',
  email: 'test@example.com',
  friendly_name: 'Test User',
  ...overrides,
})

// ============================================================================
// Activity Timeline Builders
// ============================================================================

/**
 * Creates a mock Discord command activity
 * @param overrides - Partial properties to override defaults
 * @returns DiscordCommandActivity object
 */
export const makeDiscordCommandActivity = (
  overrides: Partial<DiscordCommandActivity> = {}
): DiscordCommandActivity => ({
  type: 'discord_command',
  id: 'discord-cmd-1',
  timestamp: new Date('2024-01-15T10:00:00Z'),
  commandType: 'CHAT',
  commandName: '!assistant',
  commandArgs: 'recommend a movie',
  status: 'SUCCESS',
  responseTimeMs: 250,
  channelType: 'dm',
  ...overrides,
})

/**
 * Creates a mock Media mark activity
 * @param overrides - Partial properties to override defaults
 * @returns MediaMarkActivity object
 */
export const makeMediaMarkActivity = (
  overrides: Partial<MediaMarkActivity> = {}
): MediaMarkActivity => ({
  type: 'media_mark',
  id: 'media-mark-1',
  timestamp: new Date('2024-01-15T09:00:00Z'),
  markType: 'FINISHED_WATCHING',
  mediaType: 'MOVIE',
  title: 'The Matrix',
  year: 1999,
  seasonNumber: null,
  episodeNumber: null,
  parentTitle: null,
  markedVia: 'discord',
  ...overrides,
})

/**
 * Creates a mock user activity timeline data
 * @param overrides - Partial properties to override defaults
 * @returns UserActivityTimelineData object
 */
export const makeUserActivityTimelineData = (
  overrides: Partial<UserActivityTimelineData> = {}
): UserActivityTimelineData => ({
  items: [
    makeDiscordCommandActivity(),
    makeMediaMarkActivity(),
  ],
  total: 2,
  page: 1,
  pageSize: 10,
  totalPages: 1,
  ...overrides,
})

/**
 * Creates a mock Prisma DiscordCommandLog record
 * @param overrides - Partial properties to override defaults
 * @returns Prisma DiscordCommandLog object
 */
export const makePrismaDiscordCommandLog = (overrides: any = {}) => ({
  id: 'discord-cmd-1',
  discordUserId: 'discord-123',
  discordUsername: 'testuser',
  userId: 'user-1',
  commandType: 'CHAT',
  commandName: '!assistant',
  commandArgs: 'recommend a movie',
  channelId: 'channel-123',
  channelType: 'dm',
  guildId: null,
  status: 'SUCCESS',
  error: null,
  responseTimeMs: 250,
  startedAt: new Date('2024-01-15T10:00:00Z'),
  completedAt: new Date('2024-01-15T10:00:00Z'),
  createdAt: new Date('2024-01-15T10:00:00Z'),
  ...overrides,
})

/**
 * Creates a mock Prisma UserMediaMark record
 * @param overrides - Partial properties to override defaults
 * @returns Prisma UserMediaMark object
 */
export const makePrismaUserMediaMark = (overrides: any = {}) => ({
  id: 'media-mark-1',
  userId: 'user-1',
  mediaType: 'MOVIE',
  plexRatingKey: 'plex-123',
  radarrId: null,
  radarrTitleSlug: null,
  sonarrId: null,
  sonarrTitleSlug: null,
  title: 'The Matrix',
  year: 1999,
  seasonNumber: null,
  episodeNumber: null,
  parentTitle: null,
  markType: 'FINISHED_WATCHING',
  note: null,
  markedAt: new Date('2024-01-15T09:00:00Z'),
  markedVia: 'discord',
  discordChannelId: null,
  createdAt: new Date('2024-01-15T09:00:00Z'),
  updatedAt: new Date('2024-01-15T09:00:00Z'),
  ...overrides,
})
