/**
 * The recipe gallery of the Rules tab (UX 4.1.1, TS 12.7 item 2): each of
 * the ten recipes in gallery order, built with its default values and
 * evaluated live on the cached snapshot. A two-level recipe shows its movie
 * count and its show count ("38 movies or 21 shows"). Pure and client-safe.
 *
 * "Needs {Service}" names the services that the recipe needs at its first
 * level and that have no active row, so it shows before the first read too.
 *
 * @module lib/cleanup/screens/overview/recipe-cards
 */

import { describeRule } from "@/lib/cleanup/describe"
import type { EvalContext, LiveFacts } from "@/lib/cleanup/engine/types"
import { describeContext } from "@/lib/cleanup/preview/draft"
import { RECIPES, type Recipe, recipeKeyDefault, recipeNeeds, recipeNote, recipeValueLabel } from "@/lib/cleanup/recipes"
import { evaluateDefinition, posterKeys } from "@/lib/cleanup/screens/overview/evaluate"
import type { LoadedSnapshot } from "@/lib/cleanup/snapshot/cache"
import type { RecipeCardData } from "@/lib/cleanup/types/rule-parts"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import type { Service } from "@/lib/validations/cleanup-vocabulary"

/** Recipe card posters (UX 4.1.1). */
export const RECIPE_POSTERS = 5

export interface RecipeCardsInput {
  snapshot: LoadedSnapshot | null
  ctx: EvalContext | null
  live: Pick<LiveFacts, "members">
  options: CleanupOptions
  setUp: ReadonlySet<Service>
}

function recipeCard(recipe: Recipe, input: RecipeCardsInput): RecipeCardData {
  const { snapshot, ctx, options } = input
  const libraries = snapshot?.header.facts.libraries ?? []
  const [level, alt] = recipe.levels
  const build = (at: typeof level) => recipe.build({}, at, { options, libraries })
  const definition = build(level)
  const evaluate = (at: typeof level) => (snapshot && ctx ? evaluateDefinition(at === level ? definition : build(at), snapshot.levels, ctx) : null)
  const main = evaluate(level)
  const other = alt ? evaluate(alt) : null
  const today = main ? { count: main.matches.length, bytes: String(main.bytes), ...(other ? { altCount: other.matches.length } : {}) } : null
  return {
    id: recipe.id,
    name: recipe.name,
    level: alt ? "movieOrShow" : level,
    sentence: describeRule(definition, describeContext(libraries, input.live, null)),
    keyValues: recipe.keys.map((key) => recipeValueLabel(key, recipeKeyDefault(key, options))),
    note: recipeNote(recipe, libraries),
    today,
    needs: recipeNeeds(recipe, level).filter((service) => !input.setUp.has(service)),
    posters: posterKeys(main, RECIPE_POSTERS),
  }
}

/** The ten recipe cards, in gallery order. `today` is null without library data. */
export function recipeCards(input: RecipeCardsInput): RecipeCardData[] {
  return RECIPES.map((recipe) => recipeCard(recipe, input))
}
