/**
 * The inactivity sweep's settings row (`InactivitySettings`, one row with id
 * {@link INACTIVITY_SETTINGS_ID}). Without a row the sweep is off.
 *
 * @module lib/inactivity/settings
 */

import "server-only"

import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("INACTIVITY_SETTINGS")

/** The id of the one settings row; it also holds the claim of the run in progress. */
export const INACTIVITY_SETTINGS_ID = "inactivity"

/** The values before an admin saves the settings, matching the schema defaults. @internal */
export const INACTIVITY_DEFAULTS = { enabled: false, thresholdDays: 180 } as const

export interface InactivitySettingsValues {
  /** Remove Plex access from inactive members in the daily run. */
  enabled: boolean
  /** Days without a play (or since joining) before a member counts as inactive. */
  thresholdDays: number
}

/** The saved settings, or {@link INACTIVITY_DEFAULTS} when none were saved. */
export async function getInactivitySettings(): Promise<InactivitySettingsValues> {
  const row = await prisma.inactivitySettings.findUnique({
    where: { id: INACTIVITY_SETTINGS_ID },
    select: { enabled: true, thresholdDays: true },
  })
  return row ?? { ...INACTIVITY_DEFAULTS }
}

/** The warning email switch and its leads, as the settings row holds them. */
export interface InactivityWarningSettings {
  /** Email members before the run removes them; removal then waits for the last warning. */
  warningsEnabled: boolean
  /** Days before the removal date that a warning goes out, largest first. */
  warningDays: number[]
}

/** The values before an admin saves the warning settings, matching the schema defaults. @internal */
export const WARNING_DEFAULTS = { warningsEnabled: false, warningDays: [30, 7, 1] } as const

/**
 * The saved warning settings, or {@link WARNING_DEFAULTS}. The leads come
 * back as distinct whole days of 1 or more, largest first. With none left,
 * the reader takes the default leads and keeps the switch as saved: a switch
 * that is on never falls back to removal without warnings.
 */
export async function getInactivityWarnings(): Promise<InactivityWarningSettings> {
  const row = await prisma.inactivitySettings.findUnique({
    where: { id: INACTIVITY_SETTINGS_ID },
    select: { warningsEnabled: true, warningDays: true },
  })
  if (!row) return { warningsEnabled: WARNING_DEFAULTS.warningsEnabled, warningDays: [...WARNING_DEFAULTS.warningDays] }
  const warningDays = [...new Set(row.warningDays)].filter((days) => Number.isInteger(days) && days >= 1).sort((a, b) => b - a)
  if (warningDays.length > 0) return { warningsEnabled: row.warningsEnabled, warningDays }
  if (row.warningsEnabled) logger.warn("inactivity.warning_days_invalid", { fallback: WARNING_DEFAULTS.warningDays })
  return { warningsEnabled: row.warningsEnabled, warningDays: [...WARNING_DEFAULTS.warningDays] }
}
