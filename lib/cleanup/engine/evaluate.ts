/**
 * The verdicts of one item and of one rule (TS 6.3 steps 1 to 4). The
 * preview and the run call the same functions (E11). Client-safe.
 *
 * Every field and every global protection is called through the context
 * (deviation D1): `ctx.evals[field]` and `ctx.globals(level)`. This file
 * never imports a field file, so tests inject small stub evaluators.
 *
 * ```
 * clause     condition: the field verdict, role "condition"
 *            group:     any() of its member verdicts (Kleene, TS 6.2)
 * protection global:    its own state
 *            rule:      the field verdict, role "protection":
 *                       pass = protects, fail = clear, unknown = unknown
 * ```
 *
 * @module lib/cleanup/engine/evaluate
 */

import { any } from "@/lib/cleanup/engine/kleene"
import { ruleCoversItem } from "@/lib/cleanup/engine/scope"
import type {
  ClauseResult,
  CompiledClause,
  CompiledRule,
  EvalContext,
  FieldVerdict,
  GlobalProtectionEval,
  ItemResult,
  ProtectionResult,
  ProtectionState,
  UnknownCause,
  Verdict,
} from "@/lib/cleanup/engine/types"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { Condition } from "@/lib/validations/cleanup-rule"

const PROTECTION_STATE: Record<Verdict, ProtectionState> = { pass: "protects", fail: "clear", unknown: "unknown" }

/**
 * The calls of a field evaluator for any condition. `ctx.evals[c.field]` holds
 * the evaluator of `c.field`, which takes the conditions of that field, so a
 * call with `c` itself is safe.
 */
export interface FieldCalls {
  evaluate(item: SnapshotItem, c: Condition, ctx: EvalContext, role: "condition" | "protection"): FieldVerdict
  gap?(item: SnapshotItem, c: Condition, ctx: EvalContext): number | null
  forecast?(item: SnapshotItem, c: Condition, ctx: EvalContext): string | null
  tryValue?(item: SnapshotItem, c: Condition, ctx: EvalContext): unknown
  measure?(item: SnapshotItem, ctx: EvalContext, c?: Condition, role?: "condition" | "protection"): number | null
}

/** The evaluator of a condition's field (D1). */
export function fieldEvalOf(ctx: EvalContext, condition: Condition): FieldCalls {
  return ctx.evals[condition.field]
}

/** One condition's verdict for one item, with the cause of an unknown. */
export function conditionVerdict(condition: Condition, item: SnapshotItem, ctx: EvalContext, role: "condition" | "protection"): FieldVerdict {
  return fieldEvalOf(ctx, condition).evaluate(item, condition, ctx, role)
}

/** A result with its cause, if any. A pass or a fail keeps no cause. */
function withCause<V extends string>(id: string, verdict: V, cause: UnknownCause | undefined): { id: string; verdict: V; cause?: UnknownCause } {
  return cause === undefined || verdict !== "unknown" ? { id, verdict } : { id, verdict, cause }
}

function clauseResult(id: string, { verdict, cause }: FieldVerdict): ClauseResult {
  return withCause(id, verdict, cause)
}

/** A group passes when one member passes. An unknown group carries the cause of its first unknown member. */
function groupResult(id: string, members: readonly ClauseResult[]): ClauseResult {
  const verdict = any(members.map((m) => m.verdict))
  return withCause(id, verdict, members.find((m) => m.verdict === "unknown")?.cause)
}

function evaluateClause(clause: CompiledClause, item: SnapshotItem, ctx: EvalContext, members: Record<string, ClauseResult[]>): ClauseResult {
  if (clause.kind === "condition") return clauseResult(clause.id, conditionVerdict(clause.condition, item, ctx, "condition"))
  const list = clause.conditions.map((c) => clauseResult(c.id, conditionVerdict(c, item, ctx, "condition")))
  members[clause.id] = list
  return groupResult(clause.id, list)
}

function ruleProtection(protection: Condition, item: SnapshotItem, ctx: EvalContext): ProtectionResult {
  const { verdict, cause } = conditionVerdict(protection, item, ctx, "protection")
  return withCause(protection.id, PROTECTION_STATE[verdict], cause)
}

function globalProtection(global: GlobalProtectionEval, item: SnapshotItem, ctx: EvalContext): ProtectionResult {
  const { verdict, cause } = global.evaluate(item, ctx)
  return withCause(global.id, verdict, cause)
}

function evaluateWith(compiled: CompiledRule, item: SnapshotItem, ctx: EvalContext, globals: readonly GlobalProtectionEval[]): ItemResult {
  const members: Record<string, ClauseResult[]> = {}
  const clauses = compiled.clauses.map((clause) => evaluateClause(clause, item, ctx, members))
  const protections = [
    ...globals.map((g) => globalProtection(g, item, ctx)),
    ...compiled.protections.map((p) => ruleProtection(p, item, ctx)),
  ]
  return { item, clauses, members, protections, match: item.match }
}

/**
 * Every verdict of one item (TS 6.3): each clause (and each member of a
 * group), each enabled global protection of the rule's level, then each rule
 * protection, and the match state. It does not check the scope: see
 * `evaluateRule()`.
 */
export function evaluateItem(compiled: CompiledRule, item: SnapshotItem, ctx: EvalContext): ItemResult {
  return evaluateWith(compiled, item, ctx, ctx.globals(compiled.scope.level))
}

/**
 * The results of the items that the rule covers (`ruleCoversItem()`, E32), in
 * the order of `items`. An item of another level or library gives no result.
 */
export function evaluateRule(compiled: CompiledRule, items: readonly SnapshotItem[], ctx: EvalContext): ItemResult[] {
  const globals = ctx.globals(compiled.scope.level)
  const results: ItemResult[] = []
  for (const item of items) {
    if (ruleCoversItem(compiled.scope, item)) results.push(evaluateWith(compiled, item, ctx, globals))
  }
  return results
}
