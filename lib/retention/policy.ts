/**
 * The retention windows of the content tables (P11.14, GAP-35).
 *
 * Each window is a number of days with a default, overridable by its
 * `RETENTION_<NAME>_DAYS` variable (`lib/env.ts`), never below
 * {@link MIN_RETENTION_DAYS}. Three rules have no window in days: parked
 * Discord selections go when they expire, a replaced Rewind
 * (`RewindGeneration.previousData`) is kept until 30 June after its season
 * (design 7.9), and an expired affiliate invite loses its private label. `docs/privacy.md` states the same windows, and the daily sweep
 * (`lib/queue/jobs/retention.ts`) applies them.
 *
 * @module
 */

import "server-only"

import { getEnv } from "@/lib/env"

/** No window is shorter than one day. @internal */
export const MIN_RETENTION_DAYS = 1

type Env = ReturnType<typeof getEnv>

interface WindowDef {
  env: keyof Env & `RETENTION_${string}_DAYS`
  days: number
}

/** The windows in days, in the order the sweep runs them. @internal */
export const RETENTION_WINDOWS = {
  rewindLlmText: { env: "RETENTION_REWIND_LLM_TEXT_DAYS", days: 120 },
  assistantLlmText: { env: "RETENTION_ASSISTANT_LLM_TEXT_DAYS", days: 90 },
  assistantChats: { env: "RETENTION_ASSISTANT_CHAT_DAYS", days: 90 },
  chatConversations: { env: "RETENTION_CHAT_CONVERSATION_DAYS", days: 180 },
  discordChatMessages: { env: "RETENTION_DISCORD_CHAT_MESSAGES_DAYS", days: 1 },
  discordChatSessions: { env: "RETENTION_DISCORD_CHAT_SESSION_DAYS", days: 30 },
  discordCommandArgs: { env: "RETENTION_DISCORD_COMMAND_ARGS_DAYS", days: 7 },
  discordCommandLog: { env: "RETENTION_DISCORD_COMMAND_LOG_DAYS", days: 90 },
  shareVisitDays: { env: "RETENTION_SHARE_VISITS_DAYS", days: 90 },
  rewindViews: { env: "RETENTION_REWIND_VIEW_DAYS", days: 120 },
  watchlistRemoved: { env: "RETENTION_WATCHLIST_REMOVED_DAYS", days: 30 },
  discordOAuthStates: { env: "RETENTION_DISCORD_OAUTH_STATE_DAYS", days: 1 },
  auditLog: { env: "RETENTION_AUDIT_LOG_DAYS", days: 400 },
  affiliateApplications: { env: "RETENTION_AFFILIATE_DAYS", days: 365 },
  affiliateInvites: { env: "RETENTION_AFFILIATE_DAYS", days: 365 },
} as const satisfies Record<string, WindowDef>

export type RetentionWindow = keyof typeof RETENTION_WINDOWS

/** Every rule the sweep runs: the windows plus the three without a window in days. */
export const RETENTION_RULES = [
  ...(Object.keys(RETENTION_WINDOWS) as RetentionWindow[]),
  "discordPendingSelections",
  "rewindPreviousData",
  "affiliateInviteLabels",
] as const

export type RetentionRule = (typeof RETENTION_RULES)[number]

function parseDays(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback
  const days = Number.parseInt(raw, 10)
  return Number.isFinite(days) ? Math.max(MIN_RETENTION_DAYS, days) : fallback
}

/**
 * The windows in days, after the environment overrides.
 *
 * @example
 * ```ts
 * retentionDays({ RETENTION_AUDIT_LOG_DAYS: "30" }).auditLog // 30
 * retentionDays({ RETENTION_AUDIT_LOG_DAYS: "0" }).auditLog  // 1, the minimum
 * retentionDays({}).rewindLlmText                            // 120
 * ```
 */
export function retentionDays(env: Partial<Env> = getEnv()): Record<RetentionWindow, number> {
  const entries = (Object.keys(RETENTION_WINDOWS) as RetentionWindow[]).map((key) => {
    const def = RETENTION_WINDOWS[key]
    return [key, parseDays(env[def.env], def.days)] as const
  })
  return Object.fromEntries(entries) as Record<RetentionWindow, number>
}

/**
 * The last Rewind season whose replaced data may go: a season's previous data
 * is kept until 30 June of the following year (UTC), so on 2027-07-01 the 2026
 * season's goes.
 *
 * @example
 * ```ts
 * lastExpiredPreviousDataYear(new Date("2027-06-30T23:59:59Z")) // 2025
 * lastExpiredPreviousDataYear(new Date("2027-07-01T00:00:00Z")) // 2026
 * ```
 */
export function lastExpiredPreviousDataYear(now: Date): number {
  const year = now.getUTCFullYear()
  return now >= new Date(Date.UTC(year, 6, 1)) ? year - 1 : year - 2
}
