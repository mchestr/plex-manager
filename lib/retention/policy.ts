/**
 * The retention windows of the content tables (P11.14, GAP-35).
 *
 * Each window is a number of days with a default, overridable by its
 * `RETENTION_<NAME>_DAYS` variable (`lib/env.ts`), never below
 * {@link MIN_RETENTION_DAYS}. Two rules have no window in days: parked
 * Discord selections go when they expire, and a replaced Rewind
 * (`RewindGeneration.previousData`) is kept until 30 June after its season
 * (design 7.9). `docs/privacy.md` states the same windows, and the daily sweep
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
  /** What the window covers, for the admin Privacy section. */
  label: string
  /** What happens when it passes. */
  effect: string
}

/** The windows in days, in the order the sweep and the Privacy section list them. @internal */
export const RETENTION_WINDOWS = {
  rewindLlmText: { env: "RETENTION_REWIND_LLM_TEXT_DAYS", days: 120, label: "Rewind AI prompts and replies", effect: "Text removed; tokens, cost and model kept" },
  assistantLlmText: { env: "RETENTION_ASSISTANT_LLM_TEXT_DAYS", days: 90, label: "Assistant prompts and replies", effect: "Text removed; tokens, cost and model kept" },
  assistantChats: { env: "RETENTION_ASSISTANT_CHAT_DAYS", days: 90, label: "Assistant page history", effect: "Messages and title removed once idle, and the conversation ended" },
  chatConversations: { env: "RETENTION_CHAT_CONVERSATION_DAYS", days: 180, label: "Ended assistant conversations", effect: "Deleted, counted from when they ended" },
  discordChatMessages: { env: "RETENTION_DISCORD_CHAT_MESSAGES_DAYS", days: 1, label: "Discord chat turns", effect: "Emptied once the chat is idle" },
  discordChatSessions: { env: "RETENTION_DISCORD_CHAT_SESSION_DAYS", days: 30, label: "Discord chat sessions", effect: "Deleted once idle, and their conversation ended" },
  discordCommandArgs: { env: "RETENTION_DISCORD_COMMAND_ARGS_DAYS", days: 7, label: "Discord command arguments", effect: "Arguments removed" },
  discordCommandLog: { env: "RETENTION_DISCORD_COMMAND_LOG_DAYS", days: 90, label: "Discord command log", effect: "Deleted" },
  shareVisitDays: { env: "RETENTION_SHARE_VISITS_DAYS", days: 90, label: "Rewind share-link visit counts", effect: "Deleted" },
  rewindViews: { env: "RETENTION_REWIND_VIEW_DAYS", days: 120, label: "Rewind reading records", effect: "Deleted" },
  watchlistRemoved: { env: "RETENTION_WATCHLIST_REMOVED_DAYS", days: 30, label: "Titles removed from a watchlist", effect: "Deleted from sync history" },
  discordOAuthStates: { env: "RETENTION_DISCORD_OAUTH_STATE_DAYS", days: 1, label: "Expired Discord link attempts", effect: "Deleted, counted from expiry" },
  auditLog: { env: "RETENTION_AUDIT_LOG_DAYS", days: 400, label: "Audit log", effect: "Deleted" },
} as const satisfies Record<string, WindowDef>

export type RetentionWindow = keyof typeof RETENTION_WINDOWS

/** Every rule the sweep runs: the windows plus the two without a window in days. */
export const RETENTION_RULES = [
  ...(Object.keys(RETENTION_WINDOWS) as RetentionWindow[]),
  "discordPendingSelections",
  "rewindPreviousData",
] as const

export type RetentionRule = (typeof RETENTION_RULES)[number]

/** A rule as the admin Privacy section shows it. */
export interface RetentionPolicyRow {
  rule: RetentionRule
  label: string
  /** "120 days", "When it expires" or "Until 30 June after its season". */
  keptFor: string
  effect: string
}

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

/** Every rule with its window, for the admin Privacy section. */
export function retentionPolicy(days: Record<RetentionWindow, number> = retentionDays()): RetentionPolicyRow[] {
  const windows = (Object.keys(RETENTION_WINDOWS) as RetentionWindow[]).map((rule) => ({
    rule,
    label: RETENTION_WINDOWS[rule].label,
    keptFor: `${days[rule]} ${days[rule] === 1 ? "day" : "days"}`,
    effect: RETENTION_WINDOWS[rule].effect,
  }))
  return [
    ...windows,
    { rule: "discordPendingSelections", label: "Parked Discord searches", keptFor: "Until they expire", effect: "Deleted" },
    { rule: "rewindPreviousData", label: "Replaced Rewinds (for one rollback)", keptFor: "Until 30 June after the season", effect: "Removed" },
  ]
}
