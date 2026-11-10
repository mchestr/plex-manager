/**
 * The stored rule model of media cleanup (TS 3.2): durations, requester refs,
 * the twelve conditions, any-of groups, the Then settings and the rule
 * definition with its cross-field check. Client-safe.
 *
 * `checkDefinition` adds one issue per problem, with a stable `params.code`
 * (`CHECK_CODES`) and the id of the condition (`params.id`), which the editor
 * maps to UX copy. Mode limits (the Automatic grace period) are not checked
 * here: `saveCleanupRule` and `turnOnCleanupRule` check them (TS 10.3).
 *
 * @module lib/validations/cleanup-rule
 */

import { z } from "zod"

import {
  ACTION_IDS,
  ACTIONS,
  DURATION_UNITS,
  FIELD_LEVELS,
  type FieldId,
  GiB,
  LEVELS,
  TiB,
  UNIT_DAYS,
  UNIT_MAX,
} from "@/lib/validations/cleanup-vocabulary"

export const durationSchema = z
  .object({ amount: z.number().int().min(1), unit: z.enum(DURATION_UNITS) })
  .refine((d) => d.amount <= UNIT_MAX[d.unit], { message: "duration_range" })
export type Duration = z.infer<typeof durationSchema>
/** A duration in days: months are 30 days, years 365 (TS 4.2). */
export const durationDays = (d: Duration) => d.amount * UNIT_DAYS[d.unit]

const bytesSchema = z
  .number()
  .int()
  .min(GiB)
  .max(50 * TiB)

export const requesterRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("anyMember") }),
  z.object({ kind: z.literal("former") }),
  z.object({ kind: z.literal("inactive"), days: z.number().int().min(1).max(3650) }),
  z.object({ kind: z.literal("member"), userId: z.string().min(1).max(64) }),
])
export type RequesterRef = z.infer<typeof requesterRefSchema>

/** `c1` to `c999` are conditions, `p1` to `p999` rule protections. */
export const conditionIdSchema = z.string().regex(/^[cp][1-9]\d{0,2}$/)
/** `a1` to `a999` are any-of groups (`g1` to `g13` are the global protections). */
export const groupIdSchema = z.string().regex(/^a[1-9]\d{0,2}$/)

const base = { id: conditionIdSchema }
const dated = <F extends "request.age" | "library.added" | "show.lastEpisodeAdded">(field: F) =>
  z.object({ ...base, field: z.literal(field), op: z.enum(["moreThan", "lessThan"]), value: z.object({ duration: durationSchema }) })
const playWindow = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("total") }),
  z.object({ kind: z.literal("last"), duration: durationSchema }),
])

export const conditionSchema = z.discriminatedUnion("field", [
  z.object({
    ...base,
    field: z.literal("watch.lastPlayed"),
    op: z.enum(["moreThan", "lessThan", "never"]),
    value: z.object({ duration: durationSchema, orNever: z.boolean() }),
  }),
  z.object({
    ...base,
    field: z.literal("watch.plays"),
    op: z.enum(["fewerThan", "atLeast"]),
    value: z.object({ count: z.number().int().min(0).max(1000), window: playWindow }),
  }),
  z.object({ ...base, field: z.literal("request.exists"), op: z.literal("is"), value: z.object({ exists: z.boolean() }) }),
  dated("request.age"),
  z.object({
    ...base,
    field: z.literal("request.by"),
    op: z.enum(["anyOf", "only", "noneOf"]),
    value: z.object({ requesters: z.array(requesterRefSchema).min(1).max(50) }),
  }),
  z.object({
    ...base,
    field: z.literal("request.requesters"),
    op: z.literal("is"),
    value: z.object({ did: z.enum(["neverPlayed", "allFinished"]) }),
  }),
  dated("library.added"),
  z.object({
    ...base,
    field: z.literal("file.size"),
    op: z.enum(["moreThan", "lessThan"]),
    value: z.object({ bytes: bytesSchema, unit: z.enum(["GB", "TB"]) }),
  }),
  z.object({ ...base, field: z.literal("show.status"), op: z.literal("is"), value: z.object({ status: z.enum(["ended", "continuing"]) }) }),
  dated("show.lastEpisodeAdded"),
  z.object({
    ...base,
    field: z.literal("show.seasonsOnDisk"),
    op: z.enum(["atLeast", "fewerThan"]),
    value: z.object({ count: z.number().int().min(1).max(100) }),
  }),
  z.object({
    ...base,
    field: z.literal("season.position"),
    op: z.enum(["notNewest", "newest"]),
    value: z.object({ count: z.number().int().min(1).max(20) }),
  }),
])
export type Condition = z.infer<typeof conditionSchema>
/** The condition of one field. */
export type ConditionOf<F extends FieldId> = Extract<Condition, { field: F }>

// FIELD_IDS (cleanup-vocabulary) and the schema's fields must be the same set
type SameFields = [Condition["field"]] extends [FieldId] ? ([FieldId] extends [Condition["field"]] ? true : never) : never
const sameFields: SameFields = true
void sameFields

export const groupSchema = z.object({ id: groupIdSchema, kind: z.literal("anyOf"), conditions: z.array(conditionSchema).min(2).max(10) })

export const thenSchema = z.object({
  graceDays: z.number().int().min(1).max(3650),
  action: z.enum(ACTION_IDS),
  importListExclusion: z.boolean(),
})
export type RuleThen = z.infer<typeof thenSchema>

export const RULE_SCHEMA_VERSION = 1

/** The stable codes of `checkDefinition` (TS 3.2). @internal */
export const CHECK_CODES = ["duplicate_id", "not_applicable", "action_level", "exclusion_action", "fewer_than_zero"] as const
type CheckCode = (typeof CHECK_CODES)[number]

const ruleDefinitionObject = z.object({
  schemaVersion: z.literal(RULE_SCHEMA_VERSION),
  level: z.enum(LEVELS),
  libraries: z
    .array(z.string().regex(/^\d{1,9}$/))
    .min(1)
    .max(20),
  conditions: z.array(z.union([conditionSchema, groupSchema])).min(1).max(20),
  protections: z.array(conditionSchema).max(10),
  then: thenSchema,
})

type DefinitionShape = z.infer<typeof ruleDefinitionObject>
type Path = (string | number)[]

/** The cross-field checks of TS 3.2, one issue per problem. @internal */
export function checkDefinition(def: DefinitionShape, ctx: z.core.$RefinementCtx<DefinitionShape>): void {
  const issue = (code: CheckCode, path: Path, id?: string) =>
    ctx.addIssue({ code: "custom", message: code, path, params: id === undefined ? { code } : { code, id } })
  const seen = new Set<string>()
  const visit = (id: string, path: Path) => {
    if (seen.has(id)) issue("duplicate_id", path, id)
    seen.add(id)
  }
  const condition = (c: Condition, path: Path) => {
    visit(c.id, path)
    if (!FIELD_LEVELS[c.field].includes(def.level)) issue("not_applicable", path, c.id)
    if (c.field === "watch.plays" && c.op === "fewerThan" && c.value.count === 0) issue("fewer_than_zero", path, c.id)
  }

  def.conditions.forEach((clause, i) => {
    if ("kind" in clause) {
      visit(clause.id, ["conditions", i])
      clause.conditions.forEach((member, j) => condition(member, ["conditions", i, "conditions", j]))
    } else {
      condition(clause, ["conditions", i])
    }
  })
  def.protections.forEach((p, i) => condition(p, ["protections", i]))

  const actions: readonly string[] = ACTIONS[def.level]
  if (!actions.includes(def.then.action)) issue("action_level", ["then", "action"])
  if (def.then.importListExclusion && !def.then.action.endsWith(".delete")) issue("exclusion_action", ["then", "importListExclusion"])
}

export const ruleDefinitionSchema = ruleDefinitionObject.superRefine(checkDefinition)
export type RuleDefinition = z.infer<typeof ruleDefinitionSchema>
