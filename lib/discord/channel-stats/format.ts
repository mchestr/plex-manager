/**
 * Channel names from a format. A format is text with two placeholders:
 * `{server}`, the server name from the brand settings, and `{value}`, the stat
 * (an emoji for the status channel, a number for the rest). Discord allows
 * names of 1 to 100 characters.
 *
 * @example
 * ```ts
 * formatChannelName("{server} Status ({value})", { server: "MFlix", value: "🟢" }) // "MFlix Status (🟢)"
 * formatChannelName("Bandwidth: {value} Mbps", { server: "MFlix", value: "12.5" }) // "Bandwidth: 12.5 Mbps"
 * ```
 *
 * @module lib/discord/channel-stats/format
 */

import type { StatKey } from "@/lib/discord/channel-stats/stats"

/** @internal */
export const MAX_CHANNEL_NAME = 100

/** The format a channel has until an admin changes it. */
export const DEFAULT_FORMATS: Record<StatKey, string> = {
  status: "{server} Status ({value})",
  streams: "Current Streams: {value}",
  transcodes: "Current Transcodes: {value}",
  bandwidth: "Bandwidth: {value} Mbps",
  movies: "Movies: {value}",
  shows: "TV Shows: {value}",
  episodes: "Episodes: {value}",
}

/** True when the format needs `{value}` and uses no other placeholder. */
export function isValidFormat(format: string): boolean {
  const placeholders: string[] = format.match(/\{[^}]*\}/g) ?? []
  return placeholders.includes("{value}") && placeholders.every((placeholder) => placeholder === "{value}" || placeholder === "{server}")
}

export function formatChannelName(format: string, values: { server: string; value: string }): string {
  return format
    .replaceAll("{server}", () => values.server)
    .replaceAll("{value}", () => values.value)
    .trim()
    .slice(0, MAX_CHANNEL_NAME)
}
