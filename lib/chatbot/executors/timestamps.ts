import "server-only"

import { formatIsoWithOffset, type FormatSettings } from "@/lib/utils/format"

/**
 * The zone and locale a tool formats in when its caller passes none: UTC, so
 * a timestamp still carries an explicit offset. The assistant always passes
 * the turn's own (the member's zone in Discord, the caller's browser zone in
 * the admin chat; P11.17).
 */
export const UTC_FORMAT: FormatSettings = { timeZone: "UTC", locale: "en-US" }

/**
 * Tautulli's epoch-second fields: history rows, users, home stats and the
 * libraries table. `last_played` is not one: it is the last item's title.
 */
export const TAUTULLI_EPOCH_KEYS: ReadonlySet<string> = new Set(["date", "started", "stopped", "last_seen", "last_watch", "last_play", "last_accessed"])

/** Plex's epoch-second fields on library items and sections. */
export const PLEX_EPOCH_KEYS: ReadonlySet<string> = new Set(["addedAt", "updatedAt", "lastViewedAt", "viewedAt", "lastRatedAt", "createdAt", "scannedAt", "contentChangedAt"])

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

/** An instant with its offset ("2026-11-02T03:30:00Z", "...+01:00"). A bare date is a calendar day and is left alone. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/

/**
 * Fields that hold a calendar day sent as UTC midnight: Radarr's releases,
 * Sonarr's first and last aired days, TMDB release dates through Overseerr.
 * They become the bare day, so a viewer west of UTC never reads the day before.
 */
const CALENDAR_DAY_KEYS: ReadonlySet<string> = new Set(["inCinemas", "physicalRelease", "digitalRelease", "releaseDate", "release_date", "firstAired", "lastAired"])

/** .NET's `DateTime.MinValue` ("0001-01-01T00:00:00Z", Sonarr's and Radarr's "never added") and anything that old stays as it is. */
const EARLIEST = Date.UTC(1900, 0, 1)

function instantInZone(value: string, timeZone: string, key: string | undefined): string {
  if (!ISO_INSTANT.test(value)) return value
  if (key !== undefined && CALENDAR_DAY_KEYS.has(key)) return value.slice(0, 10)
  const ms = Date.parse(value)
  return Number.isNaN(ms) || ms < EARLIEST ? value : formatIsoWithOffset(ms, timeZone)
}

/** `airDateUtc` holding a local time reads as `airDateLocal`, so no key calls it UTC. */
const localKey = (key: string, before: unknown, after: unknown) => (typeof before === "string" && after !== before ? key.replace(/Utc$/i, "Local") : key)

function instantsInZone(value: unknown, timeZone: string, key?: string): unknown {
  if (typeof value === "string") return instantInZone(value, timeZone, key)
  if (Array.isArray(value)) return value.map((item) => instantsInZone(item, timeZone, key))
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => {
      const local = instantsInZone(child, timeZone, childKey)
      return [localKey(childKey, child, local), local]
    }),
  )
}

/**
 * A tool's JSON output with every ISO instant, at any depth, in `timeZone`
 * with its offset, so the UTC times Sonarr, Radarr, Overseerr and the job
 * queue return reach the model as local wall time, as the epochs above do.
 * A calendar day sent as UTC midnight stays the day. Output that is not JSON,
 * such as an executor's error line, is returned as it is.
 */
export function withLocalInstants(output: string, timeZone: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(output)
  } catch {
    return output
  }
  return JSON.stringify(instantsInZone(parsed, timeZone))
}
