/**
 * The ten recipes of media cleanup (TS 6.10, UX 5.7), in gallery order. Each
 * builds a whole rule definition from its key values, at a level it offers.
 * The rule stores `origin: { kind: "recipe", recipeId, recipeVersion, values }`.
 * Client-safe. The tables live in `lib/cleanup/recipes/`.
 *
 * ```ts
 * const recipe = getRecipe("never-watched-movies")
 * const values = recipeValuesSchema(recipe).parse({ added: "365d" })
 * const definition = recipe.build(values, "movie", { options, libraries: facts.libraries })
 * ```
 *
 * @module lib/cleanup/recipes
 */

import { RECIPE_IDS, type RecipeId } from "@/lib/cleanup/constants"
import { recipeLevel } from "@/lib/cleanup/recipes/build"
import { bigMovies, moviesNobodyWatches, neverWatchedMovies, nobodyAsked } from "@/lib/cleanup/recipes/movies"
import { formerMembers, requestedNeverWatched, requesterFinished } from "@/lib/cleanup/recipes/requests"
import { bigShowsNobodyPlays, finishedShows, oldSeasons } from "@/lib/cleanup/recipes/shows"
import type { Recipe } from "@/lib/cleanup/recipes/types"
import type { SnapshotLibrary } from "@/lib/cleanup/schema/snapshot"
import { LEVEL_ARR, type Level, SERVICES, type Service } from "@/lib/validations/cleanup-vocabulary"

export type { DurationKey, NumberKey, Recipe, RecipeContext, RecipeKey, RecipeValue, RecipeValues } from "@/lib/cleanup/recipes/types"
export { defaultLibraries, recipeLevel } from "@/lib/cleanup/recipes/build"
export {
  recipeKeyDefault,
  recipeKeyHint,
  recipeValueLabel,
  recipeValueParam,
  recipeValueParams,
  recipeValuesSchema,
} from "@/lib/cleanup/recipes/values"

const BY_ID: Record<RecipeId, Recipe> = {
  "never-watched-movies": neverWatchedMovies,
  "big-shows-nobody-plays": bigShowsNobodyPlays,
  "movies-nobody-watches": moviesNobodyWatches,
  "requested-never-watched": requestedNeverWatched,
  "requester-finished": requesterFinished,
  "former-members": formerMembers,
  "finished-shows": finishedShows,
  "old-seasons": oldSeasons,
  "nobody-asked": nobodyAsked,
  "big-movies": bigMovies,
}

/** Every recipe, in gallery order (`RECIPE_IDS`). */
export const RECIPES: readonly Recipe[] = RECIPE_IDS.map((id) => BY_ID[id])

export function getRecipe(id: RecipeId): Recipe {
  return BY_ID[id]
}

/** The services a recipe needs at `level`, in `SERVICES` order: its own needs and the level's arr. */
export function recipeNeeds(recipe: Recipe, level: Level): Service[] {
  const needs = new Set<Service>([...recipe.needs, LEVEL_ARR[recipeLevel(recipe, level)]])
  return SERVICES.filter((service) => needs.has(service))
}

/** The card note of UX 5.7 for these libraries, or null. */
export function recipeNote(recipe: Recipe, libraries: readonly SnapshotLibrary[]): string | null {
  if (recipe.note === undefined) return null
  return typeof recipe.note === "string" ? recipe.note : recipe.note(libraries)
}
