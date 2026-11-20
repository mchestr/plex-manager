/**
 * Turns a rule into the clauses the evaluator runs (TS 3.2, TS 6.1). The
 * preview compiles the editor draft, and the run compiles the stored
 * definition, so both evaluate the same clauses (E11). Client-safe.
 *
 * ## Draft rules
 *
 * 1. A condition that fails `conditionSchema` is incomplete: it is left out,
 *    and its id goes to `incomplete`. Rule protections follow the same rule.
 * 2. A group with one complete condition acts as that condition. It keeps
 *    the group id, so the editor finds the group's own line and held-back
 *    number (UX 7.4 items 5 and 6), and its verdict is that condition's.
 * 3. A group with no complete condition is left out. Its condition ids are
 *    already in `incomplete`.
 *
 * @module lib/cleanup/engine/compile
 */

import type { CompiledClause, CompiledRule } from "@/lib/cleanup/engine/types"
import type { DraftCondition, RuleDraft } from "@/lib/validations/cleanup-draft"
import { type Condition, conditionSchema, type RuleDefinition } from "@/lib/validations/cleanup-rule"

type DraftClause = RuleDraft["conditions"][number]

/** The complete conditions of a list, and the ids of the others. */
function partition(conditions: readonly DraftCondition[], incomplete: string[]): Condition[] {
  const complete: Condition[] = []
  for (const draft of conditions) {
    const parsed = conditionSchema.safeParse(draft)
    if (parsed.success) complete.push(parsed.data)
    else incomplete.push(draft.id)
  }
  return complete
}

function compileClause(clause: DraftClause, incomplete: string[]): CompiledClause | null {
  if ("kind" in clause) {
    const conditions = partition(clause.conditions, incomplete)
    return conditions.length === 0 ? null : { kind: "group", id: clause.id, conditions }
  }
  const [condition] = partition([clause], incomplete)
  return condition ? { kind: "condition", id: condition.id, condition } : null
}

/**
 * Compiles what the editor holds before Save. Never throws: a value that
 * does not parse only makes its condition incomplete.
 */
export function compileDraft(draft: RuleDraft): CompiledRule {
  const incomplete: string[] = []
  const clauses: CompiledClause[] = []
  for (const clause of draft.conditions) {
    const compiled = compileClause(clause, incomplete)
    if (compiled) clauses.push(compiled)
  }
  const protections = partition(draft.protections, incomplete)
  return { scope: { level: draft.level, libraries: [...draft.libraries] }, clauses, protections, incomplete, then: { ...draft.then } }
}

/** Compiles a stored definition, which `ruleDefinitionSchema` already checked: nothing is incomplete. */
export function compileDefinition(def: RuleDefinition): CompiledRule {
  const clauses = def.conditions.map((clause): CompiledClause =>
    "kind" in clause
      ? { kind: "group", id: clause.id, conditions: [...clause.conditions] }
      : { kind: "condition", id: clause.id, condition: clause },
  )
  return {
    scope: { level: def.level, libraries: [...def.libraries] },
    clauses,
    protections: [...def.protections],
    incomplete: [],
    then: { ...def.then },
  }
}

/** The condition with this id: a top-level condition, a group member or a rule protection. */
export function findCondition(compiled: CompiledRule, id: string): Condition | null {
  for (const clause of compiled.clauses) {
    if (clause.kind === "condition") {
      if (clause.condition.id === id) return clause.condition
    } else {
      const member = clause.conditions.find((c) => c.id === id)
      if (member) return member
    }
  }
  return compiled.protections.find((p) => p.id === id) ?? null
}

/**
 * The same rule with one condition replaced (the Try value of TS 6.5). The
 * id names a top-level condition, a group member or a rule protection. An
 * unknown id gives the rule unchanged.
 */
export function replaceCondition(compiled: CompiledRule, next: Condition): CompiledRule {
  const swap = (c: Condition) => (c.id === next.id ? next : c)
  const clauses = compiled.clauses.map((clause): CompiledClause =>
    clause.kind === "condition"
      ? { ...clause, condition: swap(clause.condition) }
      : { ...clause, conditions: clause.conditions.map(swap) },
  )
  return { ...compiled, clauses, protections: compiled.protections.map(swap) }
}
