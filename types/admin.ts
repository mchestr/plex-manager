import { SubscriptionStatus } from "@/lib/generated/prisma/client"

/** @internal */
export interface LlmUsageStats {
  totalTokens: number
  promptTokens: number
  completionTokens: number
  cost: number
  provider: string | null
  model: string | null
  count: number
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
  /** When the year's queued or running generation started, or null when none is active (`canRegenerate`). */
  wrappedRunStartedAt: Date | null
  totalWrappedCount: number
  totalShares: number
  totalVisits: number
  hasPlexAccess: boolean | null
  llmUsage: LlmUsageStats | null
  totalLlmUsage: LlmUsageStats | null
  subscriptionStatus: SubscriptionStatus | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  isExempt: boolean
  exemptReason: string | null
  stripeCustomerId: string | null
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

/** One keyset page of the timeline (P10.6): `nextCursor` is null on the last page. */
export interface UserActivityTimelineData {
  items: UserActivityItem[]
  total: number
  nextCursor: string | null
}
