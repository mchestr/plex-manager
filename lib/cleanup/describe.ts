/**
 * The "In plain words" sentence of a rule (UX 5.8, TS 4.4), built from the
 * definition only: the editor, the rule card, the recipe Sheet, the turn-on
 * page and audit rows use it. It reads a draft too, and leaves out its
 * incomplete conditions. Client-safe.
 *
 * @module lib/cleanup/describe
 */

import { ACTION_PHRASES } from "@/lib/cleanup/action-words"
import type { DescribeWords, WhyPart } from "@/lib/cleanup/engine/types"
import { describeCondition, visit } from "@/lib/cleanup/fields/catalog"
import { durationWords, LEVEL_NAMES } from "@/lib/cleanup/fields/words"
import type { RuleDraft } from "@/lib/validations/cleanup-draft"
import { type Condition, conditionSchema } from "@/lib/validations/cleanup-rule"
import type { Level, Mode } from "@/lib/validations/cleanup-vocabulary"

/** What `describeRule()` needs beyond the definition. */
export interface DescribeContext extends DescribeWords {
  /** The Plex section title, or null for an unknown id ("library {id}"). */
  libraryTitle(sectionId: string): string | null
  /** The rule's mode. Omit it where no mode sentence belongs (a recipe). */
  mode?: Mode | null
  /**
   * Bold only the value inside each condition ("365 days"), not the whole
   * phrase: the rule card (UX 4.1.3 item 1). The editor's In plain words
   * bolds the phrases.
   */
  valuesOnly?: boolean
}

/** The mode sentence (UX 5.8 item 7). */
export const MODE_SENTENCES: Record<Mode, string> = {
  dryRun: "This rule is in Dry run, so runs only record its matches.",
  reviewFirst: "At the leave date, items wait for your approval.",
  automatic: "At the leave date, items are deleted inside the daily budget.",
}

type Out = { text(text: string): void; strong(text: string): void; parts: WhyPart[] }

function out(): Out {
  const parts: WhyPart[] = []
  const add = (text: string, strong: boolean) => {
    const last = parts[parts.length - 1]
    if (last && Boolean(last.strong) === strong) last.text += text
    else parts.push(strong ? { text, strong } : { text })
  }
  return { parts, text: (text) => add(text, false), strong: (text) => add(text, true) }
}

/** Writes `items` with ", " between them and `last` before the last one. */
function list<T>(o: Out, items: readonly T[], last: string, write: (item: T) => void): void {
  items.forEach((item, i) => {
    if (i > 0) o.text(i === items.length - 1 ? last : ", ")
    write(item)
  })
}

const complete = (raw: unknown): Condition[] => {
  const parsed = conditionSchema.safeParse(raw)
  return parsed.success ? [parsed.data] : []
}

/** The top-level clauses with their complete conditions. A group with one left works as that condition. */
function clausesOf(def: RuleDraft): Condition[][] {
  return def.conditions
    .map((clause) => ("kind" in clause ? clause.conditions.flatMap(complete) : complete(clause)))
    .filter((members) => members.length > 0)
}

function scope(o: Out, def: RuleDraft, ctx: DescribeContext): void {
  o.text(LEVEL_NAMES[def.level])
  if (def.libraries.length === 0) return
  o.text(" in the ")
  list(o, def.libraries, " and ", (id) => o.strong(ctx.libraryTitle(id) ?? `library ${id}`))
  o.text(def.libraries.length === 1 ? " library" : " libraries")
}

/** A condition's phrase: all strong, or with `valuesOnly` only its value token where the phrase holds it. */
function predicate(o: Out, c: Condition, level: Level, ctx: DescribeContext, form: "plural" | "singular"): void {
  const text = describeCondition(c, level, ctx, form)
  if (!ctx.valuesOnly) return o.strong(text)
  const value = visit(c, (meta, condition) => meta.tokens(condition, ctx)).value
  const at = value ? text.indexOf(value) : -1
  if (!value || at < 0) return o.text(text)
  o.text(text.slice(0, at))
  o.strong(value)
  o.text(text.slice(at + value.length))
}

function clause(o: Out, members: Condition[], level: Level, ctx: DescribeContext): void {
  if (members.length > 1) o.text("either ")
  list(o, members, " or ", (c) => predicate(o, c, level, ctx, "plural"))
}

/**
 * The plain words of a rule or a draft, as parts. Values are `strong`
 * (TS 4.4 item 5): library titles, predicates and the grace period.
 */
export function describeRule(def: RuleDraft, ctx: DescribeContext): WhyPart[] {
  const o = out()
  scope(o, def, ctx)
  const clauses = clausesOf(def)
  if (clauses.length > 0) o.text(" that ")
  list(o, clauses, ", and ", (members) => clause(o, members, def.level, ctx))
  o.text(". Never touch anything that a global protection keeps safe")
  const protections = def.protections.flatMap(complete)
  if (protections.length > 0) o.text(", or that ")
  protections.forEach((p, i) => {
    if (i > 0) o.text(" or ")
    predicate(o, p, def.level, ctx, "singular")
  })
  o.text(".")
  const { graceDays, action, importListExclusion } = def.then
  if (graceDays !== undefined && action !== undefined) {
    o.text(" Keep matches in Leaving soon for ")
    o.strong(durationWords({ amount: graceDays, unit: "days" }))
    o.text(`, then ${ACTION_PHRASES[action]}`)
    if (importListExclusion && action.endsWith(".delete")) o.text(", and add an import list exclusion")
    o.text(".")
  }
  if (ctx.mode) o.text(` ${MODE_SENTENCES[ctx.mode]}`)
  return o.parts
}

/** The parts as one plain string, for audit rows and names. */
/**
 * The parts with one space between two sentences (UX 4.5, 8.5): a fact list
 * such as `phrases("Never played.", "No counted play since …")` holds one
 * part per sentence, with no separator.
 */
export function spacedParts(parts: readonly WhyPart[]): WhyPart[] {
  return parts.map((part, i) => (i > 0 && /[.!?]$/.test(parts[i - 1].text) && /^\S/.test(part.text) ? { ...part, text: ` ${part.text}` } : part))
}

export const plainText = (parts: readonly WhyPart[]): string => spacedParts(parts).map((part) => part.text).join("")
