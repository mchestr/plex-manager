/**
 * The seven numbers behind the Discord stat channels, read from Tautulli's
 * `get_activity` and `get_libraries`, and the server status they add up to.
 * It replaces the Windmill flow `discord_channel_status`.
 *
 * ## Status
 *
 * | `get_activity` | `get_libraries` | Status |
 * |---|---|---|
 * | ok | ok | 🟢 Online |
 * | one fails | one ok | 🟡 Degraded |
 * | fails | fails | 🔴 Offline |
 *
 * A channel whose source call failed has no value and is left alone.
 *
 * @module lib/discord/channel-stats/stats
 */

import { z } from "zod"

export const STAT_KEYS = ["status", "streams", "transcodes", "bandwidth", "movies", "shows", "episodes"] as const
export type StatKey = (typeof STAT_KEYS)[number]

export const STAT_LABELS: Record<StatKey, string> = {
  status: "Status",
  streams: "Current streams",
  transcodes: "Current transcodes",
  bandwidth: "Bandwidth",
  movies: "Movies",
  shows: "TV shows",
  episodes: "Episodes",
}

export type ServerStatus = "online" | "degraded" | "offline"

export const STATUS_EMOJI: Record<ServerStatus, string> = { online: "🟢", degraded: "🟡", offline: "🔴" }

export function serverStatus(activityOk: boolean, librariesOk: boolean): ServerStatus {
  if (activityOk && librariesOk) return "online"
  return activityOk || librariesOk ? "degraded" : "offline"
}

/** Tautulli sends counts as numbers or numeric strings, and leaves some out. */
const count = z.preprocess((value) => (value === undefined || value === null || value === "" ? 0 : value), z.coerce.number().catch(0))

export const activitySchema = z.looseObject({
  stream_count: count,
  stream_count_transcode: count,
  total_bandwidth: count,
})

export const librariesSchema = z.array(
  z.looseObject({ section_type: z.string().nullish(), count: count, child_count: count })
)

/** What a stat channel's `{value}` becomes, per stat. A stat is missing when its source call failed. */
export type StatValues = Partial<Record<StatKey, string>>

export function activityValues(activity: z.infer<typeof activitySchema>): StatValues {
  return {
    streams: String(activity.stream_count),
    transcodes: String(activity.stream_count_transcode),
    bandwidth: (activity.total_bandwidth / 1000).toFixed(1),
  }
}

export function libraryValues(libraries: z.infer<typeof librariesSchema>): StatValues {
  const sum = (type: string, field: "count" | "child_count") =>
    libraries.filter((library) => library.section_type === type).reduce((total, library) => total + library[field], 0)
  return { movies: String(sum("movie", "count")), shows: String(sum("show", "count")), episodes: String(sum("show", "child_count")) }
}
