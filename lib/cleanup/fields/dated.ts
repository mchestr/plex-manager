/**
 * The three fields that compare one date with a duration (TS 4.2, UX 6,
 * UX 5.8): Requested, Added and Last episode added. X1 sets the help of
 * Last episode added. Client-safe.
 *
 * @module lib/cleanup/fields/dated
 */

import type { FieldGroup } from "@/lib/cleanup/engine/types"
import type { FieldDef, Form } from "@/lib/cleanup/fields/types"
import { DATE_BUCKETS, DATE_PRESETS, durationMessage, durationOf, fieldBase, isDuration } from "@/lib/cleanup/fields/values"
import { durationWords, verbs } from "@/lib/cleanup/fields/words"
import type { ConditionOf } from "@/lib/validations/cleanup-rule"

type DatedId = "request.age" | "library.added" | "show.lastEpisodeAdded"
type Dated = ConditionOf<DatedId>

interface DatedSpec {
  group: FieldGroup
  label: string
  help: string
  rowHelp?: string
  /** The predicate of each operator, from the duration words and the form. */
  moreThan(n: string, form: Form): string
  lessThan(n: string, form: Form): string
}

/** Every part of a date field that does not depend on which of the three it is. */
function datedParts(spec: DatedSpec): Omit<FieldDef<DatedId>, "id" | "levels" | "sources" | "needs" | "defaultCondition" | "withPreset"> {
  const predicate = (c: Dated, form: Form) => {
    const n = durationWords(c.value.duration)
    return c.op === "moreThan" ? spec.moreThan(n, form) : spec.lessThan(n, form)
  }
  const rowHelp = spec.rowHelp
  return {
    group: spec.group,
    label: () => spec.label,
    token: spec.label,
    help: spec.help,
    ...(rowHelp ? { rowHelp: () => rowHelp } : {}),
    operators: ["moreThan", "lessThan"],
    operatorLabels: { moreThan: "More than", lessThan: "Less than" },
    presets: () => DATE_PRESETS,
    histogram: () => DATE_BUCKETS,
    validationMessage: (_op, value) => durationMessage(durationOf(value)),
    describe: (c) => predicate(c, "plural"),
    predicate: (c, _level, _words, form) => predicate(c, form),
    tokens: (c) => ({
      field: spec.label,
      operator: c.op === "moreThan" ? "more than" : "less than",
      value: durationWords(c.value.duration),
      after: "ago",
    }),
    valueControl: () => "number",
    incomplete: "Enter a number",
  }
}

export const requestAgeField: FieldDef<"request.age"> = {
  ...fieldBase("request.age"),
  ...datedParts({
    group: "requests",
    label: "Requested",
    help: "How long ago the newest request was made.",
    moreThan: (n, form) => `${verbs(form).were} last requested more than ${n} ago`,
    lessThan: (n, form) => `${verbs(form).were} requested in the last ${n}`,
  }),
  defaultCondition: () => ({ op: "moreThan", value: { duration: { amount: 120, unit: "days" } } }),
  withPreset: (c, value) => (isDuration(value) ? { ...c, value: { duration: value } } : c),
}

/** UX 8, and the rule of E16 for "less than": a condition needs every known date to pass (correctness review C-06). */
const ADDED_HELP = "The newer of the Plex and Radarr or Sonarr dates, so a re-added title counts from its new date. In a condition, Less than needs every known date inside the range."

export const addedField: FieldDef<"library.added"> = {
  ...fieldBase("library.added"),
  ...datedParts({
    group: "library",
    label: "Added",
    help: ADDED_HELP,
    rowHelp: ADDED_HELP,
    moreThan: (n, form) => `${verbs(form).were} added more than ${n} ago`,
    lessThan: (n, form) => `${verbs(form).were} added in the last ${n}`,
  }),
  defaultCondition: () => ({ op: "moreThan", value: { duration: { amount: 90, unit: "days" } } }),
  withPreset: (c, value) => (isDuration(value) ? { ...c, value: { duration: value } } : c),
}

export const lastEpisodeAddedField: FieldDef<"show.lastEpisodeAdded"> = {
  ...fieldBase("show.lastEpisodeAdded"),
  ...datedParts({
    group: "showsSeasons",
    label: "Last episode added",
    help: "When the newest episode arrived in Plex.",
    moreThan: (n) => `got no new episode in the last ${n}`,
    lessThan: (n) => `got a new episode in the last ${n}`,
  }),
  defaultCondition: () => ({ op: "moreThan", value: { duration: { amount: 365, unit: "days" } } }),
  withPreset: (c, value) => (isDuration(value) ? { ...c, value: { duration: value } } : c),
}
