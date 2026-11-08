/**
 * The key values of the recipes (TS 6.10, UX 5.7 and 8.3): chips, defaults
 * and labels. The default of each key is in its chips, except the grace
 * default, which comes from Settings. Client-safe.
 *
 * @module lib/cleanup/recipes/keys
 */

import type { DurationKey, NumberKey } from "@/lib/cleanup/recipes/types"
import { DEFAULT_CLEANUP_OPTIONS } from "@/lib/validations/cleanup-options"
import type { Duration } from "@/lib/validations/cleanup-rule"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

export const days = (amount: number): Duration => ({ amount, unit: "days" })
export const years = (amount: number): Duration => ({ amount, unit: "years" })

const duration = (key: string, label: string, field: DurationKey["field"]) => (chips: readonly Duration[], dflt: Duration): DurationKey =>
  ({ kind: "duration", key, label, field, chips, default: dflt })
const count = (key: string, label: string, field: NumberKey["field"]) => (chips: readonly number[], dflt: number): NumberKey =>
  ({ kind: "count", key, label, field, chips, default: dflt })

export const addedKey = duration("added", "Added more than", "library.added")
export const lastPlayedKey = duration("lastPlayed", "Last played more than", "watch.lastPlayed")
export const requestedKey = duration("requested", "Requested more than", "request.age")
export const lastEpisodeKey = duration("lastEpisode", "Last episode added more than", "show.lastEpisodeAdded")
export const playsKey = count("plays", "Plays, fewer than", "watch.plays")
export const keepNewestKey = count("keepNewest", "Keep the newest", "season.position")
export const seasonsOnDiskKey = count("seasonsOnDisk", "Seasons on disk, at least", "show.seasonsOnDisk")

/** A size key: chips and default in GB (1024³ bytes), stored as bytes. */
export const sizeKey = (chipsGb: readonly number[], defaultGb: number): NumberKey =>
  ({ kind: "bytes", key: "size", label: "Size more than", field: "file.size", chips: chipsGb.map((gb) => gb * GiB), default: defaultGb * GiB })

/** The grace key of every recipe (UX 5.7 item 5): chips 14, 30, 60, 90 days, no counts. */
export const GRACE_KEY: NumberKey = {
  kind: "days",
  key: "grace",
  label: "Keep in Leaving soon for",
  field: "grace",
  chips: [14, 30, 60, 90],
  default: DEFAULT_CLEANUP_OPTIONS.defaults.graceDays,
}

/** The common date chips of TS 6.10: 180 days, 365 days, 2 years. */
export const LONG_CHIPS: readonly Duration[] = [days(180), days(365), years(2)]
