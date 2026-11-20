/**
 * The shape of a recipe (TS 6.10): a named rule start with key values that
 * the recipe Sheet shows as chips (UX 4.2.2, 5.7). Types only, client-safe.
 *
 * A chip value is a `Duration`, a byte count or a count. The grace key
 * (`grace`) is a number of days, and its default is the Settings default
 * (`options.defaults.graceDays`, `recipeKeyDefault()`).
 *
 * @module lib/cleanup/recipes/types
 */

import type { RecipeId } from "@/lib/cleanup/constants"
import type { SnapshotLibrary } from "@/lib/cleanup/schema/snapshot"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import type { Duration, RuleDefinition } from "@/lib/validations/cleanup-rule"
import type { Level, Service } from "@/lib/validations/cleanup-vocabulary"

export type RecipeValue = Duration | number
/** Parsed key values by key. A missing key takes its default. */
export type RecipeValues = Partial<Record<string, RecipeValue>>

interface KeyBase {
  /** The URL parameter and the `values` key ("added", "lastPlayed", "grace"). */
  key: string
  /** The chip group label (UX 8.3): "Added more than". */
  label: string
}

/** A key of a date field: chips of durations. */
export interface DurationKey extends KeyBase {
  kind: "duration"
  field: "watch.lastPlayed" | "request.age" | "library.added" | "show.lastEpisodeAdded"
  chips: readonly Duration[]
  default: Duration
}

/** A key of bytes (`file.size`), of a count, or the grace period in days. */
export interface NumberKey extends KeyBase {
  kind: "bytes" | "count" | "days"
  field: "file.size" | "watch.plays" | "show.seasonsOnDisk" | "season.position" | "grace"
  chips: readonly number[]
  default: number
}

export type RecipeKey = DurationKey | NumberKey

export interface RecipeContext {
  options: CleanupOptions
  /** `facts.libraries` of the newest snapshot: the default libraries (TS 6.10). */
  libraries: readonly SnapshotLibrary[]
}

export interface Recipe {
  id: RecipeId
  /** Stored in the rule's `origin`. A later version never changes a saved rule. */
  version: 1
  /** UX 5.7. */
  name: string
  /** The levels it offers. Two-level recipes offer movies and whole shows. */
  levels: readonly Level[]
  /** In Sheet order. The grace key is last. */
  keys: readonly RecipeKey[]
  /** The definition at `level`, a level of `levels` (another level builds the first one). Validate it before a save. */
  build(values: RecipeValues, level: Level, ctx: RecipeContext): RuleDefinition
  /** The services every level needs. `recipeNeeds()` adds the arr of a two-level recipe's level. */
  needs: readonly Service[]
  /** The card note of UX 5.7. A function reads the library sizes. */
  note?: string | ((libraries: readonly SnapshotLibrary[]) => string)
}
