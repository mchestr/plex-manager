/**
 * The recipe Sheet's live result (TS 10.5 `RecipePreview`, UX 4.2.2): the
 * recipe built with its values at a level it offers, evaluated on the
 * newest snapshot, with a match count for each chip of each key. A chip
 * count replaces only that key's value. The grace key has no counts. A
 * two-level recipe previews at the asked level, so each segment of the
 * level choice can hold its own count. Server-only.
 *
 * @module lib/cleanup/preview/recipe-preview
 */

import "server-only"

import type { z } from "zod"

import { describeRule } from "@/lib/cleanup/describe"
import { classify } from "@/lib/cleanup/engine/classify"
import { compileDefinition } from "@/lib/cleanup/engine/compile"
import { evaluateRule } from "@/lib/cleanup/engine/evaluate"
import { matchTotals } from "@/lib/cleanup/engine/near-miss"
import { GLOBAL_LEVELS, isGlobalEnabled } from "@/lib/cleanup/engine/protections"
import { ruleStats } from "@/lib/cleanup/engine/stats"
import type { EvalContext, GlobalProtectionId } from "@/lib/cleanup/engine/types"
import { whyText } from "@/lib/cleanup/engine/why-text"
import { conditionSentence } from "@/lib/cleanup/fields/sentence"
import { describeContext, memberWords } from "@/lib/cleanup/preview/draft"
import { type LevelData, loadContext, loadLevel } from "@/lib/cleanup/preview/load"
import { largestMatches } from "@/lib/cleanup/preview/results"
import { itemRef } from "@/lib/cleanup/preview/rows"
import { zeroWarning } from "@/lib/cleanup/preview/warnings"
import { getRecipe, type Recipe, recipeLevel, recipeNeeds, type RecipeValues, recipeValueLabel, recipeValuesSchema } from "@/lib/cleanup/recipes"
import type { SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { PresetCount, RecipePreview } from "@/lib/cleanup/types/preview"
import type { previewRecipeInput } from "@/lib/validations/cleanup-actions"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"
import type { Level, Service } from "@/lib/validations/cleanup-vocabulary"

export type RecipePreviewInput = z.output<typeof previewRecipeInput>

const iso = (seconds: number | null) => (seconds === null ? null : new Date(seconds * 1000).toISOString())

/** A service that every source row marks `notConfigured`. */
const notSetUp = (service: Service, sources: readonly SourceStatus[]) =>
  sources.some((s) => s.service === service) && sources.every((s) => s.service !== service || s.state === "notConfigured")

/** The global protections that are on and apply at `level` (TS 5.3). */
const globalsOn = (level: Level, options: CleanupOptions) =>
  (Object.keys(GLOBAL_LEVELS) as GlobalProtectionId[]).filter((id) => GLOBAL_LEVELS[id].includes(level) && isGlobalEnabled(id, options)).length

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

/** The row sentence of a top-level clause; an any-of group joins its rows, as the editor's clause labels do. */
function clauseSentence(definition: RuleDefinition, id: string): string | null {
  const clause = definition.conditions.find((c) => c.id === id)
  if (!clause) return null
  return "kind" in clause ? `Any of: ${clause.conditions.map((c) => lowerFirst(conditionSentence(c))).join(", or ")}` : conditionSentence(clause)
}

export interface RecipeCoreInput {
  recipe: Recipe
  values: RecipeValues
  level: Level
  /** Null: no library data yet. */
  data: LevelData | null
  ctx: EvalContext
}

/** The recipe preview on loaded data. Pure. */
export function recipePreview({ recipe, values, level, data, ctx }: RecipeCoreInput): RecipePreview {
  const facts = data?.header.facts
  const rctx = { options: ctx.options, libraries: facts?.libraries ?? [] }
  const items = data?.items ?? []
  const definition = recipe.build(values, level, rctx)
  const compiled = compileDefinition(definition)
  const results = evaluateRule(compiled, items, ctx)
  const entries = results.map((result) => ({ result, classification: classify(result) }))
  const stats = ruleStats(compiled, results, entries.map((e) => e.classification))
  const chips: Record<string, PresetCount[]> = {}
  for (const key of recipe.keys) {
    if (key.field === "grace") continue
    chips[key.key] = key.chips.map((chip) => ({
      value: chip,
      label: recipeValueLabel(key, chip),
      matches: matchTotals(compileDefinition(recipe.build({ ...values, [key.key]: chip }, level, rctx)), items, ctx).matches,
    }))
  }
  const why = { compiled, ctx, words: memberWords(ctx.live), sources: data?.header.sources ?? [] }
  const zero = zeroWarning({ compiled, results, stats })
  const zeroSentence = zero ? clauseSentence(definition, zero.conditionId) : null
  return {
    recipeId: recipe.id,
    level,
    checked: stats.checked,
    matches: stats.matches,
    bytes: String(stats.bytes),
    chips,
    largest: largestMatches(entries, 6).map((e) => ({ ...itemRef(e.result.item), why: whyText(e.result, e.classification, why) })),
    protectedCount: stats.protectedAll,
    globalProtections: globalsOn(level, ctx.options),
    zero: zero && zeroSentence !== null
      ? { conditionId: zero.conditionId, sentence: zeroSentence, leaves: zero.leaves, of: zero.of, largestBytes: zero.largestBytes } : null,
    sentence: describeRule(definition, describeContext(rctx.libraries, ctx.live, null)),
    historyStart: iso(facts?.history.startAt ?? null),
    takenAt: facts?.takenAt ?? null,
    needs: data ? recipeNeeds(recipe, level).filter((service) => notSetUp(service, data.header.sources)) : [],
  }
}

export type RecipePreviewResult = { ok: true; data: RecipePreview } | { ok: false; error: z.ZodError }

/** `previewCleanupRecipe`: the values must pass the recipe's own schema (TS 6.10). */
export async function runRecipePreview(input: RecipePreviewInput, { now = new Date() }: { now?: Date } = {}): Promise<RecipePreviewResult> {
  const recipe = getRecipe(input.recipeId)
  const parsed = recipeValuesSchema(recipe).safeParse(input.values)
  if (!parsed.success) return { ok: false, error: parsed.error }
  const level = recipeLevel(recipe, input.level)
  const data = await loadLevel(level)
  const { ctx } = await loadContext(data?.header ?? null, data?.shows ?? [], now)
  return { ok: true, data: recipePreview({ recipe, values: parsed.data, level, data, ctx }) }
}
