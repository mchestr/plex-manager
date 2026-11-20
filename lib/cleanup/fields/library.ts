/**
 * Size on disk (TS 4.2, UX 6, UX 5.8): defaults, presets and buckets by
 * level. Added lives in `dated.ts`. Client-safe.
 *
 * @module lib/cleanup/fields/library
 */

import type { FieldDef, Form } from "@/lib/cleanup/fields/types"
import { fieldBase, isRecord, isWhole, sizeBuckets, sizePresets } from "@/lib/cleanup/fields/values"
import { sizeWords, verbs } from "@/lib/cleanup/fields/words"
import type { ConditionOf } from "@/lib/validations/cleanup-rule"
import { GiB, type Level, TiB } from "@/lib/validations/cleanup-vocabulary"

const DEFAULT_GB: Record<Level, number> = { movie: 20, show: 100, season: 25 }
const PRESET_GB: Record<Level, readonly number[]> = { movie: [10, 20, 50], show: [50, 100, 250], season: [10, 25, 50] }
const BUCKET_EDGES_GB: Record<Level, readonly number[]> = {
  movie: [2, 5, 10, 20, 40],
  show: [25, 50, 100, 250, 500],
  season: [5, 10, 25, 50],
}

const isBytes = (value: unknown): value is number => isWhole(value, GiB, 50 * TiB)

const sizePredicate = (c: ConditionOf<"file.size">, form: Form) =>
  `${verbs(form).are} ${c.op === "moreThan" ? "larger" : "smaller"} than ${sizeWords(c.value.bytes, c.value.unit)}`

export const sizeField: FieldDef<"file.size"> = {
  ...fieldBase("file.size"),
  group: "library",
  label: () => "Size on disk",
  token: "Size",
  help: "From Radarr or Sonarr.",
  operators: ["moreThan", "lessThan"],
  operatorLabels: { moreThan: "More than", lessThan: "Less than" },
  defaultCondition: (level) => ({ op: "moreThan", value: { bytes: DEFAULT_GB[level] * GiB, unit: "GB" } }),
  presets: (level) => sizePresets(PRESET_GB[level]),
  histogram: (level) => sizeBuckets(BUCKET_EDGES_GB[level]),
  validationMessage: (_op, value) =>
    isRecord(value) && isBytes(value.bytes) && (value.unit === "GB" || value.unit === "TB") ? null : "Enter a size from 1 GB to 50 TB.",
  describe: (c) => sizePredicate(c, "plural"),
  predicate: (c, _level, _words, form) => sizePredicate(c, form),
  tokens: (c) => ({ field: "Size", operator: c.op === "moreThan" ? "more than" : "less than", value: sizeWords(c.value.bytes, c.value.unit) }),
  valueControl: () => "number",
  withPreset: (c, value) => (isBytes(value) ? { ...c, value: { bytes: value, unit: "GB" } } : c),
  incomplete: "Enter a size",
}
