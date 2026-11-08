/**
 * The types of the rule engine (TS 4.1, 5.2, 6.1 and 6.3): the field
 * catalogue and evaluator shapes, the evaluation context, the live facts,
 * the compiled rule and the result of one item. Types only, client-safe.
 *
 * Deviation D1: `EvalContext` carries the field evaluators (`evals`) and the
 * global protections (`globals(level)`), which `buildEvalContext()`
 * (lib/cleanup/engine/context.ts) fills. The evaluator calls fields only
 * through them, so tests inject small stubs
 * (lib/cleanup/__tests__/helpers/builders.ts).
 *
 * @module lib/cleanup/engine/types
 */

import type { MatchCause, SnapshotItem, SnapshotUser, SourceState } from "@/lib/cleanup/schema/snapshot"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import type { Condition, ConditionOf, RuleThen } from "@/lib/validations/cleanup-rule"
import type { FieldId, Level, Service } from "@/lib/validations/cleanup-vocabulary"

export type Verdict = "pass" | "fail" | "unknown"
export type OperatorId = "moreThan" | "lessThan" | "never" | "fewerThan" | "atLeast" | "is" | "anyOf" | "only" | "noneOf" | "notNewest" | "newest"
export type FieldGroup = "watching" | "requests" | "library" | "showsSeasons"

/** One part of a sentence that the server builds. React renders `strong` parts in bold. */
export interface WhyPart {
  text: string
  strong?: boolean
}

export type UnknownCause =
  | { kind: "sourceFailed"; service: Service }
  | { kind: "noValue"; what: "date" | "size" | "season" | "requester" | "access" | "history" }

export interface FieldVerdict {
  verdict: Verdict
  cause?: UnknownCause
}

/** A preset chip of a field (TS 4.2): the value of its main control, and its words ("365 days", "20 GB"). */
export interface PresetValue {
  label: string
  value: unknown
}

/** A histogram bucket (TS 4.2) in `measure()` units, days or bytes: `from` inclusive, `to` exclusive, null is open. */
export interface HistogramBucket {
  label: string
  from: number | null
  to: number | null
  /** The "Never" bucket of `watch.lastPlayed`. */
  never?: boolean
}

/** What `describe()` needs beyond the condition: member display names for `request.by`. */
export interface DescribeWords {
  /** `User.name`, or null for a member with no name or no row ("Unknown member"). */
  memberName(userId: string): string | null
}

export interface FieldMeta<F extends FieldId = FieldId> {
  id: F
  group: FieldGroup
  label(level: Level): string // picker and Why: "Last played (any episode)"
  token: string // the row token: "Size" for file.size, else the base label
  help: string // picker help (UX 6)
  rowHelp?(ctx: { historyStart: string | null; level: Level }): string | null
  levels: readonly Level[]
  operators: readonly OperatorId[]
  operatorLabels: Partial<Record<OperatorId, string>> // "More than", "Fewer than", ...
  sources(level: Level): readonly Service[]
  needs: readonly Service[] // a missing service disables the field: "Set up {service} to use this"
  defaultCondition(level: Level): Pick<ConditionOf<F>, "op" | "value">
  presets(level: Level): readonly PresetValue[] // chips with counts
  histogram?(level: Level): readonly HistogramBucket[] // date and size fields
  validationMessage(op: OperatorId, value: unknown): string | null // UX 6 copy, X4
  describe(c: ConditionOf<F>, level: Level, words: DescribeWords): string // predicate after "that" (UX 5.8)
  tokens(c: ConditionOf<F>): { field: string; operator?: string; value?: string; after?: string } // row grammar
}

export interface FieldEval<F extends FieldId = FieldId> {
  id: F
  /** One verdict for one item. `role` decides how disagreeing sources combine (E16). */
  evaluate(item: SnapshotItem, c: ConditionOf<F>, ctx: EvalContext, role: "condition" | "protection"): FieldVerdict
  /** Near misses: how far the item is from passing (lower is closer). Null when the field has no order. */
  gap?(item: SnapshotItem, c: ConditionOf<F>, ctx: EvalContext): number | null
  /** Near misses: the day it passes if nothing happens (time-based fields only). */
  forecast?(item: SnapshotItem, c: ConditionOf<F>, ctx: EvalContext): string | null
  /** Near misses: one value change that includes the item, or null. */
  tryValue?(item: SnapshotItem, c: ConditionOf<F>, ctx: EvalContext): ConditionOf<F>["value"] | null
  /** Histogram: the value used for bucketing, in days or bytes, or null (never, unknown). */
  measure?(item: SnapshotItem, ctx: EvalContext): number | null
  /** Why: the real value as words, for the Why Sheet and the Results "Why" text. */
  fact(item: SnapshotItem, ctx: EvalContext): WhyPart[]
}

/** One evaluator for each field, keyed by field id (D1). */
export type FieldEvals = { readonly [F in FieldId]: FieldEval<F> }

export type GlobalProtectionId = "g1" | "g2" | "g3" | "g4" | "g5" | "g6" | "g7" | "g8" | "g9" | "g10" | "g11" | "g12" | "g13"
export type ProtectionState = "protects" | "clear" | "unknown"

export interface ProtectionVerdict {
  verdict: ProtectionState
  cause?: UnknownCause
}

/** One global protection (TS 5.3). `globals(level)` returns the enabled ones that apply to the level. */
export interface GlobalProtectionEval {
  id: GlobalProtectionId
  levels: readonly Level[]
  /** A needed service that is not set up makes the protection inert (`clear`). */
  needs: readonly Service[]
  evaluate(item: SnapshotItem, ctx: EvalContext): ProtectionVerdict
  /** Why: what protects, as words ("Kept by {name} until {date}." on admin surfaces). */
  fact?(item: SnapshotItem, ctx: EvalContext): WhyPart[]
}

/** The database facts that the global protections read (TS 5.2), loaded once per preview and per run. */
export interface LiveFacts {
  keeps: { id: string; itemKey: string; memberId: string; expiresAt: Date }[] // active member Keeps, not expired
  excludes: { id: string; itemKey: string; expiresAt: Date | null; createdBy: string }[] // active exclusions, not expired
  keepForever: ReadonlySet<string> // UserMediaMark.plexRatingKey where markType KEEP_FOREVER
  watchlist: { tmdb: ReadonlySet<number>; tvdb: ReadonlySet<number>; imdb: ReadonlySet<string> } // see G8
  rewindKeys: ReadonlySet<string> | null // see G10; null after the season closes
  members: { userId: string; plexUserId: string | null; name: string | null; accessEndedAt: Date | null }[]
}

export interface EvalContext {
  now: number // epoch ms
  today: string // day key, server zone
  zone: string
  sources: Record<Service, SourceState>
  shares: SourceState // plex.tv share list (facts.users[].hasAccess)
  history: { startAt: number | null; newestAt: number | null } // epoch s
  users: ReadonlyMap<string, SnapshotUser> // by plex.tv id
  memberPlexIds: ReadonlyMap<string, string> // app User.id to plex.tv id
  showsByKey: ReadonlyMap<string, SnapshotItem> // season items read their show
  live: LiveFacts
  options: CleanupOptions
  evals: FieldEvals // D1
  globals(level: Level): readonly GlobalProtectionEval[] // D1: the enabled global protections of the level
}

/** What a rule covers (E32): its level and libraries. A stored definition fits too. */
export interface RuleScope {
  level: Level
  libraries: readonly string[]
}

/** A top-level clause: one condition, or an any-of group of complete conditions. */
export type CompiledClause = { kind: "condition"; id: string; condition: Condition } | { kind: "group"; id: string; conditions: Condition[] }

/** `compileDraft()` and `compileDefinition()` output (TS 6.1). `incomplete` holds the ids left out. */
export interface CompiledRule {
  scope: RuleScope
  clauses: CompiledClause[]
  protections: Condition[]
  incomplete: string[]
  then: Partial<RuleThen>
}

export interface ClauseResult {
  id: string
  verdict: Verdict
  cause?: UnknownCause
}

export interface ProtectionResult {
  id: string // "g1" to "g13", or a rule protection id ("p1")
  verdict: ProtectionState
  cause?: UnknownCause
}

/** `evaluateItem()` output (TS 6.3). `members` holds the member verdicts of each group, by group id. */
export interface ItemResult {
  item: SnapshotItem
  clauses: ClauseResult[]
  members: Record<string, ClauseResult[]>
  protections: ProtectionResult[]
  match: SnapshotItem["match"]
}

export type ItemClass = "match" | "nearMiss" | "protected" | "missing" | "cannotDelete" | "notListed"

/** `classify()` output: exactly one class. `failing` is the one failed clause of a near miss. */
export interface Classification {
  class: ItemClass
  failing?: string
  cause?: MatchCause
}
