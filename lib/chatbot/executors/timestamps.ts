import "server-only"

import { formatIsoWithOffset, type FormatSettings } from "@/lib/utils/format"

/**
 * The zone and locale a tool formats in when its caller passes none: UTC, so
 * a timestamp still carries an explicit offset. The assistant always passes
 * the turn's own (the member's zone in Discord, the server zone in the admin
 * chat; P11.17).
 */
export const UTC_FORMAT: FormatSettings = { timeZone: "UTC", locale: "en-US" }

/** Tautulli's epoch-second fields: history rows, users and home stats. */
export const TAUTULLI_EPOCH_KEYS: ReadonlySet<string> = new Set(["date", "started", "stopped", "last_seen", "last_watch", "last_play", "last_played"])

/** Plex's epoch-second fields on library items. */
export const PLEX_EPOCH_KEYS: ReadonlySet<string> = new Set(["addedAt", "updatedAt", "lastViewedAt", "viewedAt", "lastRatedAt"])

function epochSeconds(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * Replaces epoch seconds under `keys`, at any depth, with ISO strings in
 * `timeZone` that carry the offset ("2026-11-01T19:30:00-08:00"), so the
 * model reads local wall time and never converts from UTC itself (GAP-44).
 * Anything else, including a zero or non-numeric value, is left as it is.
 */
export function withLocalTimestamps(value: unknown, keys: ReadonlySet<string>, timeZone: string): unknown {
  if (Array.isArray(value)) return value.map((item) => withLocalTimestamps(item, keys, timeZone))
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => {
      const seconds = keys.has(key) ? epochSeconds(child) : undefined
      return [key, seconds === undefined ? withLocalTimestamps(child, keys, timeZone) : formatIsoWithOffset(seconds * 1000, timeZone)]
    }),
  )
}
