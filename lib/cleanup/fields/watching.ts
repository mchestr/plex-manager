/**
 * The Watching fields (TS 4.2, UX 6, UX 5.8): Last played and Plays.
 * Client-safe.
 *
 * @module lib/cleanup/fields/watching
 */

import type { DescribeWords } from "@/lib/cleanup/engine/types"
import type { FieldDef, Form } from "@/lib/cleanup/fields/types"
import {
  countPresets,
  DATE_BUCKETS,
  DATE_PRESETS,
  durationMessage,
  durationOf,
  fieldBase,
  isDuration,
  isRecord,
  isWhole,
} from "@/lib/cleanup/fields/values"
import { dateWords, durationWords, verbs } from "@/lib/cleanup/fields/words"
import type { ConditionOf } from "@/lib/validations/cleanup-rule"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

type LastPlayed = ConditionOf<"watch.lastPlayed">
type Plays = ConditionOf<"watch.plays">

const LAST_PLAYED_LABELS: Record<Level, string> = {
  movie: "Last played",
  show: "Last played (any episode)",
  season: "Last played (any episode of the season)",
}

function lastPlayedPredicate(c: LastPlayed, level: Level, _words: DescribeWords, form: Form): string {
  const n = durationWords(c.value.duration)
  const { were } = verbs(form)
  const movie = level === "movie"
  switch (c.op) {
    case "moreThan":
      if (c.value.orNever) return movie ? `had no play in the last ${n}` : `had no episode played in the last ${n}`
      return movie ? `${were} played, but not in the last ${n}` : `had episodes played, but none in the last ${n}`
    case "lessThan":
      return movie ? `${were} played in the last ${n}` : `had an episode played in the last ${n}`
    case "never":
      return movie ? `${were} never played` : "never had an episode played"
  }
}

export const lastPlayedField: FieldDef<"watch.lastPlayed"> = {
  ...fieldBase("watch.lastPlayed"),
  group: "watching",
  label: (level) => LAST_PLAYED_LABELS[level],
  token: "Last played",
  help: "The newest counted play by anyone, from Tautulli. A play counts after 2 minutes or 90 %.",
  rowHelp: ({ historyStart, zone }) =>
    historyStart === null ? null : `Never means no counted play since Tautulli history starts on ${dateWords(historyStart, zone)}.`,
  operators: ["moreThan", "lessThan", "never"],
  operatorLabels: { moreThan: "More than", lessThan: "Less than", never: "Never" },
  defaultCondition: () => ({ op: "moreThan", value: { duration: { amount: 365, unit: "days" }, orNever: true } }),
  presets: () => DATE_PRESETS,
  histogram: () => [...DATE_BUCKETS, { label: "Never", from: null, to: null, never: true }],
  validationMessage: (_op, value) => durationMessage(durationOf(value)),
  describe: (c, level, words) => lastPlayedPredicate(c, level, words, "plural"),
  predicate: lastPlayedPredicate,
  tokens: (c) => {
    if (c.op === "never") return { field: "Last played", operator: "never" }
    const operator = c.op === "moreThan" ? "more than" : "less than"
    const after = c.op === "moreThan" && c.value.orNever ? "ago, or never" : "ago"
    return { field: "Last played", operator, value: durationWords(c.value.duration), after }
  },
  valueControl: (op) => (op === "never" ? "none" : "number"),
  withPreset: (c, value) => (isDuration(value) ? { ...c, value: { ...c.value, duration: value } } : c),
  incomplete: "Enter a number",
}

function playsPredicate(c: Plays, _level: Level, _words: DescribeWords, form: Form): string {
  const { have } = verbs(form)
  const k = c.value.count
  const window = c.value.window.kind === "last" ? ` in the last ${durationWords(c.value.window.duration)}` : ""
  if (c.op === "fewerThan") return k === 1 ? `${have} no counted play${window}` : `${have} fewer than ${k} plays${window}`
  if (k === 1) return `${have} a counted play${window}`
  return `${have} at least ${k} plays${window || " in total"}`
}

export const playsField: FieldDef<"watch.plays"> = {
  ...fieldBase("watch.plays"),
  group: "watching",
  label: () => "Plays",
  token: "Plays",
  help: "Counted plays by anyone, from Tautulli, in total or in the last N days.",
  operators: ["fewerThan", "atLeast"],
  operatorLabels: { fewerThan: "Fewer than", atLeast: "At least" },
  defaultCondition: () => ({ op: "fewerThan", value: { count: 1, window: { kind: "total" } } }),
  presets: () => countPresets([1, 2, 3]),
  validationMessage: (op, value) => {
    // Fewer than 0 can never pass (`fewer_than_zero`), so that range starts at 1
    const min = op === "fewerThan" ? 1 : 0
    if (!isRecord(value) || !isWhole(value.count, min, 1000)) return `Enter a whole number of plays from ${min} to 1000.`
    const { window } = value
    return isRecord(window) && window.kind === "last" ? durationMessage(window.duration) : null
  },
  describe: (c, level, words) => playsPredicate(c, level, words, "plural"),
  predicate: playsPredicate,
  tokens: (c) => ({
    field: "Plays",
    operator: c.op === "fewerThan" ? "fewer than" : "at least",
    value: String(c.value.count),
    after: c.value.window.kind === "last" ? `in the last ${durationWords(c.value.window.duration)}` : "in total",
  }),
  valueControl: () => "number",
  withPreset: (c, value) => (isWhole(value, 0, 1000) ? { ...c, value: { ...c.value, count: value } } : c),
  incomplete: "Enter a number",
}
