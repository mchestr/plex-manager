import type { RoleKey } from "@/lib/permissions"
import { SubscriptionStatus } from "@/lib/generated/prisma/client"
import type { SavedSecret } from "@/lib/security/saved-secret"
import type { AuthService } from "@/types/onboarding"

/** LLM usage summed over some calls; `aggregateLlmUsage` builds one from rows. */
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
  jellyfinUserId: string | null
  /** Every linked media server, Plex first (`memberServices`, P11.10). */
  services: AuthService[]
  /** The member's own service (`primaryService`). */
  primaryService: AuthService
  isAdmin: boolean
  /** A built-in non-admin role (`lib/permissions`), or null. */
  role: RoleKey | null
  /** The Plex account that owns the configured server (`PlexServer.adminPlexUserId`). */
  isOwner: boolean
  /** Set while the account is disabled (P4.7). */
  disabledAt: Date | null
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
  exemptNote: string | null
  stripeCustomerId: string | null
}

/**
 * Whether the users list could check Plex access (P10.18): `unreachable`
 * leaves every non-owner's `hasPlexAccess` null, and the page says so instead
 * of hiding members.
 */
export interface PlexAccessCheck {
  status: "ok" | "unreachable" | "not-configured"
  checkedAt: Date
}

export interface AdminUsersList {
  users: AdminUserWithWrappedStats[]
  plexCheck: PlexAccessCheck
}

// Activity Timeline Types
export type DiscordCommandActivity = {
  type: "discord_command"
  id: string
  timestamp: Date
  commandType: string
  commandName: string
  commandArgs: string | null
  /** CHAT rows: the length of the member's message, which the log keeps instead of its text (GAP-32). */
  argsLength: number | null
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

/**
 * Non-secret view of the Stripe configuration used to determine whether the
 * feature can be enabled. Never contains raw secret values.
 */
export interface StripeConfigStatus {
  enabled: boolean
  hasSecretKey: boolean
  hasWebhookSecret: boolean
  /** The stored keys' last four for `SecretInput` (P10.20); both go only to Stripe, so no origin. */
  saved: { secretKey: SavedSecret | null; webhookSecret: SavedSecret | null }
  /** Whether `REDIS_URL` is set, so the queue that processes webhooks can run. */
  hasJobQueue: boolean
  priceIds: string[]
  librarySectionIds: number[]
}
