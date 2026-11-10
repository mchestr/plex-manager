/**
 * The start of the rule editor (TS 10.4, UX 4.2.2, 4.3.9): a saved rule, a
 * recipe with key values and a level, or a blank rule of a level. Pure and
 * client-safe.
 *
 * 1. A recipe start parses its values with the recipe's own schema. A value
 *    that does not parse (a hand-edited URL) takes the key's default, and the
 *    other values stay. A level the recipe does not offer builds its first
 *    level. The name is the recipe name.
 * 2. A blank start (UX 8.2 "Blank card"): one condition, Added more than 90
 *    days ago, every library of the level in scope, and the Settings
 *    defaults for the grace period and the import list exclusion. The name is
 *    "New rule".
 *
 * The create action adds " 2", " 3" to a name that exists (TS 10.3 step 4).
 *
 * @module lib/cleanup/screens/editor/start
 */

import type { RecipeId } from "@/lib/cleanup/constants"
import { fieldMeta } from "@/lib/cleanup/fields/catalog"
import { definitionOf } from "@/lib/cleanup/recipes/build"
import { getRecipe, type RecipeContext, recipeLevel, type RecipeValues, recipeValuesSchema } from "@/lib/cleanup/recipes"
import type { RuleDraft } from "@/lib/validations/cleanup-draft"
import type { ConditionOf } from "@/lib/validations/cleanup-rule"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

/** The three starts of `getCleanupRuleEditor` (TS 10.4). */
export type CleanupEditorInput =
  | { ruleId: string }
  | { recipe: RecipeId; values?: Readonly<Record<string, unknown>>; level?: Level | null }
  | { level: Level }

/** The name of a blank start (TS 10.3 step 4). */
export const BLANK_RULE_NAME = "New rule"

export interface EditorStart {
  name: string
  definition: RuleDraft
}

/** The recipe's values from raw input: the values that parse, and the defaults for the rest. */
export function recipeValuesOf(recipeId: RecipeId, raw: Readonly<Record<string, unknown>>): RecipeValues {
  const schema = recipeValuesSchema(getRecipe(recipeId))
  const first = schema.safeParse(raw)
  if (first.success) return first.data
  const bad = new Set(first.error.issues.map((issue) => String(issue.path[0])))
  return schema.parse(Object.fromEntries(Object.entries(raw).filter(([key]) => !bad.has(key))))
}

/** A recipe start: the recipe's definition with the parsed values at the asked level. */
export function recipeStart(input: { recipe: RecipeId; values?: Readonly<Record<string, unknown>>; level?: Level | null }, ctx: RecipeContext): EditorStart {
  const recipe = getRecipe(input.recipe)
  const level = recipeLevel(recipe, input.level)
  return { name: recipe.name, definition: recipe.build(recipeValuesOf(input.recipe, input.values ?? {}), level, ctx) }
}

/** A blank start of `level`. */
export function blankStart(level: Level, ctx: RecipeContext): EditorStart {
  const added: ConditionOf<"library.added"> = { id: "c1", field: "library.added", ...fieldMeta("library.added").defaultCondition(level) }
  return { name: BLANK_RULE_NAME, definition: definitionOf(level, [added], {}, ctx) }
}
