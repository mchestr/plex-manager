/**
 * Recipe key values (TS 6.10): the Zod schema of a recipe's values, their URL
 * form for `/admin/cleanup/rules/new?recipe=<id>&<key>=<value>` (UX 4.2.2), the
 * chip words, the defaults and the hints. Client-safe.
 *
 * Each key accepts its field's value: a duration of `durationSchema`, a byte
 * count from 1 GB to 50 TB, or a count in the field's range. The grace period
 * takes 1 to 3650 days (`thenSchema`). A key also accepts its URL form: digits
 * for a number, `<amount><d|w|m|y>` for a duration ("180d", "2y"). A missing
 * key takes its default. A missing grace stays missing, so `build()` uses the
 * Settings default. Unknown keys are dropped.
 *
 * @module lib/cleanup/recipes/values
 */

import { z } from "zod"

import type { NumberKey, Recipe, RecipeKey, RecipeValue, RecipeValues } from "@/lib/cleanup/recipes/types"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import { durationSchema } from "@/lib/validations/cleanup-rule"
import { DURATION_UNITS, type DurationUnit, GiB, type Level, LEVEL_ARR, TiB } from "@/lib/validations/cleanup-vocabulary"

const UNIT_LETTER: Record<DurationUnit, string> = { days: "d", weeks: "w", months: "m", years: "y" }
const NUMBER_RANGE: Record<NumberKey["field"], readonly [number, number]> = {
  "file.size": [GiB, 50 * TiB],
  "watch.plays": [1, 1000], // fewerThan 0 never matches (`fewer_than_zero`)
  "show.seasonsOnDisk": [1, 100],
  "season.position": [1, 20],
  grace: [1, 3650],
}

function fromParam(value: unknown): unknown {
  if (typeof value !== "string") return value
  if (/^\d{1,15}$/.test(value)) return Number(value)
  const match = /^(\d{1,4})([dwmy])$/.exec(value)
  const unit = match ? DURATION_UNITS.find((u) => UNIT_LETTER[u] === match[2]) : undefined
  return match && unit ? { amount: Number(match[1]), unit } : value
}

function keySchema(key: RecipeKey): z.ZodType<RecipeValue | undefined> {
  if (key.kind === "duration") return z.preprocess(fromParam, durationSchema).default(() => ({ ...key.default }))
  const [min, max] = NUMBER_RANGE[key.field]
  const schema = z.preprocess(fromParam, z.number().int().min(min).max(max))
  return key.kind === "days" ? schema.optional() : schema.default(key.default)
}

/** The Zod object of a recipe's values: one entry per key (TS 6.10). */
export function recipeValuesSchema(recipe: Recipe): z.ZodType<RecipeValues> {
  return z.object(Object.fromEntries(recipe.keys.map((key) => [key.key, keySchema(key)])))
}

/** A value in its URL form: "180d", "2y", or digits. */
export function recipeValueParam(value: RecipeValue): string {
  return typeof value === "number" ? String(value) : `${value.amount}${UNIT_LETTER[value.unit]}`
}

/** The URL parameters of a set of values, for `cleanupNewRule({ recipe, values })`. */
export function recipeValueParams(values: RecipeValues): Record<string, string> {
  return Object.fromEntries(Object.entries(values).flatMap(([key, value]) => (value === undefined ? [] : [[key, recipeValueParam(value)]])))
}

const plural = (amount: number, unit: string) => `${amount} ${amount === 1 ? unit.replace(/s$/, "") : unit}`

/** The words of a chip (TS 4.2 duration and size words): "180 days", "1 year", "100 GB", "1.5 TB", "2". */
export function recipeValueLabel(key: RecipeKey, value: RecipeValue): string {
  if (typeof value !== "number") return plural(value.amount, value.unit)
  if (key.kind === "days") return plural(value, "days")
  if (key.kind !== "bytes") return String(value)
  return value >= TiB ? `${Number((value / TiB).toFixed(2))} TB` : `${Number((value / GiB).toFixed(2))} GB`
}

/** The value a key starts at: the grace default from Settings, else the key's own default. */
export function recipeKeyDefault(key: RecipeKey, options: Pick<CleanupOptions, "defaults">): RecipeValue {
  return key.field === "grace" ? options.defaults.graceDays : key.default
}

/** The hint under a key (UX 8.3), or null. */
export function recipeKeyHint(key: RecipeKey, level: Level): string | null {
  if (key.field === "grace") return "Members can keep a title during this time"
  if (key.field === "library.added") return `Uses the newer of the Plex and ${LEVEL_ARR[level] === "radarr" ? "Radarr" : "Sonarr"} dates`
  return null
}
