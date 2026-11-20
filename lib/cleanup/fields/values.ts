/**
 * The value parts that several fields share (TS 4.2, UX 6, X4): presets,
 * histogram buckets, the checks behind each validation message, and the
 * base of every catalogue entry. Client-safe.
 *
 * @module lib/cleanup/fields/values
 */

import type { HistogramBucket, PresetValue } from "@/lib/cleanup/engine/types"
import type { FieldDef } from "@/lib/cleanup/fields/types"
import { durationWords } from "@/lib/cleanup/fields/words"
import type { Duration } from "@/lib/validations/cleanup-rule"
import {
  DURATION_UNITS,
  FIELD_LEVELS,
  FIELD_NEEDS,
  FIELD_SOURCES,
  type FieldId,
  GiB,
  type Level,
  UNIT_MAX,
} from "@/lib/validations/cleanup-vocabulary"

/** The id, levels, sources and needs of a field, read from the vocabulary (deviation D3). */
export function fieldBase<F extends FieldId>(id: F): Pick<FieldDef<F>, "id" | "levels" | "sources" | "needs"> {
  return { id, levels: FIELD_LEVELS[id], sources: (level: Level) => FIELD_SOURCES[id][level], needs: FIELD_NEEDS[id] }
}

const durations: Duration[] = [
  { amount: 90, unit: "days" },
  { amount: 180, unit: "days" },
  { amount: 365, unit: "days" },
  { amount: 2, unit: "years" },
]
/** The presets of every date field: 90 days, 180 days, 365 days, 2 years. The value is a `Duration`. */
export const DATE_PRESETS: readonly PresetValue[] = durations.map((d) => ({ label: durationWords(d), value: d }))

/** Count presets: the value is the count, the label its digits. */
export const countPresets = (counts: readonly number[]): readonly PresetValue[] =>
  counts.map((count) => ({ label: String(count), value: count }))

/** Size presets in GB: the value is the bytes. */
export const sizePresets = (gbs: readonly number[]): readonly PresetValue[] =>
  gbs.map((gb) => ({ label: `${gb} GB`, value: gb * GiB }))

/** The bucket edges of date fields, in days (TS 4.2). */
const DAY_EDGES = [30, 91, 182, 365, 730] as const
const DAY_LABELS = ["Last 30 days", "1 to 3 months", "3 to 6 months", "6 to 12 months", "1 to 2 years", "2 years or more"]

/** Buckets from inner edges: the first is open below, the last open above. */
function bucketsFromEdges(edges: readonly number[], labels: readonly string[]): HistogramBucket[] {
  return labels.map((label, i) => ({ label, from: i === 0 ? null : edges[i - 1], to: i === edges.length ? null : edges[i] }))
}

/** The six date buckets, in days ago. */
export const DATE_BUCKETS: readonly HistogramBucket[] = bucketsFromEdges(DAY_EDGES, DAY_LABELS)

/** Size buckets from inner edges in GB, labelled "Under 2 GB", "2 to 5 GB", ..., "40 GB or more". */
export function sizeBuckets(edgesGb: readonly number[]): HistogramBucket[] {
  const last = edgesGb.length - 1
  const labels = [`Under ${edgesGb[0]} GB`, ...edgesGb.slice(1).map((gb, i) => `${edgesGb[i]} to ${gb} GB`), `${edgesGb[last]} GB or more`]
  return bucketsFromEdges(
    edgesGb.map((gb) => gb * GiB),
    labels,
  )
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

/** A whole number from `min` to `max`. */
export const isWhole = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max

/** X4: "Enter a whole number of {unit} from 1 to {max}." The days form is the UX string. */
export function durationMessage(value: unknown): string | null {
  const unit = isRecord(value) && DURATION_UNITS.find((u) => u === value.unit)
  if (!unit) return durationRange("days")
  return isWhole(value.amount, 1, UNIT_MAX[unit]) ? null : durationRange(unit)
}

const durationRange = (unit: Duration["unit"]) => `Enter a whole number of ${unit} from 1 to ${UNIT_MAX[unit]}.`

/** A valid `Duration` (X4 range). */
export const isDuration = (value: unknown): value is Duration => isRecord(value) && durationMessage(value) === null

/** The duration inside a value object, as `{ duration }` holds it. */
export const durationOf = (value: unknown): unknown => (isRecord(value) ? value.duration : undefined)

/** The count inside a value object, as `{ count }` holds it. */
export const countOf = (value: unknown): unknown => (isRecord(value) ? value.count : undefined)
