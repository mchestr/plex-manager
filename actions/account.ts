"use server"

/**
 * The member's own settings on `/account` (ui-design-system 6.1): the Rewind
 * ready notification (Rewind 9.7) and the time zone Rewind reads (7.7), which
 * the member layout first takes from the browser.
 *
 * None needs an active membership, so a lapsed member can still change them.
 *
 * @module actions/account
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { memberAction } from "@/lib/actions/define-action"
import { ok } from "@/lib/actions/result"
import { prisma } from "@/lib/prisma"
import { normalizeTimeZone } from "@/lib/utils/zoned-time"
import { getSeasonState } from "@/lib/wrapped/season"

/**
 * "Tell me when my Rewind is ready", stored as the current season's
 * `RewindPrefs.notify`.
 */
export const setRewindNotify = memberAction({
  input: z.strictObject({ notify: z.boolean() }),
  fallbackError: "Could not save the notification setting",
  handler: async ({ notify }, { userId }) => {
    const { seasonYear: year } = await getSeasonState()
    await prisma.rewindPrefs.upsert({
      where: { userId_year: { userId, year } },
      create: { userId, year, notify },
      update: { notify },
    })
    revalidatePath("/account")
    return ok({ notify })
  },
})

/**
 * A zone the settings can store, under its canonical IANA name
 * (`US/Pacific` becomes `America/Los_Angeles`).
 */
const timeZoneSchema = z
  .string()
  .max(64)
  .transform((value, ctx) => {
    const zone = normalizeTimeZone(value)
    if (!zone) {
      ctx.addIssue({ code: "custom", message: "Choose a time zone from the list" })
      return z.NEVER
    }
    return zone
  })

export const setUserTimezone = memberAction({
  input: z.strictObject({ timeZone: timeZoneSchema }),
  fallbackError: "Could not save the time zone",
  handler: async ({ timeZone }, { userId }) => {
    await prisma.user.update({ where: { id: userId }, data: { timezone: timeZone } })
    revalidatePath("/account")
    return ok({ timeZone })
  },
})

/**
 * Saves the browser's zone for a member who has none, so Rewind buckets
 * their plays by their own clock rather than the server's. It never replaces
 * a saved zone, so a later move or a choice on `/account` stays put.
 */
export const adoptBrowserTimezone = memberAction({
  input: z.strictObject({ timeZone: timeZoneSchema }),
  fallbackError: "Could not save the time zone",
  handler: async ({ timeZone }, { userId }) => {
    await prisma.user.updateMany({ where: { id: userId, timezone: null }, data: { timezone: timeZone } })
    return ok(null)
  },
})
