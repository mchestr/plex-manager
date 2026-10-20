/**
 * Grounding: the mechanical check every model-written slot passes before it
 * reaches a page (design 8.4, D1). Pure and deterministic.
 *
 * ## Rules
 *
 * A slot fails on:
 * 1. a digit outside a token, the year included;
 * 2. a counting number word within two words of a unit, a counted noun or
 *    another number word ("one more", "no one", "one of" and "the one" are
 *    idioms; "double feature" only inside the archetype-name token);
 * 3. a quantifier ("most", "half", "a good share" ...) that no share token
 *    cited in the same slot backs (most needs 0.5 or more, half 0.45 to 0.55);
 * 4. a capitalised word that does not start a sentence, or a sentence-initial
 *    word missing from the common-word list (`wordlist.ts`);
 * 5. a token that is unknown, outside the slot's `allowedFacts`, missing from
 *    the member's facts, or only on pages that were not selected;
 * 6. a voice breach: banned phrases, the window words "so far" and "still"
 *    (templates may use them), emoji, URLs, Markdown, the member's name
 *    outside `signOff`, and third-person references such as "the viewer";
 * 7. a rendered length over `maxChars`, each token at its display length;
 * 8. an archetype outside the shortlist rule, or another archetype's poster
 *    line ({@link groundArchetype}).
 *
 * Every issue carries a `hint` naming the token to use where one fits, which
 * P5.9's repair prompt quotes.
 *
 * @module lib/wrapped/copy/grounding
 */

import { posterLineIds, type ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"
import type { ArchetypeSelection } from "@/lib/wrapped/archetypes/select"
import type { PageType } from "@/lib/wrapped/data/page-types"
import { FACTS, type FactId, type RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import {
  BANNED_PHRASES, COUNTED, EMOJI, MARKDOWN, MONTHS, NUMBER_WORDS, QUANTIFIERS, THIRD_PERSON, URL_LIKE, WEEKDAYS,
  WINDOW_PHRASES, isCommonWord, stripTokens, words,
} from "./grounding-words"
import { renderCopyText, tokenIds, type TokenSource } from "./render-copy"
import { COPY_SLOTS, factPages, type CopySlot, type SlotId } from "./slots"

export type GroundingRule = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export interface GroundingIssue {
  rule: GroundingRule
  slot: SlotId | "archetype.id"
  message: string
  hint: string
}

export type GroundingResult = { ok: true } | { ok: false; issues: GroundingIssue[] }

export interface GroundingContext {
  facts: RewindFactsV3
  /** The selected pages; a token whose pages are all unselected fails rule 5. */
  selected: readonly PageType[]
  /** Templates may use window words and their own `copy.*` tokens. Default `llm`. */
  source?: "llm" | "template"
  /** Template-only token values, such as `copy.year`. */
  locals?: TokenSource
}

const tok = (id: string) => `{{fact:${id}}}`
const isFactId = (id: string): id is FactId => Object.hasOwn(FACTS, id)
const flat = (s: string) => s.replace(/[\u00A0\u202F]/g, " ").toLowerCase()

function present(slot: CopySlot, facts: RewindFactsV3): FactId[] {
  return slot.allowedFacts.filter((id) => facts[id])
}

function digitIssue(slot: CopySlot, stripped: string, facts: RewindFactsV3): GroundingIssue | null {
  const number = stripped.match(/\d[\d,.:]*/)?.[0]
  if (!number) return null
  const match = present(slot, facts).find((id) => flat(facts[id]!.display).includes(number.replace(/[.,:]$/, "")))
  return {
    rule: 1,
    slot: slot.id,
    message: `"${number}" is a digit outside a token`,
    hint: match ? `Use ${tok(match)}` : "Write every number as a token from the fact sheet, or leave it out",
  }
}

function numberWordIssues(slot: CopySlot, stripped: string): GroundingIssue[] {
  const list = words(stripped.replace(/-/g, " ")).map((w) => w.lower)
  const issues: GroundingIssue[] = []
  if (/\bdouble features?\b/i.test(stripped)) {
    issues.push({ rule: 2, slot: slot.id, message: `"double feature" outside the archetype token`, hint: `Use ${tok("archetype.name")}` })
  }
  list.forEach((word, i) => {
    if (!NUMBER_WORDS.has(word)) return
    if (word === "one" && (["no", "the"].includes(list[i - 1]) || ["more", "of"].includes(list[i + 1]))) return
    if (word === "double" && /^features?$/.test(list[i + 1] ?? "")) return
    const near = [list[i - 2], list[i - 1], list[i + 1], list[i + 2]]
    if (near.some((n) => n !== undefined && (COUNTED.has(n) || NUMBER_WORDS.has(n)))) {
      issues.push({ rule: 2, slot: slot.id, message: `"${word}" counts something`, hint: "Write the count as a token from the fact sheet" })
    }
  })
  return issues
}

function quantifierIssues(slot: CopySlot, text: string, stripped: string, facts: RewindFactsV3): GroundingIssue[] {
  const share = (id: FactId) => Number(facts[id]!.value)
  const cited = tokenIds(text).filter((id): id is FactId => isFactId(id) && facts[id]?.unit === "share")
  const issues: GroundingIssue[] = []
  for (const q of QUANTIFIERS) {
    if (!q.re.test(stripped)) continue
    const fits = (id: FactId) => share(id) >= q.min && share(id) <= q.max
    if (cited.some(fits)) continue
    const candidates = present(slot, facts).filter((id) => facts[id]!.unit === "share" && fits(id))
    issues.push({
      rule: 3,
      slot: slot.id,
      message: `"${q.phrase}" needs a cited share of ${q.min} to ${q.max}`,
      hint: candidates.length
        ? `Cite the share it means, such as ${candidates.map((id) => `${tok(id)} (${facts[id]!.display})`).join(" or ")}, or drop "${q.phrase}"`
        : `No share in the fact sheet backs "${q.phrase}"; drop it`,
    })
  }
  return issues
}

function nameHint(slot: CopySlot, lower: string, facts: RewindFactsV3): string {
  const ids = present(slot, facts)
  const byDisplay = ids.find((id) => flat(facts[id]!.display).split(/[\s:,]+/).includes(lower))
  const byUnit = MONTHS.has(lower) ? ids.find((id) => facts[id]!.unit === "month") : WEEKDAYS.has(lower) ? ids.find((id) => facts[id]!.unit === "weekday") : undefined
  const id = byDisplay ?? byUnit
  return id ? `Use ${tok(id)}` : "Set names, titles, months and genres as tokens, or rephrase"
}

function properNounIssues(slot: CopySlot, stripped: string, facts: RewindFactsV3): GroundingIssue[] {
  return words(stripped).flatMap((w) => {
    if (w.token || w.text === "I") return []
    const capital = /^\p{Lu}/u.test(w.text)
    if (w.initial ? isCommonWord(w.lower) : !capital) return []
    const message = w.initial ? `"${w.text}" starts a sentence but is not a common word` : `"${w.text}" is capitalised mid-sentence`
    return [{ rule: 4 as const, slot: slot.id, message, hint: nameHint(slot, w.lower, facts) }]
  })
}

function tokenIssues(slot: CopySlot, text: string, stripped: string, ctx: GroundingContext): GroundingIssue[] {
  const issues: GroundingIssue[] = []
  const add = (message: string, hint: string) => issues.push({ rule: 5, slot: slot.id, message, hint })
  const allowed = () => `Use only ${present(slot, ctx.facts).map(tok).join(", ") || "plain words"}`
  if (/\{\{|\}\}/.test(stripped)) add("A token is malformed", "Write tokens exactly as {{fact:<id>}}")
  for (const id of new Set(tokenIds(text))) {
    if (ctx.locals?.[id]) continue
    if (!isFactId(id)) add(`${tok(id)} is not a fact`, allowed())
    else if (!slot.allowedFacts.includes(id)) add(`${tok(id)} is not allowed in ${slot.id}`, allowed())
    else if (!ctx.facts[id]) add(`${tok(id)} is not in this member's facts`, allowed())
    else {
      const pages = factPages(id)
      if (pages.length > 0 && !pages.some((p) => ctx.selected.includes(p))) add(`${tok(id)} is on a page that was left out`, allowed())
    }
  }
  return issues
}

function voiceIssues(slot: CopySlot, stripped: string, ctx: GroundingContext): GroundingIssue[] {
  const lower = stripped.toLowerCase()
  const issues: GroundingIssue[] = []
  const add = (message: string, hint: string) => issues.push({ rule: 6, slot: slot.id, message, hint })
  const phrases = ctx.source === "template" ? BANNED_PHRASES : [...BANNED_PHRASES, ...WINDOW_PHRASES]
  for (const phrase of phrases) {
    if (new RegExp(`\\b${phrase}\\b`).test(lower)) add(`"${phrase}" is a banned phrase`, `Rephrase without "${phrase}"`)
  }
  if (EMOJI.test(stripped)) add("Emoji are not used", "Remove the emoji")
  if (URL_LIKE.test(stripped)) add("Links are not used", "Remove the link")
  if (MARKDOWN.test(stripped)) add("Markdown is not used", "Write plain text")
  if (THIRD_PERSON.test(stripped)) add("Copy speaks to the member, not about them", 'Write in the second person ("you")')
  const name = ctx.facts["member.firstName"]?.display
  if (slot.id !== "signOff" && name && words(stripped).some((w) => w.lower === name.toLowerCase())) {
    add("The member's name appears outside the sign-off", "Leave the name out")
  }
  return issues
}

/**
 * Checks one text slot against rules 1 to 7. The poster line, an id rather
 * than text, is checked by {@link groundArchetype}.
 *
 * @example
 * ```ts
 * groundSlot("deck.clock", "Most of it after dark, and a good share of it in Lumon's hallways.", { facts, selected })
 * // { ok: false, issues: [{ rule: 3, ... "most" }, { rule: 3, ... "a good share" }, { rule: 4, ... "Lumon's" }] }
 * ```
 */
export function groundSlot(slotId: SlotId, text: string, ctx: GroundingContext): GroundingResult {
  const slot = COPY_SLOTS[slotId]
  const stripped = stripTokens(text)
  const length = [...renderCopyText(text, { ...ctx.facts, ...ctx.locals })].length
  const digit = digitIssue(slot, stripped, ctx.facts)
  const issues = [
    ...(digit ? [digit] : []),
    ...numberWordIssues(slot, stripped),
    ...quantifierIssues(slot, text, stripped, ctx.facts),
    ...properNounIssues(slot, stripped, ctx.facts),
    ...tokenIssues(slot, text, stripped, ctx),
    ...voiceIssues(slot, stripped, ctx),
    ...(length > slot.maxChars
      ? [{ rule: 7 as const, slot: slotId, message: `Renders at ${length} characters`, hint: `Shorten it to ${slot.maxChars} characters or fewer` }]
      : []),
  ]
  return issues.length === 0 ? { ok: true } : { ok: false, issues }
}

/**
 * Rule 8: the archetype must be code's pick, or one of the shortlist when
 * code allows the model to choose (`llmMayChoose`, design 7.6), and the
 * poster line must be one of that archetype's five.
 *
 * @example
 * ```ts
 * groundArchetype({ id: "midnight-marathoner", posterLineId: "lo.1" }, selection)
 * // { ok: false, issues: [{ rule: 8, slot: "archetype.posterLineId", ... }] }
 * ```
 */
export function groundArchetype(
  choice: { id: ArchetypeId; posterLineId: string },
  selection: Pick<ArchetypeSelection, "id" | "shortlist" | "llmMayChoose">
): GroundingResult {
  const issues: GroundingIssue[] = []
  const allowed = selection.llmMayChoose ? selection.shortlist.map((s) => s.id) : [selection.id]
  const id = allowed.includes(choice.id) ? choice.id : selection.id
  if (id !== choice.id) {
    issues.push({ rule: 8, slot: "archetype.id", message: `"${choice.id}" is not on the shortlist`, hint: `Use ${allowed.map((a) => `"${a}"`).join(" or ")}` })
  }
  const lines = posterLineIds(id)
  if (!lines.includes(choice.posterLineId)) {
    issues.push({ rule: 8, slot: "archetype.posterLineId", message: `"${choice.posterLineId}" belongs to another archetype`, hint: `Pick one of ${lines.join(", ")}` })
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues }
}
