/**
 * The row of a condition as parts (TS 4.2 row grammar, UX 4.3.4): tokens
 * and the static words between them, for complete and draft conditions.
 * The same parts make the row sentence of the toolbar name, the Undo line
 * and the group menu: "Last played more than 365 days ago, or never".
 * Client-safe.
 *
 * @module lib/cleanup/fields/sentence
 */

import type { DescribeWords } from "@/lib/cleanup/engine/types"
import { anyFieldMeta, visit } from "@/lib/cleanup/fields/catalog"
import { isRecord } from "@/lib/cleanup/fields/values"
import { durationWords, sizeWords } from "@/lib/cleanup/fields/words"
import type { DraftCondition } from "@/lib/validations/cleanup-draft"
import { type Condition, conditionSchema } from "@/lib/validations/cleanup-rule"
import { DURATION_UNITS, type Level } from "@/lib/validations/cleanup-vocabulary"

/** A token (a button in the row) or static text. */
export type RowPart = { kind: "field" | "operator" | "value"; text: string } | { kind: "text"; text: string }

/** The note beside an incomplete row (UX 8.4). */
export const INCOMPLETE_NOTE = "Not used until complete."

/** The parts of a complete condition, in row order. `words` names members of a `request.by` value. */
export function rowParts(c: Condition, words?: DescribeWords): RowPart[] {
  const t = visit(c, (meta, condition) => meta.tokens(condition, words))
  const parts: RowPart[] = [{ kind: "field", text: t.field }]
  if (anyFieldMeta(c.field).colon) parts.push({ kind: "text", text: ":" })
  if (t.operator !== undefined) parts.push({ kind: "operator", text: t.operator })
  if (t.value !== undefined) parts.push({ kind: "value", text: t.value })
  if (t.after !== undefined) parts.push({ kind: "text", text: t.after })
  return parts
}

/**
 * The parts of a draft condition, and whether it is complete. An incomplete
 * value shows as typed ("0 days", the error state of UX 4.12.1), or as the
 * field's prompt ("Enter a size") when nothing can show.
 */
export function draftRowParts(c: DraftCondition, level: Level, words?: DescribeWords): { parts: RowPart[]; complete: boolean } {
  const parsed = conditionSchema.safeParse(c)
  if (parsed.success) return { parts: rowParts(parsed.data, words), complete: true }
  const meta = anyFieldMeta(c.field)
  const operators: readonly string[] = meta.operators
  const op = operators.includes(c.op) ? c.op : meta.defaultCondition(level).op
  // The default value with the draft's operator gives the operator token words
  const shape = rowParts(conditionSchema.parse({ ...meta.defaultCondition(level), op, id: "c1", field: c.field }), words)
  const parts = shape.filter((part) => part.kind === "field" || part.kind === "operator" || part.text === ":")
  if (op === "never") return { parts, complete: false }
  parts.push({ kind: "value", text: looseValue(c.value) ?? meta.incomplete })
  return { parts, complete: false }
}

/** The words of a value that fails the schema but can still show: a duration, a size or a count. */
function looseValue(value: unknown): string | null {
  if (!isRecord(value)) return null
  const { duration, bytes, unit, count } = value
  if (isRecord(duration) && typeof duration.amount === "number") {
    const durationUnit = DURATION_UNITS.find((u) => u === duration.unit)
    if (durationUnit) return durationWords({ amount: duration.amount, unit: durationUnit })
  }
  if (typeof bytes === "number" && (unit === "GB" || unit === "TB")) return sizeWords(bytes, unit)
  if (typeof count === "number") return String(count)
  return null
}

/** Parts as one line: "Requested in Overseerr: no", "Plays at least 3 in total". */
export function partsText(parts: readonly RowPart[]): string {
  return parts.reduce((line, part, i) => (i === 0 ? part.text : part.text === ":" ? `${line}:` : `${line} ${part.text}`), "")
}

/** The row sentence of a complete condition. */
export function conditionSentence(c: Condition, words?: DescribeWords): string {
  return partsText(rowParts(c, words))
}
