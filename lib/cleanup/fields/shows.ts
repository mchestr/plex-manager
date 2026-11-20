/**
 * The Shows and seasons fields that are not dates (TS 4.2, UX 6, UX 5.8):
 * Show status, Seasons on disk and Season position. Last episode added
 * lives in `dated.ts`. Client-safe.
 *
 * @module lib/cleanup/fields/shows
 */

import type { DescribeWords } from "@/lib/cleanup/engine/types"
import type { FieldDef, Form } from "@/lib/cleanup/fields/types"
import { countOf, countPresets, fieldBase, isWhole } from "@/lib/cleanup/fields/values"
import { verbs } from "@/lib/cleanup/fields/words"
import type { ConditionOf } from "@/lib/validations/cleanup-rule"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

type Status = ConditionOf<"show.status">
type SeasonsOnDisk = ConditionOf<"show.seasonsOnDisk">
type Position = ConditionOf<"season.position">

function statusPredicate(c: Status, level: Level, _words: DescribeWords, form: Form): string {
  const { are } = verbs(form)
  if (level === "season") return `${are} in ${c.value.status === "ended" ? "a show that ended" : "a continuing show"}`
  if (c.value.status === "continuing") return `${are} still continuing`
  return form === "plural" ? "are shows that ended" : "is a show that ended"
}

export const statusField: FieldDef<"show.status"> = {
  ...fieldBase("show.status"),
  group: "showsSeasons",
  label: () => "Show status",
  token: "Show status",
  help: "From Sonarr. Upcoming and deleted shows never match.",
  operators: ["is"],
  operatorLabels: {},
  defaultCondition: () => ({ op: "is", value: { status: "ended" } }),
  presets: () => [],
  validationMessage: () => null,
  describe: (c, level, words) => statusPredicate(c, level, words, "plural"),
  predicate: statusPredicate,
  tokens: (c) => ({ field: "Show status", value: c.value.status }),
  colon: true,
  valueControl: () => "radio",
  choices: [
    { value: "ended", label: "Ended" },
    { value: "continuing", label: "Continuing" },
  ],
  withPreset: (c) => c,
  incomplete: "Choose one",
}

function seasonsPredicate(c: SeasonsOnDisk, level: Level, _words: DescribeWords, form: Form): string {
  const { are, have } = verbs(form)
  const k = c.value.count
  const amount = `${c.op === "atLeast" ? "at least" : "fewer than"} ${k} ${k === 1 ? "season" : "seasons"} on disk`
  return level === "season" ? `${are} in a show with ${amount}` : `${have} ${amount}`
}

export const seasonsOnDiskField: FieldDef<"show.seasonsOnDisk"> = {
  ...fieldBase("show.seasonsOnDisk"),
  group: "showsSeasons",
  label: (level) => (level === "season" ? "Seasons on disk (whole show)" : "Seasons on disk"),
  token: "Seasons on disk",
  help: "Seasons of the show with at least one episode file. Specials do not count.",
  operators: ["atLeast", "fewerThan"],
  operatorLabels: { atLeast: "At least", fewerThan: "Fewer than" },
  defaultCondition: () => ({ op: "atLeast", value: { count: 3 } }),
  presets: () => countPresets([2, 3, 4, 5]),
  validationMessage: (_op, value) => (isWhole(countOf(value), 1, 100) ? null : "Enter a whole number of seasons from 1 to 100."),
  describe: (c, level, words) => seasonsPredicate(c, level, words, "plural"),
  predicate: seasonsPredicate,
  tokens: (c) => ({ field: "Seasons on disk", operator: c.op === "atLeast" ? "at least" : "fewer than", value: String(c.value.count) }),
  valueControl: () => "number",
  withPreset: (c, value) => (isWhole(value, 1, 100) ? { ...c, value: { count: value } } : c),
  incomplete: "Enter a number",
}

function positionPredicate(c: Position, _level: Level, _words: DescribeWords, form: Form): string {
  const { are, their } = verbs(form)
  const not = c.op === "notNewest" ? " not" : ""
  const k = c.value.count
  if (k === 1) return `${are}${not} the newest season of ${their} show`
  return `${are}${not} one of the ${k} newest seasons of ${their} show`
}

export const positionField: FieldDef<"season.position"> = {
  ...fieldBase("season.position"),
  group: "showsSeasons",
  label: () => "Season position",
  token: "Season position",
  help:
    "Uses Sonarr's season numbers. A season with no number never matches. " +
    "A show whose Plex and Sonarr season numbers differ is Cannot delete for every season.",
  operators: ["notNewest", "newest"],
  operatorLabels: { notNewest: "Not one of the newest", newest: "One of the newest" },
  defaultCondition: () => ({ op: "notNewest", value: { count: 2 } }),
  presets: () => countPresets([1, 2, 3, 4]),
  validationMessage: (_op, value) => (isWhole(countOf(value), 1, 20) ? null : "Enter a whole number from 1 to 20."),
  describe: (c, level, words) => positionPredicate(c, level, words, "plural"),
  predicate: positionPredicate,
  tokens: (c) => ({
    field: "Season position",
    operator: c.op === "notNewest" ? "not one of the" : "one of the",
    value: String(c.value.count),
    after: c.value.count === 1 ? "newest season" : "newest seasons",
  }),
  valueControl: () => "number",
  withPreset: (c, value) => (isWhole(value, 1, 20) ? { ...c, value: { count: value } } : c),
  incomplete: "Enter a number",
}
