/**
 * Rewind's P1 features (P8.3, P8.4): each behind its own flag, off until the
 * owner enables it in production.
 *
 * ## The rule
 *
 * Flags live in `Config.rewindDisabledPages`, beside the cut list's page
 * keys, so no migration is needed. A feature is on only when the list holds
 * its enable entry `+<key>` (`+race.scrubber`) and not the plain key, which
 * switches it off again. A fresh `Config` therefore has every feature off, and
 * a deploy can never switch an unchecked interaction on for every member.
 *
 * Server Components read the flags and pass booleans to the islands.
 *
 * @module lib/rewind/features
 */

/** Every P1 feature, in the order the admin settings list them. */
export const REWIND_FEATURES = [
  { key: "race.scrubber", label: "The race: scrubber and replay" },
  { key: "calendar.day-picker", label: "Calendar: Pick a day" },
  { key: "calendar.grid", label: "Calendar: keyboard grid" },
  { key: "stage.tap-completes", label: "First tap completes a count-up" },
  { key: "number.compare-2025", label: "The number: Compare with last year" },
  { key: "share.edit-card", label: "Share: Edit card" },
  { key: "share.save-all", label: "Share: Save all cards" },
  { key: "notes.core", label: "Notes for the core pages" },
] as const

export type RewindFeatureKey = (typeof REWIND_FEATURES)[number]["key"]

export const REWIND_FEATURE_KEYS = REWIND_FEATURES.map((feature) => feature.key) as RewindFeatureKey[]

/** The entries `Config.rewindDisabledPages` may hold for the features: `+key` enables, the plain key disables. */
export const REWIND_FEATURE_ENTRIES = REWIND_FEATURE_KEYS.flatMap((key) => [`+${key}`, key])

/**
 * Whether `key` is on: `+key` is stored and the plain key is not.
 *
 * @public P8.3's Server Components read their flags with it.
 *
 * @example
 * ```ts
 * rewindFeatureOn({ rewindDisabledPages: ["+race.scrubber"] }, "race.scrubber") // true
 * rewindFeatureOn({ rewindDisabledPages: ["+race.scrubber", "race.scrubber"] }, "race.scrubber") // false
 * rewindFeatureOn({ rewindDisabledPages: [] }, "race.scrubber") // false
 * ```
 */
export function rewindFeatureOn(config: { rewindDisabledPages: unknown } | null | undefined, key: RewindFeatureKey): boolean {
  const list = config?.rewindDisabledPages
  return Array.isArray(list) && list.includes(`+${key}`) && !list.includes(key)
}

/** The P8.4 flags the issue's islands read, as booleans. */
export interface RewindFeatureFlags {
  compare2025: boolean
  editCard: boolean
  saveAll: boolean
  coreNotes: boolean
}

/** @internal Tests build issues with it. */
export const NO_REWIND_FEATURES: RewindFeatureFlags = { compare2025: false, editCard: false, saveAll: false, coreNotes: false }

/** The P8.4 flags of a stored `Config`. */
export function rewindFeatureFlags(config: { rewindDisabledPages: unknown } | null | undefined): RewindFeatureFlags {
  return {
    compare2025: rewindFeatureOn(config, "number.compare-2025"),
    editCard: rewindFeatureOn(config, "share.edit-card"),
    saveAll: rewindFeatureOn(config, "share.save-all"),
    coreNotes: rewindFeatureOn(config, "notes.core"),
  }
}

/**
 * `list` with the enable entries set to exactly `enabled`: every other entry
 * (page keys, and plain feature keys) is kept. What the admin switches write.
 */
export function withEnabledFeatures<T extends string>(list: readonly T[], enabled: readonly RewindFeatureKey[]): string[] {
  const kept = list.filter((entry) => !(entry.startsWith("+") && (REWIND_FEATURE_KEYS as string[]).includes(entry.slice(1))))
  return [...kept, ...enabled.map((key) => `+${key}`)]
}

/** The features `list` enables (whether or not a plain key switches them off again). */
export function enabledFeatures(list: readonly string[]): RewindFeatureKey[] {
  return REWIND_FEATURE_KEYS.filter((key) => list.includes(`+${key}`))
}
