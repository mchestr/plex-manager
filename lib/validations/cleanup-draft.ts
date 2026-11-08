/**
 * What the rule editor holds before Save (TS 3.2): a draft whose condition
 * values can be incomplete, the save normalisation, and the stored-definition
 * parse that never throws. Client-safe.
 *
 * `compileDraft()` (lib/cleanup/engine/compile.ts) leaves out a condition that
 * fails `conditionSchema` and reports its id as incomplete.
 *
 * @module lib/validations/cleanup-draft
 */

import { z } from "zod"

import {
  conditionIdSchema,
  conditionSchema,
  groupIdSchema,
  groupSchema,
  RULE_SCHEMA_VERSION,
  type RuleDefinition,
  ruleDefinitionSchema,
  thenSchema,
} from "@/lib/validations/cleanup-rule"
import { FIELD_IDS, LEVELS } from "@/lib/validations/cleanup-vocabulary"

/** What the editor and the preview send: a condition value can be incomplete. */
export const draftConditionSchema = z.object({ id: conditionIdSchema, field: z.enum(FIELD_IDS), op: z.string().max(20), value: z.unknown() })
export type DraftCondition = z.infer<typeof draftConditionSchema>

export const draftGroupSchema = z.object({ id: groupIdSchema, kind: z.literal("anyOf"), conditions: z.array(draftConditionSchema).max(10) })
export type DraftGroup = z.infer<typeof draftGroupSchema>

export const ruleDraftSchema = z.object({
  schemaVersion: z.literal(RULE_SCHEMA_VERSION),
  level: z.enum(LEVELS),
  libraries: z.array(z.string().regex(/^\d{1,9}$/)).max(20),
  conditions: z.array(z.union([draftConditionSchema, draftGroupSchema])).max(20),
  protections: z.array(draftConditionSchema).max(10),
  then: thenSchema.partial(),
})
export type RuleDraft = z.infer<typeof ruleDraftSchema>

/**
 * One save error. `key` is the condition, group or protection id the issue
 * belongs to, else the dotted field path (`then.graceDays`, `libraries`).
 * `code` is a `CHECK_CODES` value, `duration_range`, or the Zod issue code.
 */
export interface DraftIssue {
  key: string
  code: string
  path: string
  message: string
}

export type NormaliseResult = { success: true; data: RuleDefinition } | { success: false; issues: DraftIssue[] }

type Clause = RuleDraft["conditions"][number]
type Path = readonly PropertyKey[]

const isGroup = (clause: Clause): clause is DraftGroup => "kind" in clause

function codeOf(issue: z.core.$ZodIssue): string {
  if (issue.code !== "custom") return issue.code
  const code: unknown = issue.params?.code
  return typeof code === "string" ? code : issue.message
}

/** The id an issue path points into, else the dotted path. */
function keyOf(clauses: readonly Clause[], protections: readonly { id: string }[], path: Path): string {
  const [head, index, inner, member] = path
  if (head === "conditions" && typeof index === "number" && clauses[index]) {
    const clause = clauses[index]
    if (isGroup(clause) && inner === "conditions" && typeof member === "number" && clause.conditions[member]) {
      return clause.conditions[member].id
    }
    return clause.id
  }
  if (head === "protections" && typeof index === "number" && protections[index]) return protections[index].id
  return path.map(String).join(".") || "definition"
}

/**
 * Turns a draft into a `RuleDefinition` (TS 3.2): a group with one condition
 * becomes that condition in its place, with its own id. A non-delete action
 * gets `importListExclusion: false`. Then the definition schema runs, and its
 * issues come back keyed by condition id. Never throws.
 */
export function normaliseForSave(draft: RuleDraft): NormaliseResult {
  const clauses: Clause[] = draft.conditions.map((c) => (isGroup(c) && c.conditions.length === 1 ? c.conditions[0] : c))
  const action = draft.then.action
  const then = action && !action.endsWith(".delete") ? { ...draft.then, importListExclusion: false } : draft.then
  const candidate = { ...draft, conditions: clauses, then }

  const issues: DraftIssue[] = []
  const add = (issue: z.core.$ZodIssue, prefix: Path) => {
    const path = [...prefix, ...issue.path]
    const id = issue.code === "custom" ? issue.params?.id : undefined
    issues.push({
      key: typeof id === "string" ? id : keyOf(clauses, draft.protections, path),
      code: codeOf(issue),
      path: path.map(String).join("."),
      message: issue.message,
    })
  }
  // Each clause on its own, so a bad value names its field instead of one union error
  const failed = new Set<string>()
  clauses.forEach((clause, i) => {
    const parsed = isGroup(clause) ? groupSchema.safeParse(clause) : conditionSchema.safeParse(clause)
    if (!parsed.success) {
      failed.add(`conditions.${i}`)
      parsed.error.issues.forEach((issue) => add(issue, ["conditions", i]))
    }
  })
  draft.protections.forEach((p, i) => {
    const parsed = conditionSchema.safeParse(p)
    if (!parsed.success) {
      failed.add(`protections.${i}`)
      parsed.error.issues.forEach((issue) => add(issue, ["protections", i]))
    }
  })

  const parsed = ruleDefinitionSchema.safeParse(candidate)
  if (parsed.success) return { success: true, data: parsed.data }
  for (const issue of parsed.error.issues) {
    const [head, index] = issue.path
    if (failed.has(`${String(head)}.${String(index)}`)) continue
    add(issue, [])
  }
  return { success: false, issues }
}

export type ParsedDefinition = { ok: true; definition: RuleDefinition } | { ok: false; paths: string[] }

/**
 * Parses a stored `CleanupRule.definition`. Never throws. A bad value gives the
 * issue paths only, never a value, so the caller can log it (`cleanup.rule_invalid`).
 */
export function parseRuleDefinition(raw: unknown): ParsedDefinition {
  const parsed = ruleDefinitionSchema.safeParse(raw)
  if (parsed.success) return { ok: true, definition: parsed.data }
  const paths = new Set(parsed.error.issues.map((issue) => issue.path.map(String).join(".") || "(root)"))
  return { ok: false, paths: [...paths].slice(0, 10) }
}
