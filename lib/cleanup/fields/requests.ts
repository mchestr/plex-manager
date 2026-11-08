/**
 * The Requests fields that are not dates (TS 4.2, UX 6, UX 5.8): Requested
 * in Overseerr, Requested by and The requesters. Requested lives in
 * `dated.ts`. Client-safe.
 *
 * @module lib/cleanup/fields/requests
 */

import type { DescribeWords, OperatorId } from "@/lib/cleanup/engine/types"
import type { FieldDef, Form } from "@/lib/cleanup/fields/types"
import { fieldBase, isRecord } from "@/lib/cleanup/fields/values"
import { requesterWords, verbs } from "@/lib/cleanup/fields/words"
import { type ConditionOf, requesterRefSchema } from "@/lib/validations/cleanup-rule"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

type By = ConditionOf<"request.by">
type Requesters = ConditionOf<"request.requesters">

const NO_PRESETS = () => []

const existsPredicate = (c: ConditionOf<"request.exists">, form: Form) => `${verbs(form).have} ${c.value.exists ? "a" : "no"} request in Overseerr`

export const requestExistsField: FieldDef<"request.exists"> = {
  ...fieldBase("request.exists"),
  group: "requests",
  label: () => "Requested in Overseerr",
  token: "Requested in Overseerr",
  help: "Whether Overseerr has a request for it now.",
  operators: ["is"],
  operatorLabels: {},
  defaultCondition: () => ({ op: "is", value: { exists: false } }),
  presets: NO_PRESETS,
  validationMessage: () => null,
  describe: (c) => existsPredicate(c, "plural"),
  predicate: (c, _level, _words, form) => existsPredicate(c, form),
  tokens: (c) => ({ field: "Requested in Overseerr", value: c.value.exists ? "yes" : "no" }),
  colon: true,
  valueControl: () => "radio",
  choices: [
    { value: true, label: "Yes" },
    { value: false, label: "No" },
  ],
  withPreset: (c) => c,
  incomplete: "Choose one",
}

const BY_TOKENS: Partial<Record<OperatorId, string>> = { anyOf: "any of", only: "only", noneOf: "none of" }

function byPredicate(c: By, _level: Level, words: DescribeWords, form: Form): string {
  const list = requesterWords(c.value.requesters, words)
  const { were } = verbs(form)
  if (c.op === "anyOf") return `${were} requested by ${list}`
  if (c.op === "only") return `${were} requested only by ${list}`
  return `${were} not requested by ${list}`
}

export const requestByField: FieldDef<"request.by"> = {
  ...fieldBase("request.by"),
  group: "requests",
  label: () => "Requested by",
  token: "Requested by",
  help: "Members who made a request. Matched by Plex account, never by name.",
  operators: ["anyOf", "only", "noneOf"],
  operatorLabels: { anyOf: "Any of", only: "Only", noneOf: "None of" },
  defaultCondition: () => ({ op: "only", value: { requesters: [{ kind: "former" }] } }),
  presets: NO_PRESETS,
  validationMessage: (_op, value) => {
    const refs = isRecord(value) ? value.requesters : undefined
    if (!Array.isArray(refs) || refs.length === 0) return "Pick at least one member or group."
    if (refs.length > 50) return "Pick at most 50 members or groups."
    for (const ref of refs) {
      if (requesterRefSchema.safeParse(ref).success) continue
      return isRecord(ref) && ref.kind === "inactive" ? "Enter a whole number of days from 1 to 3650." : "Pick at least one member or group."
    }
    return null
  },
  describe: (c, level, words) => byPredicate(c, level, words, "plural"),
  predicate: byPredicate,
  tokens: (c, words) => ({ field: "Requested by", operator: BY_TOKENS[c.op], value: requesterWords(c.value.requesters, words) }),
  valueControl: () => "combobox",
  withPreset: (c) => c,
  incomplete: "Pick a member",
}

function requestersPredicate(c: Requesters, level: Level, _words: DescribeWords, form: Form): string {
  const { were } = verbs(form)
  if (c.value.did === "neverPlayed") return `${were} never played by a requester${level === "season" ? " of the show" : ""}`
  const tail = { movie: "", show: ", every episode on disk", season: " of the show" }[level]
  return `${were} finished by every requester${tail}`
}

export const requestersField: FieldDef<"request.requesters"> = {
  ...fieldBase("request.requesters"),
  group: "requests",
  label: () => "The requesters",
  token: "The requesters",
  help: "What the members who requested it did. A title with no request never passes.",
  operators: ["is"],
  operatorLabels: {},
  defaultCondition: () => ({ op: "is", value: { did: "neverPlayed" } }),
  presets: NO_PRESETS,
  validationMessage: () => null,
  describe: (c, level, words) => requestersPredicate(c, level, words, "plural"),
  predicate: requestersPredicate,
  tokens: (c) => ({ field: "The requesters", value: c.value.did === "neverPlayed" ? "never played it" : "all finished it" }),
  valueControl: () => "radio",
  choices: [
    { value: "neverPlayed", label: "never played it" },
    { value: "allFinished", label: "all finished it" },
  ],
  withPreset: (c) => c,
  incomplete: "Choose one",
}
