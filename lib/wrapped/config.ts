/**
 * Rewind's reading of the `Config` row.
 *
 * @module lib/wrapped/config
 */

import { DISABLED_LIST_ENTRIES, REWIND_NOTIFY_CHANNELS, type RewindSettings } from "@/lib/validations/rewind-settings"
import { excludedSectionIdsSchema } from "@/lib/wrapped/sources/schemas"

export type RewindLlmMode = "standard" | "economy" | "off"

/**
 * The LLM mode Rewind runs with: `off` whenever `Config.llmDisabled` is on
 * (template copy everywhere), otherwise `rewindLlmMode`; an unknown stored
 * value reads as `standard`, the column default.
 *
 * @example
 * ```ts
 * effectiveRewindLlmMode({ llmDisabled: true, rewindLlmMode: "standard" }) // "off"
 * effectiveRewindLlmMode({ llmDisabled: false, rewindLlmMode: "economy" }) // "economy"
 * ```
 */
export function effectiveRewindLlmMode(config: { llmDisabled: boolean; rewindLlmMode: string }): RewindLlmMode {
  if (config.llmDisabled) return "off"
  const mode = config.rewindLlmMode
  return mode === "economy" || mode === "off" ? mode : "standard"
}

/** The `Config` columns the Rewind settings section edits. */
export const REWIND_SETTINGS_SELECT = {
  rewindEnabled: true,
  rewindAudience: true,
  rewindSeasonOpens: true,
  rewindSeasonCloses: true,
  rewindLlmMode: true,
  rewindLlmBudgetUsd: true,
  rewindPublicLinks: true,
  rewindPublicCounts: true,
  rewindShowServerNameOnCards: true,
  rewindAllowArtOnCards: true,
  rewindExcludedSectionIds: true,
  rewindExcludedContentRatings: true,
  rewindIncludeManagedUsers: true,
  rewindDisabledPages: true,
  rewindNotifyChannels: true,
} as const

/** A `Config` row read with {@link REWIND_SETTINGS_SELECT}; the budget is a Prisma `Decimal`. */
export interface RewindSettingsRow {
  rewindEnabled: boolean
  rewindAudience: string
  rewindSeasonOpens: string
  rewindSeasonCloses: string
  rewindLlmMode: string
  rewindLlmBudgetUsd: { toString(): string } | number
  rewindPublicLinks: boolean
  rewindPublicCounts: boolean
  rewindShowServerNameOnCards: boolean
  rewindAllowArtOnCards: boolean
  rewindExcludedSectionIds: unknown
  rewindExcludedContentRatings: unknown
  rewindIncludeManagedUsers: boolean
  rewindDisabledPages: unknown
  rewindNotifyChannels: unknown
}

/** The entries of `allowed` that `value` (a stored JSON list) holds, in `allowed`'s order. */
function pick<T extends string>(allowed: readonly T[], value: unknown): T[] {
  return Array.isArray(value) ? allowed.filter((entry) => value.includes(entry)) : []
}

function sortedStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort()
}

/**
 * The stored Rewind settings in the section's shape: lists de-duplicated and
 * ordered as `rewindSettingsSchema` orders them, unknown page keys and
 * channels dropped, and an unknown audience or mode read as the default.
 */
export function rewindSettingsFromConfig(row: RewindSettingsRow): RewindSettings {
  const ratings = Array.isArray(row.rewindExcludedContentRatings)
    ? row.rewindExcludedContentRatings.filter((value): value is string => typeof value === "string")
    : []
  return {
    rewindEnabled: row.rewindEnabled,
    rewindAudience: row.rewindAudience === "all" ? "all" : "admins",
    rewindSeasonOpens: row.rewindSeasonOpens,
    rewindSeasonCloses: row.rewindSeasonCloses,
    rewindLlmMode: effectiveRewindLlmMode({ llmDisabled: false, rewindLlmMode: row.rewindLlmMode }),
    rewindLlmBudgetUsd: Number(row.rewindLlmBudgetUsd.toString()),
    rewindPublicLinks: row.rewindPublicLinks,
    rewindPublicCounts: row.rewindPublicCounts,
    rewindShowServerNameOnCards: row.rewindShowServerNameOnCards,
    rewindAllowArtOnCards: row.rewindAllowArtOnCards,
    rewindExcludedSectionIds: sortedStrings(excludedSectionIdsSchema.parse(row.rewindExcludedSectionIds ?? null)),
    rewindExcludedContentRatings: sortedStrings(ratings),
    rewindIncludeManagedUsers: row.rewindIncludeManagedUsers,
    rewindDisabledPages: pick(DISABLED_LIST_ENTRIES, row.rewindDisabledPages),
    rewindNotifyChannels: pick(REWIND_NOTIFY_CHANNELS, row.rewindNotifyChannels),
  }
}
