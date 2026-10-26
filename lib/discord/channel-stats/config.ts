/**
 * The admin's channel-stats settings (`Config.discordStats*`): the switch, the
 * interval, and for each stat the channel to rename and its name format.
 *
 * @module lib/discord/channel-stats/config
 */

import { z } from "zod"

import { DEFAULT_FORMATS, isValidFormat } from "@/lib/discord/channel-stats/format"
import { STAT_KEYS, type StatKey } from "@/lib/discord/channel-stats/stats"

/** Discord allows two renames per channel in ten minutes, so ten is the floor. */
export const MIN_INTERVAL_MINUTES = 10
const MAX_INTERVAL_MINUTES = 1440

interface StatChannel {
  /** Empty while no channel is chosen. */
  channelId: string
  format: string
}

export type StatChannels = Record<StatKey, StatChannel>

const snowflake = z.string().regex(/^\d{17,20}$/, "A Discord channel ID has 17 to 20 digits")

const channelSchema = z.object({
  channelId: z.union([z.literal(""), snowflake]),
  format: z
    .string()
    .min(1)
    .max(100)
    .refine(isValidFormat, "Use {value} once or more, and {server} if you like; no other braces"),
})

const statChannelsSchema = z.object(Object.fromEntries(STAT_KEYS.map((key) => [key, channelSchema])) as Record<StatKey, typeof channelSchema>)

export const channelStatsSettingsSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z.number().int().min(MIN_INTERVAL_MINUTES).max(MAX_INTERVAL_MINUTES),
  channels: statChannelsSchema,
})

/** The stored channels with a default format where one is missing or no longer valid. */
export function channelsFromConfig(stored: unknown): StatChannels {
  const record = typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {}
  return Object.fromEntries(
    STAT_KEYS.map((key) => {
      const parsed = channelSchema.safeParse(record[key])
      return [key, parsed.success ? parsed.data : { channelId: "", format: DEFAULT_FORMATS[key] }]
    })
  ) as StatChannels
}
