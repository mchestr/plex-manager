/**
 * The Results "Why" cell (TS 6.9, UX 5.3): at most 3 short sentences made
 * from the same verdicts as the Why Sheet, the deciding value first and in
 * bold. Labels come from the field catalogue and facts from `fact()`
 * (deviation D5). Pure and client-safe. Admin surfaces only: G1 names the
 * member who kept the title.
 *
 * | Class        | Text                                                         |
 * |--------------|--------------------------------------------------------------|
 * | match        | the facts of the clauses in field order, the first in bold   |
 * | nearMiss     | **Fails {label}:** {fact} Needs {threshold}. {forecast}      |
 * | protected    | **{first protection}** Global protection. / This rule only.  |
 * | missing      | **Unknown {label}:** {cause}                                 |
 * | cannotDelete | **{cause}** Cleanup never deletes it.                        |
 *
 * @module lib/cleanup/engine/why-text
 */

import { nearMissForecast } from "@/lib/cleanup/engine/near-miss"
import { conditionFact } from "@/lib/cleanup/engine/fields"
import type { Classification, CompiledClause, CompiledRule, DescribeWords, EvalContext, ItemResult, UnknownCause, WhyPart } from "@/lib/cleanup/engine/types"
import { anyFieldMeta } from "@/lib/cleanup/fields/catalog"
import { joinOr, SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import { unknownCauseText } from "@/lib/cleanup/outcomes"
import { cannotDeleteWords, thresholdText } from "@/lib/cleanup/preview/condition-words"
import { isGlobalId, protectionLabel } from "@/lib/cleanup/preview/protection-words"
import type { SourceStatus } from "@/lib/cleanup/schema/snapshot"
import { DEFAULT_LOCALE, formatDayKey, formatTime } from "@/lib/utils/format"
import type { Condition } from "@/lib/validations/cleanup-rule"
import { FIELD_IDS, LEVEL_ARR } from "@/lib/validations/cleanup-vocabulary"

export interface WhyTextInput {
  compiled: CompiledRule
  ctx: EvalContext
  /** Member names for the label of a `request.by` rule protection. */
  words: DescribeWords
  /** The snapshot's source statuses: the read time of a failed source. */
  sources?: readonly SourceStatus[]
}

/** Parts joined as sentences: a space before each part after the first. */
function sentences(parts: readonly (WhyPart | string)[]): WhyPart[] {
  return parts.map((part, i) => {
    const p = typeof part === "string" ? { text: part } : part
    return i === 0 ? p : { ...p, text: ` ${p.text}` }
  })
}

const factTexts = (parts: readonly WhyPart[]) => parts.map((p) => p.text)

/** The conditions a clause stands for: itself, or a group's members. */
const membersOf = (clause: CompiledClause): Condition[] => (clause.kind === "condition" ? [clause.condition] : clause.conditions)

function matchText(result: ItemResult, { compiled, ctx }: WhyTextInput): WhyPart[] {
  const chosen = compiled.clauses.map((clause) => {
    const members = membersOf(clause)
    const passed = result.members[clause.id]?.find((m) => m.verdict === "pass")
    return members.find((m) => m.id === passed?.id) ?? members[0]
  })
  const seen = new Set<string>()
  const ordered = chosen
    .sort((a, b) => FIELD_IDS.indexOf(a.field) - FIELD_IDS.indexOf(b.field))
    .filter((c) => !seen.has(c.field) && seen.add(c.field))
  const texts = ordered.flatMap((c) => factTexts(conditionFact(c, result.item, ctx))).slice(0, 3)
  return sentences(texts.map((text, i) => (i === 0 ? { text, strong: true } : text)))
}

function nearMissText(result: ItemResult, failing: string, { compiled, ctx }: WhyTextInput): WhyPart[] {
  const clause = compiled.clauses.find((c) => c.id === failing)
  if (!clause) return []
  const members = membersOf(clause)
  const level = compiled.scope.level
  const label = joinOr([...new Set(members.map((c) => anyFieldMeta(c.field).label(level)))])
  const facts = [...new Set(members.flatMap((c) => factTexts(conditionFact(c, result.item, ctx))))]
  const parts: (WhyPart | string)[] = [{ text: `Fails ${label}:`, strong: true }, ...facts]
  if (members.length === 1) parts.push(`Needs ${thresholdText(members[0])}.`)
  const day = nearMissForecast(compiled, result, failing, ctx)
  if (day) {
    const date = formatDayKey(day, "short", { locale: DEFAULT_LOCALE })
    parts.push(members[0].field === "watch.lastPlayed" ? `If nobody plays it, it passes on ${date}.` : `It passes on ${date}.`)
  }
  return sentences(parts)
}

function protectedText(result: ItemResult, input: WhyTextInput): WhyPart[] {
  const { compiled, ctx, words } = input
  const first = result.protections.find((p) => p.verdict === "protects")
  if (!first) return []
  const level = compiled.scope.level
  const label = protectionLabel(first.id, { protections: ctx.options.protections, ruleProtections: compiled.protections, level, words })
  if (!isGlobalId(first.id)) return sentences([{ text: `${label}.`, strong: true }, "This rule only."])
  const fact = ctx.globals(level).find((g) => g.id === first.id)?.fact?.(result.item, ctx) ?? []
  const text = fact.length > 0 ? factTexts(fact).join(" ") : `${label}.`
  return sentences([{ text, strong: true }, "Global protection."])
}

function causeText(cause: UnknownCause | undefined, input: WhyTextInput): string {
  if (!cause) return "The value is not known."
  const readAt = cause.kind === "sourceFailed" ? input.sources?.find((s) => s.service === cause.service && s.state === "failed")?.readAt : null
  const time = readAt ? formatTime(readAt, { timeZone: input.ctx.zone, locale: DEFAULT_LOCALE }) : null
  return unknownCauseText(cause, { service: (s) => SERVICE_NAMES[s], readAt: time })
}

function missingText(result: ItemResult, input: WhyTextInput): WhyPart[] {
  const { compiled, ctx, words } = input
  const level = compiled.scope.level
  const fieldOf = new Map(compiled.clauses.flatMap((clause) => membersOf(clause).map((c) => [c.id, c.field] as const)))
  for (const clause of result.clauses) {
    if (clause.verdict !== "unknown") continue
    const member = result.members[clause.id]?.find((m) => m.verdict === "unknown") ?? clause
    const field = fieldOf.get(member.id)
    const label = field ? anyFieldMeta(field).label(level) : "value"
    return sentences([{ text: `Unknown ${label}:`, strong: true }, causeText(member.cause ?? clause.cause, input)])
  }
  const p = result.protections.find((x) => x.verdict === "unknown")
  if (p) {
    const label = protectionLabel(p.id, { protections: ctx.options.protections, ruleProtections: compiled.protections, level, words })
    return sentences([{ text: `Unknown ${label}:`, strong: true }, causeText(p.cause, input)])
  }
  const arr = SERVICE_NAMES[LEVEL_ARR[level]]
  return sentences([{ text: `Unknown ${arr} match:`, strong: true }, `${arr} did not answer.`])
}

function cannotDeleteText(result: ItemResult, classification: Classification, level: CompiledRule["scope"]["level"]): WhyPart[] {
  const [first, ...rest] = cannotDeleteWords(classification.cause, result.match.state, LEVEL_ARR[level])
  return sentences([{ text: first, strong: true }, ...rest, "Cleanup never deletes it."])
}

/** The Why text of one classified item (TS 6.9). A `notListed` item has none. */
export function whyText(result: ItemResult, classification: Classification, input: WhyTextInput): WhyPart[] {
  switch (classification.class) {
    case "match":
      return matchText(result, input)
    case "nearMiss":
      return classification.failing === undefined ? [] : nearMissText(result, classification.failing, input)
    case "protected":
      return protectedText(result, input)
    case "missing":
      return missingText(result, input)
    case "cannotDelete":
      return cannotDeleteText(result, classification, input.compiled.scope.level)
    case "notListed":
      return []
  }
}
