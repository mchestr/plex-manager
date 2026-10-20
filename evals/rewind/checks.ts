/**
 * The deterministic gates on Rewind copy (design 8.6, P5.13). Pure: the eval
 * runner and CI's recordings test share it.
 *
 * ## Per fixture (only runs whose copy step called the model)
 *
 * - **schema**: the first answer parses as `RewindCopyV3Wire`, and the final
 *   copy as `RewindCopyV3` (raw length caps, the poster line's archetype);
 * - **grounding**: every model-written slot of the final copy passes P5.8's
 *   `groundSlot` again, which covers the rendered lengths (rule 7) and the
 *   banned phrases (rule 6).
 *
 * ## Across fixtures
 *
 * - **archetype spread**: no archetype wins more than half of the
 *   non-postcard fixtures;
 * - **overlap**: the word-trigram Jaccard overlap of two fixtures'
 *   model-written decks stays under 0.35, each token read as its fact id,
 *   so two members never get the same sentence with other titles in it.
 *
 * ## Rates
 *
 * Over every slot the model was asked for (text slots and the poster line):
 * first-pass is the share that passed grounding on the first answer, after
 * repair the share that reached the page as model text. A failed first call
 * fails every slot.
 *
 * @module evals/rewind/checks
 */

import { groundSlot } from "@/lib/wrapped/copy/grounding"
import { renderCopyText, TOKEN_RE } from "@/lib/wrapped/copy/render-copy"
import { RewindCopyV3, RewindCopyV3Wire } from "@/lib/wrapped/copy/schema"
import type { PageType } from "@/lib/wrapped/data/page-types"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import type { CopyTrail } from "@/lib/wrapped/pipeline/copy-step"
import { textSlots, wireText, type TextSlotId } from "@/lib/wrapped/pipeline/copy-draft"

/** @internal */
export const MAX_DECK_OVERLAP = 0.35
const POSTER_LINE = "archetype.posterLineId"

type Origin = "llm" | "repair" | "template"

/** What the checks read from one fixture's pipeline run. */
export interface RunTrail {
  edition: "full" | "pocket" | "postcard"
  pages: readonly PageType[]
  archetype: { id: string } | null
  facts: RewindFactsV3
  copy: RewindCopyV3Wire | null
  trail: Pick<CopyTrail, "path" | "reason" | "raw" | "issues" | "repaired" | "fallbacks">
}

export interface FixtureOutcome {
  fixture: string
  edition: RunTrail["edition"]
  archetype: string | null
  /** The copy step called the model. */
  called: boolean
  slots: string[]
  firstPassFailed: string[]
  afterRepairFailed: string[]
  reason: string | null
  /** Each slot's final origin and text, raw and rendered. */
  texts: Array<{ slot: string; origin: Origin; text: string; rendered: string }>
}

interface CheckIssue {
  fixture: string | null
  check: "schema" | "grounding" | "archetype-spread" | "overlap"
  slot?: string
  message: string
}

export interface CheckReport {
  issues: CheckIssue[]
  rates: { firstPass: number | null; afterRepair: number | null }
  archetypes: Record<string, number>
  maxOverlap: { pair: [string, string]; value: number } | null
}

/** One fixture's run, read for the checks. @internal */
export function outcomeOf(fixture: string, run: RunTrail): FixtureOutcome {
  const { trail } = run
  const called = trail.path === "llm"
  const text = textSlots(run.pages)
  const slots: string[] = called ? [...text, POSTER_LINE] : []
  const firstPassFailed = trail.raw === null ? slots : slots.filter((s) => trail.issues[s])
  const afterRepairFailed = trail.reason ? slots : slots.filter((s) => trail.fallbacks.includes(s))
  const origin = (slot: string): Origin =>
    !called || afterRepairFailed.includes(slot) ? "template" : trail.repaired.includes(slot) ? "repair" : "llm"
  const texts = run.copy
    ? text.flatMap((slot: TextSlotId) => {
        const value = wireText(run.copy!, slot)
        return value === null ? [] : [{ slot, origin: origin(slot), text: value, rendered: renderCopyText(value, run.facts) }]
      })
    : []
  return {
    fixture,
    edition: run.edition,
    archetype: run.archetype?.id ?? null,
    called,
    slots,
    firstPassFailed,
    afterRepairFailed,
    reason: trail.reason ?? null,
    texts,
  }
}

/** The per-fixture schema and grounding checks. */
function checkFixture(outcome: FixtureOutcome, run: RunTrail): CheckIssue[] {
  if (!outcome.called) return []
  const issues: CheckIssue[] = []
  const issue = (check: CheckIssue["check"], message: string, slot?: string) => issues.push({ fixture: outcome.fixture, check, message, ...(slot ? { slot } : {}) })
  if (run.trail.raw === null || !RewindCopyV3Wire.safeParse(run.trail.raw).success) {
    issue("schema", `The first answer did not parse as the wire schema${outcome.reason ? ` (${outcome.reason})` : ""}`)
  }
  if (run.copy && !RewindCopyV3.safeParse(run.copy).success) issue("schema", "The final copy did not parse as RewindCopyV3")
  for (const { slot, origin, text } of outcome.texts) {
    if (origin === "template") continue
    const result = groundSlot(slot as TextSlotId, text, { facts: run.facts, selected: run.pages })
    if (!result.ok) result.issues.forEach((i) => issue("grounding", `Rule ${i.rule}: ${i.message}`, slot))
  }
  return issues
}

/** No archetype may win more than half of the non-postcard fixtures. @internal */
export function archetypeSpread(outcomes: readonly FixtureOutcome[]): { counts: Record<string, number>; issues: CheckIssue[] } {
  const scored = outcomes.filter((o) => o.edition !== "postcard")
  const counts: Record<string, number> = {}
  for (const o of scored) if (o.archetype) counts[o.archetype] = (counts[o.archetype] ?? 0) + 1
  const issues = Object.entries(counts)
    .filter(([, n]) => n > scored.length / 2)
    .map(([id, n]): CheckIssue => ({ fixture: null, check: "archetype-spread", message: `${id} wins ${n} of ${scored.length} non-postcard fixtures` }))
  return { counts, issues }
}

/** The word trigrams of a text, each token read as its fact id. @internal */
export function trigrams(text: string): Set<string> {
  const words = text
    .replace(TOKEN_RE, (_m, id: string) => ` ${id.replace(/\W/g, "_")} `)
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter(Boolean)
  const grams = new Set<string>()
  for (let i = 0; i + 2 < words.length; i++) grams.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`)
  return grams
}

/** @internal */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let shared = 0
  for (const gram of a) if (b.has(gram)) shared++
  return shared / (a.size + b.size - shared)
}

/** The largest deck overlap between two fixtures, over model-written decks. @internal */
export function deckOverlap(outcomes: readonly FixtureOutcome[]): { max: CheckReport["maxOverlap"]; issues: CheckIssue[] } {
  const decks = outcomes
    .map((o) => ({ fixture: o.fixture, grams: trigrams(o.texts.filter((t) => t.slot.startsWith("deck.") && t.origin !== "template").map((t) => t.text).join("\n")) }))
    .filter((d) => d.grams.size > 0)
  let max: CheckReport["maxOverlap"] = null
  const issues: CheckIssue[] = []
  for (let i = 0; i < decks.length; i++) {
    for (let j = i + 1; j < decks.length; j++) {
      const value = jaccard(decks[i].grams, decks[j].grams)
      const pair: [string, string] = [decks[i].fixture, decks[j].fixture]
      if (!max || value > max.value) max = { pair, value }
      if (value >= MAX_DECK_OVERLAP) {
        issues.push({ fixture: null, check: "overlap", message: `${pair.join(" and ")} share ${(value * 100).toFixed(0)}% of their deck trigrams` })
      }
    }
  }
  return { max, issues }
}

/** First-pass and after-repair grounding rates; null when no fixture called the model. @internal */
export function groundingRates(outcomes: readonly FixtureOutcome[]): CheckReport["rates"] {
  const total = outcomes.reduce((n, o) => n + o.slots.length, 0)
  if (total === 0) return { firstPass: null, afterRepair: null }
  const first = outcomes.reduce((n, o) => n + o.firstPassFailed.length, 0)
  const after = outcomes.reduce((n, o) => n + o.afterRepairFailed.length, 0)
  return { firstPass: (total - first) / total, afterRepair: (total - after) / total }
}

/** Every gate over a run's fixtures; the run passes when `issues` is empty. */
export function checkRun(runs: ReadonlyArray<{ fixture: string; run: RunTrail }>): CheckReport & { outcomes: FixtureOutcome[] } {
  const outcomes = runs.map(({ fixture, run }) => outcomeOf(fixture, run))
  const spread = archetypeSpread(outcomes)
  const overlap = deckOverlap(outcomes)
  return {
    issues: [...outcomes.flatMap((o, i) => checkFixture(o, runs[i].run)), ...spread.issues, ...overlap.issues],
    rates: groundingRates(outcomes),
    archetypes: spread.counts,
    maxOverlap: overlap.max,
    outcomes,
  }
}
