/**
 * The Rewind settings section (design 13.2, P7.12): one schema for every
 * admin-facing Rewind flag on `Config`, shared by the section's client checks
 * and `updateRewindSettings`.
 *
 * ## Rules
 *
 * - Season dates are `MM-DD` strings that exist (`02-29` is allowed, `02-30`
 *   is not). The window may wrap the year (`12-01` to `01-31`) but may not
 *   open and close on the same day.
 * - The budget is 0 to 1,000 US dollars with at most 2 decimals.
 * - Disabled pages are only the non-core page keys of the cut list
 *   ({@link REWIND_CUT_PAGES}); the ten core pages are never accepted.
 * - Lists are de-duplicated and put in a stable order, so two saves of the
 *   same choice compare equal.
 *
 * Library ids and content ratings are checked here for shape only; the action
 * limits them to the lists Tautulli and the metadata cache know.
 *
 * @module lib/validations/rewind-settings
 */

import { z } from "zod"

const REWIND_AUDIENCES = ["admins", "all"] as const
const REWIND_LLM_MODES = ["standard", "economy", "off"] as const
export const REWIND_NOTIFY_CHANNELS = ["discord", "banner"] as const

/** The non-core page keys in cut-list order (design 13.3, the P7 header). */
export const REWIND_CUT_PAGES = [
  { key: "people", label: "People" },
  { key: "setup", label: "Setup" },
  { key: "next-year", label: "Next year" },
  { key: "next-year.picks", label: "Next year: picks" },
  { key: "next-year.returning", label: "Next year: returning shows (Sonarr)" },
  { key: "taste", label: "Taste" },
  { key: "race", label: "The race" },
  { key: "records", label: "Records" },
  { key: "requests", label: "Requests" },
  { key: "standing", label: "Standing" },
] as const

const CUT_PAGE_KEYS = REWIND_CUT_PAGES.map((page) => page.key) as [
  (typeof REWIND_CUT_PAGES)[number]["key"],
  ...(typeof REWIND_CUT_PAGES)[number]["key"][],
]

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Whether `value` is an `MM-DD` day that exists in some year. */
function isMonthDay(value: string): boolean {
  const match = /^(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const month = Number(match[1])
  const day = Number(match[2])
  return month >= 1 && month <= 12 && day >= 1 && day <= MONTH_DAYS[month - 1]
}

/** The number of days `month` (1 to 12) can have. */
export function daysInMonth(month: number): number {
  return MONTH_DAYS[month - 1] ?? 31
}

const monthDaySchema = z.string().refine(isMonthDay, { message: "Choose a date that exists (MM-DD)" })

export const rewindBudgetSchema = z
  .number({ message: "Enter a budget in US dollars" })
  .min(0, "The budget cannot be negative")
  .max(1000, "The budget can be at most 1,000 USD")
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: "Use at most 2 decimals",
  })

/** De-duplicates and orders a list by `order`, or alphabetically. */
function stableList<T extends string>(order?: readonly T[]) {
  return (values: T[]) => {
    const unique = [...new Set(values)]
    return order ? order.filter((value) => unique.includes(value)) : unique.sort()
  }
}

export const rewindSettingsSchema = z
  .object({
    rewindEnabled: z.boolean(),
    rewindAudience: z.enum(REWIND_AUDIENCES),
    rewindSeasonOpens: monthDaySchema,
    rewindSeasonCloses: monthDaySchema,
    rewindLlmMode: z.enum(REWIND_LLM_MODES),
    rewindLlmBudgetUsd: rewindBudgetSchema,
    rewindPublicLinks: z.boolean(),
    rewindPublicCounts: z.boolean(),
    rewindShowServerNameOnCards: z.boolean(),
    rewindAllowArtOnCards: z.boolean(),
    rewindExcludedSectionIds: z.array(z.string().regex(/^\d+$/, "Unknown library")).max(500).transform(stableList()),
    rewindExcludedContentRatings: z.array(z.string().trim().min(1).max(40)).max(500).transform(stableList()),
    rewindIncludeManagedUsers: z.boolean(),
    rewindDisabledPages: z.array(z.enum(CUT_PAGE_KEYS)).transform(stableList(CUT_PAGE_KEYS)),
    rewindNotifyChannels: z.array(z.enum(REWIND_NOTIFY_CHANNELS)).transform(stableList(REWIND_NOTIFY_CHANNELS)),
  })
  .refine((data) => data.rewindSeasonOpens !== data.rewindSeasonCloses, {
    message: "The season cannot open and close on the same day",
    path: ["rewindSeasonCloses"],
  })

/** @internal */
export type RewindSettingsInput = z.input<typeof rewindSettingsSchema>
export type RewindSettings = z.output<typeof rewindSettingsSchema>

/** The entries of `values` that are in neither `known` nor `kept` (what was already stored). */
export function unknownEntries(values: readonly string[], known: readonly string[], kept: readonly string[]): string[] {
  return values.filter((value) => !known.includes(value) && !kept.includes(value))
}
