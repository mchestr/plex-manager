/**
 * Creating a rule (TS 10.3 create steps 1 to 7, TS 10.2 `duplicateCleanupRule`,
 * 17.2): the recipe build, the rule limit, a free name, the row in Dry run at
 * revision 1, the audit row and the first dry run. A blank rule, a recipe
 * and a copy share {@link insertRule}. Server-only.
 *
 * @module lib/cleanup/actions/rules/create
 */

import "server-only"

import { type ActionResult, ok } from "@/lib/actions/result"
import { queueFirstDryRun } from "@/lib/cleanup/actions/rules/enqueue"
import { atRuleLimit, copyName, freeName, isNameTaken, ruleNames } from "@/lib/cleanup/actions/rules/naming"
import { invalid, revalidateRules, RULE_WORDS, type RuleActionCode, type RuleFailure } from "@/lib/cleanup/actions/rules/result"
import { checkRuleScope, leafConditions, newestLibraries, outOfScope } from "@/lib/cleanup/actions/rules/scope"
import type { RecipeId } from "@/lib/cleanup/constants"
import { getRecipe, recipeLevel, type RecipeValues, recipeValuesSchema } from "@/lib/cleanup/recipes"
import { readCleanupSettingsRow } from "@/lib/cleanup/settings"
import type { CreateCleanupRuleResult } from "@/lib/cleanup/types/actions"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { type RuleDefinition, ruleDefinitionSchema } from "@/lib/validations/cleanup-rule"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

/** How often a create takes a fresh name after another create took its name at the same moment. */
const NAME_ATTEMPTS = 3

/** Where a rule came from (`CleanupRule.origin`, TS 2.2), and what its audit row names (TS 11.1). */
export type RuleOrigin =
  | { kind: "blank" }
  | { kind: "recipe"; recipeId: RecipeId; recipeVersion: number; values: RecipeValues }
  | { kind: "duplicate"; ruleId: string }

export interface NewRule {
  /** The wanted name. A taken name gets " 2", " 3"; a copy gets " copy" first. */
  name: string
  /** The definition as stored. A copy keeps the stored JSON of its source. */
  definition: Prisma.InputJsonValue
  level: Level
  schemaVersion: number
  /** Conditions and protections, group members included, for the audit row. */
  conditions: number
  origin: RuleOrigin
}

/** The audit details of the origin (TS 11.1): ids and versions only. */
function originDetails(origin: RuleOrigin) {
  if (origin.kind === "recipe") return { origin: "recipe", recipeId: origin.recipeId, recipeVersion: origin.recipeVersion }
  if (origin.kind === "duplicate") return { origin: "duplicate", sourceRuleId: origin.ruleId }
  return { origin: "blank" }
}

/**
 * Creates the rule in Dry run (TS 10.3 create steps 4 to 7). A server holds
 * at most 50 rules. A name that another create takes at the same moment gets
 * the next free name. The dry run never fails the create (`dryRunQueued`).
 */
export async function insertRule(rule: NewRule, actorId: string): Promise<ActionResult<CreateCleanupRuleResult, RuleActionCode>> {
  for (let attempt = 1; ; attempt += 1) {
    const names = await ruleNames()
    if (atRuleLimit(names)) return invalid(RULE_WORDS.limit)
    const name = rule.origin.kind === "duplicate" ? copyName(rule.name, names) : freeName(rule.name, names)
    let ruleId: string
    try {
      const created = await prisma.cleanupRule.create({
        data: {
          name, mode: "dryRun", revision: 1, definition: rule.definition, schemaVersion: rule.schemaVersion, origin: rule.origin,
          stats: {}, turnedOnAt: null, lastDryRunAt: null, createdBy: actorId, updatedBy: actorId,
        },
        select: { id: true },
      })
      ruleId = created.id
    } catch (error) {
      if (isNameTaken(error) && attempt < NAME_ATTEMPTS) continue
      throw error
    }
    logAuditEvent(AuditEventType.CLEANUP_RULE_CREATED, actorId, { ruleId, level: rule.level, ...originDetails(rule.origin), conditions: rule.conditions })
    const dryRunQueued = await queueFirstDryRun(ruleId)
    revalidateRules()
    return ok({ ruleId, dryRunQueued })
  }
}

/** The insert of a checked definition (blank rules, and the editor's "Create rule (dry run)"). */
export const definitionRule = (name: string, definition: RuleDefinition, origin: RuleOrigin): NewRule => ({
  name, definition, level: definition.level, schemaVersion: definition.schemaVersion, conditions: leafConditions(definition).length, origin,
})

/** A recipe's values without the keys that stay unset (the grace takes the Settings default). */
const storedValues = (values: RecipeValues): RecipeValues =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined))

export interface RecipeInput {
  recipeId: RecipeId
  level?: "movie" | "show"
  values: Record<string, unknown>
}

/**
 * The rule of a recipe (TS 10.3 create steps 1 to 3, TS 6.10): the values
 * parse with the recipe's own schema, then `recipe.build(values, level,
 * { options, libraries })` on the newest snapshot, then the scope checks.
 */
export async function recipeRule(input: RecipeInput): Promise<{ ok: true; rule: NewRule } | { ok: false; failure: RuleFailure }> {
  const recipe = getRecipe(input.recipeId)
  const values = recipeValuesSchema(recipe).safeParse(input.values)
  if (!values.success) {
    const key = values.error.issues[0]?.path[0]
    return { ok: false, failure: invalid("Check the recipe values.", typeof key === "string" ? key : undefined) }
  }
  const level = recipeLevel(recipe, input.level)
  const [libraries, settings] = await Promise.all([newestLibraries(), readCleanupSettingsRow()])
  const parsed = ruleDefinitionSchema.safeParse(recipe.build(values.data, level, { options: settings.options, libraries: libraries ?? [] }))
  if (!parsed.success) return { ok: false, failure: outOfScope(level) } // a recipe build is valid but for an empty library list
  const failure = await checkRuleScope(parsed.data, libraries)
  if (failure) return { ok: false, failure }
  const origin: RuleOrigin = { kind: "recipe", recipeId: recipe.id, recipeVersion: recipe.version, values: storedValues(values.data) }
  return { ok: true, rule: definitionRule(recipe.name, parsed.data, origin) }
}
