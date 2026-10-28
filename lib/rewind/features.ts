/**
 * Rewind's December features (P8.3, P8.4): each P1 interaction ships behind
 * its own flag, off until the owner checks it on the heavy test member and
 * turns it on (the P8 header's ship routine).
 *
 * ## Storage
 *
 * The flags live in `Config.rewindDisabledPages`, beside the cut-list page
 * keys, so no migration is needed. A feature is on only while the list holds
 * its enable entry `+<key>` (for example `+race.scrubber`) and not the plain
 * key, which switches it off again. A fresh `Config` therefore has every
 * feature off, and a deploy can never turn an unchecked interaction on for
 * every member.
 *
 * Server Components read the flags with {@link rewindFeatureFlags} and pass
 * booleans to the client islands.
 *
 * @module lib/rewind/features
 */

/** The December features, in the order P7.12's settings section lists them. */
export const REWIND_FEATURES = [
  { key: "race.scrubber", label: "The race: scrubber and Replay" },
  { key: "calendar.day-picker", label: "The calendar: Pick a day" },
  { key: "calendar.grid", label: "Notes calendar: arrow-key grid" },
  { key: "stage.tap-completes", label: "First tap completes a count-up" },
  { key: "number.compare-2025", label: "The number: Compare with last year" },
  { key: "share.edit-card", label: "Share: Edit card" },
  { key: "share.save-all", label: "Share: Save all cards" },
  { key: "notes.core", label: "Notes for the core pages" },
  // Not a member feature: the season open's scheduled audience switch (P8.2, lib/rewind/season-open.ts).
  { key: "season.auto-open", label: "Season open: switch the audience to Everyone at 08:00 on the opening day" },
] as const

export type RewindFeatureKey = (typeof REWIND_FEATURES)[number]["key"]

export type RewindFeatureFlags = Readonly<Record<RewindFeatureKey, boolean>>

/** The entry that turns `key` on. */
export const enableEntry = (key: RewindFeatureKey) => `+${key}` as const

/** Every entry the flags may store: each feature's `+key`, then its plain key. */
export const REWIND_FEATURE_ENTRIES = REWIND_FEATURES.flatMap(({ key }) => [enableEntry(key), key])

/** Whether `entry` (a `rewindDisabledPages` value) belongs to the feature flags rather than the cut list. */
export const isFeatureEntry = (entry: string) => (REWIND_FEATURE_ENTRIES as readonly string[]).includes(entry)

/**
 * Whether one feature is on: the stored list holds `+key` and not `key`.
 *
 * @example
 * ```ts
 * rewindFeatureOn({ rewindDisabledPages: ["+race.scrubber"] }, "race.scrubber") // true
 * rewindFeatureOn({ rewindDisabledPages: ["+race.scrubber", "race.scrubber"] }, "race.scrubber") // false
 * rewindFeatureOn(null, "race.scrubber") // false
 * ```
 *
 * Server Components read every flag at once through {@link rewindFeatureFlags}.
 */
export function rewindFeatureOn(config: { rewindDisabledPages: unknown } | null | undefined, key: RewindFeatureKey): boolean {
  const entries = config?.rewindDisabledPages
  return Array.isArray(entries) && entries.includes(enableEntry(key)) && !entries.includes(key)
}

/** Every feature's flag, for the Server Components that pass them to the islands. */
export function rewindFeatureFlags(config: { rewindDisabledPages: unknown } | null | undefined): RewindFeatureFlags {
  return Object.fromEntries(REWIND_FEATURES.map(({ key }) => [key, rewindFeatureOn(config, key)])) as Record<RewindFeatureKey, boolean>
}
