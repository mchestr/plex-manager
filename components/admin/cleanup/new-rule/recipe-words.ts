/**
 * The words of the New rule Sheet (UX 4.2, 8.3): the caption and the level
 * name of each recipe, its one-sentence description, the "Today" count of a
 * picker row, the unit of the "Other" editor of a key, and the line of the
 * largest matches. Client-safe.
 *
 * @module components/admin/cleanup/new-rule/recipe-words
 */

import { sizeText } from "@/components/admin/cleanup/preview/sizes"
import { itemName } from "@/components/admin/cleanup/results/view"
import type { RecipeId } from "@/lib/cleanup/constants"
import { nounWord } from "@/lib/cleanup/fields/words"
import type { Recipe, RecipeKey, RecipeValue } from "@/lib/cleanup/recipes"
import type { RecipePreview } from "@/lib/cleanup/types/preview"
import type { RecipeCardData } from "@/lib/cleanup/types/rule-parts"
import type { BoundFormat } from "@/lib/utils/format"
import { durationDays } from "@/lib/validations/cleanup-rule"
import { GiB, type Level, TiB } from "@/lib/validations/cleanup-vocabulary"

type RecipeLevel = RecipeCardData["level"]

/** The level of a recipe: one level, or "movieOrShow" for the two-level recipes. */
export const recipeLevelOf = (recipe: Pick<Recipe, "levels">): RecipeLevel =>
  recipe.levels.length > 1 ? "movieOrShow" : recipe.levels[0]

/** The caption above the recipe title (UX 8.3). */
export const RECIPE_CAPTIONS: Record<RecipeLevel, string> = {
  movie: "Recipe for movies",
  show: "Recipe for whole shows",
  season: "Recipe for seasons",
  movieOrShow: "Recipe for movies or whole shows",
}

/** The level of a picker row (UX 8.3 "Picker rows"). */
export const RECIPE_LEVEL_NAMES: Record<RecipeLevel, string> = {
  movie: "Movies",
  show: "Whole shows",
  season: "Seasons",
  movieOrShow: "Movies or whole shows",
}

/** The segments of the level choice of a two-level recipe (UX 4.2.2). */
export const LEVEL_SEGMENTS: Record<"movie" | "show", string> = { movie: "Movies", show: "Whole shows" }

/** One sentence on why each recipe is useful or safe (UX 4.2.2 "Description"). The card notes of UX 5.7 come first. */
export const RECIPE_DESCRIPTIONS: Record<RecipeId, string> = {
  "never-watched-movies": "Movies that nobody has played, added a while ago. Its matches have no plays at all, so the first batch is easy to check.",
  "big-shows-nobody-plays": "Large shows with no recent play. A few of them free the most space.",
  "movies-nobody-watches": "Movies that are not new and that nobody played for a long time.",
  "requested-never-watched": "Titles that a member asked for and then never played.",
  "requester-finished": "Titles that every member who asked for them has finished.",
  "former-members": "Titles that only former members asked for. Only plex-manager knows who left.",
  "finished-shows": "Shows that have ended, with no new episode and no recent play.",
  "old-seasons": "Older seasons that nobody plays. Each show keeps its newest seasons.",
  "nobody-asked": "Movies that nobody asked for and nobody played.",
  "big-movies": "Large movies with few plays in the last year.",
}

/** "Today: 152 movies", or "Today: 38 movies or 21 shows" for a two-level recipe. Null with no library data. */
export function todayText(card: Pick<RecipeCardData, "level" | "today">, f: BoundFormat): string | null {
  if (!card.today) return null
  const first: Level = card.level === "movieOrShow" ? "movie" : card.level
  const main = `${f.number(card.today.count)} ${nounWord(card.today.count, first)}`
  const alt = card.level === "movieOrShow" && card.today.altCount !== undefined ? ` or ${f.number(card.today.altCount)} ${nounWord(card.today.altCount, "show")}` : ""
  return `Today: ${main}${alt}`
}

/** The keys whose chips end with "Other" (UX 5.7): the durations, in days, and the size, in GB. */
export const OTHER_UNITS: Partial<Record<RecipeKey["kind"], { unit: string; min: number; max: number }>> = {
  duration: { unit: "days", min: 1, max: 3650 },
  bytes: { unit: "GB", min: 1, max: (50 * TiB) / GiB },
}

/** A key value as the number that its Other editor shows: days, or GB. */
export function otherAmount(key: RecipeKey, value: RecipeValue | undefined): number | null {
  if (value === undefined) return null
  if (typeof value !== "number") return durationDays(value)
  return key.kind === "bytes" ? Math.round(value / GiB) : value
}

/** The key value of a number typed under Other. */
export const otherValue = (key: RecipeKey, amount: number): RecipeValue =>
  key.kind === "bytes" ? amount * GiB : { amount, unit: "days" }

/** "Babylon 22.4 GB, Napoleon 17.1 GB, Empire of Light 12.9 GB and 149 more" (UX 4.2.2). */
export function largestLine(preview: Pick<RecipePreview, "largest" | "matches">): string {
  const named = preview.largest.slice(0, 3).map((item) => `${itemName(item)} ${sizeText(item.sizeBytes)}`)
  const more = preview.matches - named.length
  if (more > 0) return `${named.join(", ")} and ${more} more`
  return named.length > 1 ? `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}` : named.join("")
}
