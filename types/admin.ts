
export interface LlmUsageStats {
  totalTokens: number
  promptTokens: number
  completionTokens: number
  cost: number
  provider: string | null
  model: string | null
  count: number
}

export interface ShareStats {
  totalShares: number
  totalVisits: number
}

export interface AdminUserWithWrappedStats {
  id: string
  name: string | null
  email: string | null
  image: string | null
  plexUserId: string | null
  isAdmin: boolean
  createdAt: Date
  updatedAt: Date
  wrappedStatus: string | null
  wrappedGeneratedAt: Date | null
  totalWrappedCount: number
  totalShares: number
  totalVisits: number
  hasPlexAccess: boolean | null
  llmUsage: LlmUsageStats | null
  totalLlmUsage: LlmUsageStats | null
}

export interface WrappedSummary {
  id: string
  year: number
  status: string
  generatedAt: Date | null
  createdAt: Date
  shareToken: string | null
  shareVisits: number
}

export interface DiscordConnectionDetails {
  discordUserId: string
  username: string
  discriminator: string | null
  globalName: string | null
  avatar: string | null
  metadataSyncedAt: Date | null
  linkedAt: Date
  revokedAt: Date | null
  lastError: string | null
}

export interface UserDetails {
  id: string
  name: string | null
  email: string | null
  image: string | null
  plexUserId: string | null
  isAdmin: boolean
  createdAt: Date
  updatedAt: Date
  hasPlexAccess: boolean | null
  wrapped: WrappedSummary[]
  totalShares: number
  totalVisits: number
  llmUsage: LlmUsageStats | null
  discordConnection: DiscordConnectionDetails | null
}

export interface UserQueryOptions {
  year?: number
}

// Activity Timeline Types
export type DiscordCommandActivity = {
  type: "discord_command"
  id: string
  timestamp: Date
  commandType: string
  commandName: string
  commandArgs: string | null
  status: string
  responseTimeMs: number | null
  channelType: string
}

export type MediaMarkActivity = {
  type: "media_mark"
  id: string
  timestamp: Date
  markType: string
  mediaType: string
  title: string
  year: number | null
  seasonNumber: number | null
  episodeNumber: number | null
  parentTitle: string | null
  markedVia: string
}

export type UserActivityItem = DiscordCommandActivity | MediaMarkActivity

export interface UserActivityTimelineData {
  items: UserActivityItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
