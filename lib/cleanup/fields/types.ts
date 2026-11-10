/**
 * The shape of one entry of the field catalogue: the frozen `FieldMeta` of
 * TS 4.1, plus the parts that the plain words, the row and the condition
 * editor need beyond it. Types only, client-safe.
 *
 * @module lib/cleanup/fields/types
 */

import type { DescribeWords, FieldMeta, OperatorId } from "@/lib/cleanup/engine/types"
import type { ConditionOf } from "@/lib/validations/cleanup-rule"
import type { FieldId, Level } from "@/lib/validations/cleanup-vocabulary"

/** "plural" after "{Scope} that" (conditions). "singular" after "anything that" (protections, TS 4.4 item 6). */
export type Form = "plural" | "singular"

/** The row grammar of TS 4.2: `[field] [operator] [value] after`. */
interface RowTokens {
  field: string
  operator?: string
  value?: string
  after?: string
}

/** The control of the value editor that takes focus (UX 4.3.8 item 2.2). "none": the operator takes it. */
type ValueControl = "number" | "radio" | "combobox" | "none"

/** One choice of a `RadioGroup` value (Requested in Overseerr, The requesters, Show status). */
interface ValueChoice {
  value: unknown
  label: string
}

/** The context of a row help line. `zone` formats an instant; a day key needs none. */
interface RowHelpContext {
  historyStart: string | null
  level: Level
  zone?: string
}

export interface FieldDef<F extends FieldId = FieldId> extends FieldMeta<F> {
  /** The predicate after "that", in the plural (conditions) or the singular (protections). */
  predicate(c: ConditionOf<F>, level: Level, words: DescribeWords, form: Form): string
  /** The row grammar. `words` names members in a `request.by` value, else they read "Unknown member". */
  tokens(c: ConditionOf<F>, words?: DescribeWords): RowTokens
  rowHelp?(ctx: RowHelpContext): string | null
  /** A static ":" sits between the field and the value ("Show status: ended"). */
  colon?: boolean
  /** The value control of an operator. */
  valueControl(op: OperatorId): ValueControl
  /** The `RadioGroup` choices of a choice value. */
  choices?: readonly ValueChoice[]
  /** The condition with a preset chip's value applied to its main control. */
  withPreset(c: ConditionOf<F>, value: unknown): ConditionOf<F>
  /** The value words of an incomplete row ("Enter a size", UX 8.4). */
  incomplete: string
}

/** One entry for each field, keyed by field id. */
export type FieldCatalog = { readonly [F in FieldId]: FieldDef<F> }
