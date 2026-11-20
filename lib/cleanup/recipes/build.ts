/**
 * What every recipe build shares (TS 6.10, UX 5.7): the key value readers,
 * the condition constructors, the default libraries and the Then settings.
 * Client-safe.
 *
 * Defaults of every recipe (UX 5.7): the level's default action, the grace
 * value or the Settings grace default, the import list exclusion from Settings
 * for a delete action (off for an unmonitor action), no rule protection, and
 * every library of the level with its arr set and `noIds` false.
 *
 * @module lib/cleanup/recipes/build
 */

import type { DurationKey, NumberKey, Recipe, RecipeContext, RecipeValues } from "@/lib/cleanup/recipes/types"
import type { SnapshotLibrary } from "@/lib/cleanup/schema/snapshot"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import { type Condition, type ConditionOf, type Duration, RULE_SCHEMA_VERSION, type RuleDefinition } from "@/lib/validations/cleanup-rule"
import { ACTIONS, LEVEL_ARR, type Level, TiB } from "@/lib/validations/cleanup-vocabulary"

/** The value of a duration key, or its default, as a new object: a definition never shares the module's key defaults. */
export function durationValue(values: RecipeValues, key: DurationKey): Duration {
  const value = values[key.key]
  const { amount, unit } = typeof value === "object" ? value : key.default
  return { amount, unit }
}

/** The value of a number key, or its default. */
export function numberValue(values: RecipeValues, key: NumberKey): number {
  const value = values[key.key]
  return typeof value === "number" ? value : key.default
}

/** The grace period: the `grace` value, else the Settings default. */
function graceDaysOf(values: RecipeValues, options: CleanupOptions): number {
  const value = values.grace
  return typeof value === "number" ? value : options.defaults.graceDays
}

/** The section ids of the level whose locations overlap the level's arr and that have external ids (at most 20). @internal */
export function defaultLibraries(level: Level, libraries: readonly SnapshotLibrary[]): string[] {
  const type = level === "movie" ? "movie" : "show"
  return libraries.filter((l) => l.type === type && l.arr === LEVEL_ARR[level] && !l.noIds).map((l) => l.sectionId).slice(0, 20)
}

/** A whole rule definition at `level` with the recipe defaults. */
export function definitionOf(level: Level, conditions: Condition[], values: RecipeValues, ctx: RecipeContext): RuleDefinition {
  const action = ACTIONS[level][0]
  return {
    schemaVersion: RULE_SCHEMA_VERSION,
    level,
    libraries: defaultLibraries(level, ctx.libraries),
    conditions,
    protections: [],
    then: {
      graceDays: graceDaysOf(values, ctx.options),
      action,
      importListExclusion: action.endsWith(".delete") && ctx.options.defaults.importListExclusion,
    },
  }
}

/** The level a recipe builds for a requested level: the level if the recipe offers it, else its first level. */
export function recipeLevel(recipe: Pick<Recipe, "levels">, level?: Level | null): Level {
  return level && recipe.levels.includes(level) ? level : recipe.levels[0]
}

/** A recipe whose `build` called with a level it does not offer builds its first level. */
export function defineRecipe(recipe: Recipe): Recipe {
  return { ...recipe, build: (values, level, ctx) => recipe.build(values, recipeLevel(recipe, level), ctx) }
}

type DatedField = "request.age" | "library.added" | "show.lastEpisodeAdded"

/** The condition constructors of the recipe tables. Ids are `c1`, `c2`, ... in table order. */
export const cond = {
  lastPlayed: (id: string, duration: Duration, orNever: boolean): ConditionOf<"watch.lastPlayed"> =>
    ({ id, field: "watch.lastPlayed", op: "moreThan", value: { duration, orNever } }),
  neverPlayed: (id: string): ConditionOf<"watch.lastPlayed"> => // `never` reads no duration; the editor default stays for a later op change
    ({ id, field: "watch.lastPlayed", op: "never", value: { duration: { amount: 365, unit: "days" }, orNever: true } }),
  moreThan: <F extends DatedField>(id: string, field: F, duration: Duration) => ({ id, field, op: "moreThan" as const, value: { duration } }),
  sizeMoreThan: (id: string, bytes: number): ConditionOf<"file.size"> =>
    ({ id, field: "file.size", op: "moreThan", value: { bytes, unit: bytes >= TiB ? "TB" : "GB" } }),
  playsFewerThan: (id: string, count: number, lastDays: number): ConditionOf<"watch.plays"> =>
    ({ id, field: "watch.plays", op: "fewerThan", value: { count, window: { kind: "last", duration: { amount: lastDays, unit: "days" } } } }),
  requestExists: (id: string, exists: boolean): ConditionOf<"request.exists"> => ({ id, field: "request.exists", op: "is", value: { exists } }),
  requesters: (id: string, did: "neverPlayed" | "allFinished"): ConditionOf<"request.requesters"> =>
    ({ id, field: "request.requesters", op: "is", value: { did } }),
  onlyFormer: (id: string): ConditionOf<"request.by"> => ({ id, field: "request.by", op: "only", value: { requesters: [{ kind: "former" }] } }),
  ended: (id: string): ConditionOf<"show.status"> => ({ id, field: "show.status", op: "is", value: { status: "ended" } }),
  seasonsAtLeast: (id: string, count: number): ConditionOf<"show.seasonsOnDisk"> =>
    ({ id, field: "show.seasonsOnDisk", op: "atLeast", value: { count } }),
  notNewest: (id: string, count: number): ConditionOf<"season.position"> => ({ id, field: "season.position", op: "notNewest", value: { count } }),
}
