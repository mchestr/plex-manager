/**
 * The inactivity sweep's settings row (`InactivitySettings`, one row with id
 * {@link INACTIVITY_SETTINGS_ID}). Without a row the sweep is off.
 *
 * @module lib/inactivity/settings
 */

import "server-only"

import { prisma } from "@/lib/prisma"

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
