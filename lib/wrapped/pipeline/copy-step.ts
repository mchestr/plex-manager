/**
 * The copy step (design 8.5, 8.7, 9.2 step 7): who writes each slot.
 *
 * ```
 * pocket or postcard ─────────────────────────────► no copy (templates at render), 0 calls
 * same factsHash, prompt and model as last time ──► reuse that copy, 0 calls
 * copyPolicy 'no-llm' ────────────────────────────► keep slots whose dependency hash held, template the rest
 * copyPolicy 'changed-slots' (the final cut) ─────► keep those slots, write only the rest (below)
 * llmDisabled, mode 'off', no provider, budget ───► templates, 0 calls
 * otherwise: copy call ─► ground each slot ─► one repair call on the budget model
 *            ─► slots that still fail fall back to templates one by one
 * ```
 *
 * A schema failure, refusal, truncation or provider error makes every slot a
 * template (SEC-43); no model failure fails the generation. `economy` mode
 * writes with the budget model. `copyMeta.model` is `"<provider>:<id>"`.
 *
 * ## Kept slots
 *
 * `no-llm` and `changed-slots` keep the slots that {@link planFinalCut}
 * keeps (or, for a stored copy without its issue, whose dependency hash
 * held). A kept text with window words ("so far", "still") can only be a
 * template, because model copy may not use them, so it is templated again
 * for the new window instead of kept. `changed-slots` sends only the other
 * slots to the model, with the same grounding, single repair and per-slot
 * fallback, and keeps the stored archetype and poster line unless their
 * slots changed. Without a stored copy it writes every slot, as `default`.
 * `copyMeta.slotHashes` is rewritten for every slot either way.
 *
 * @module lib/wrapped/pipeline/copy-step
 */

import { budgetModelFor, normalizeModelId, type LLMProviderId } from "@/lib/llm/models"
import type { ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"
import type { ArchetypeSelection } from "@/lib/wrapped/archetypes/select"
import { groundArchetype, groundSlot, type GroundingIssue } from "@/lib/wrapped/copy/grounding"
import { RewindCopyV3, type RewindCopyV3Wire } from "@/lib/wrapped/copy/schema"
import { WINDOW_PHRASES } from "@/lib/wrapped/copy/grounding-words"
import { COPY_SLOTS, slotsForPages, slotDependencyHash, type SlotId } from "@/lib/wrapped/copy/slots"
import { copyLocals } from "@/lib/wrapped/copy/templates"
import type { PageType } from "@/lib/wrapped/data/page-types"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import { buildFactSheet } from "@/lib/wrapped/facts/fact-sheet"

import { copySourceOf, templateDraft, textSlots, toWire, wireText, type CopyDraft, type CopySource, type TextSlotId } from "./copy-draft"
import { callCopy, callRepair, type LlmCall } from "./copy-llm"
import { planFinalCut, type FinalCutPlan, type StoredIssue } from "./final-cut"

export interface PreviousCopy {
  factsHash: string
  promptVersion: string
  model: string | null
  copy: RewindCopyV3Wire
  copySource: CopySource
  slotHashes: Readonly<Record<string, string>>
  /** The stored issue the copy belongs to, for {@link planFinalCut}; absent on older callers. */
  issue?: StoredIssue
}

export type CopyPolicy = "default" | "no-llm" | "changed-slots"

export interface CopyInput {
  userId: string
  year: number
  edition: "full" | "pocket" | "postcard"
  facts: RewindFactsV3
  factsHash: string
  selected: readonly PageType[]
  archetype: ArchetypeSelection | null
  policy: CopyPolicy
  promptVersion: string
  previous: PreviousCopy | null
  llm: {
    /** `Config.llmDisabled`, `rewindLlmMode`, the active provider row, and whether the season budget is spent. */
    disabled: boolean
    mode: string
    provider: { provider: LLMProviderId; model: string } | null
    budgetReached: boolean
    /** A model for this run only (the playground). */
    override?: string
  }
  call: Omit<LlmCall, "provider">
  /**
   * The facts rebuilt for another archetype. A kept copy whose archetype was
   * the model's pick from the shortlist is planned against those facts, which
   * its stored hashes were taken from.
   */
  factsFor?: (archetype: ArchetypeId) => RewindFactsV3
}

export interface CopyTrail {
  path: "none" | "reused" | "no-llm" | "changed-slots" | "template" | "llm"
  reason?: string
  /** `changed-slots`: the slots written again and why (P8.5). */
  plan?: FinalCutPlan
  raw: unknown
  issues: Partial<Record<string, GroundingIssue[]>>
  repaired: string[]
  fallbacks: string[]
  calls: number
  costUsd: number
}

export interface CopyResult {
  copy: RewindCopyV3Wire | null
  source: CopySource
  model: string | null
  slotHashes: Record<string, string>
  trail: CopyTrail
}

const modelKey = (provider: string, model: string) => `${provider}:${normalizeModelId(model)}`

/** Each selected slot's dependency hash over `facts`: what `copyMeta.slotHashes` stores. */
export function slotHashesFor(selected: readonly PageType[], facts: RewindFactsV3): Record<string, string> {
  return Object.fromEntries(slotsForPages(selected).map((s) => [s.id, slotDependencyHash(s, facts)]))
}

const slotHashes = (input: CopyInput) => slotHashesFor(input.selected, input.facts)

/** Runs the copy step; see the module comment. */
export async function runCopyStep(input: CopyInput): Promise<CopyResult> {
  const trail: CopyTrail = { path: "template", raw: null, issues: {}, repaired: [], fallbacks: [], calls: 0, costUsd: 0 }
  const hashes = slotHashes(input)
  if (input.edition !== "full" || !input.archetype) {
    return { copy: null, source: "template", model: null, slotHashes: {}, trail: { ...trail, path: "none" } }
  }
  const { llm, previous } = input
  const planned = llm.provider && (llm.override ?? (llm.mode === "economy" ? budgetModelFor(llm.provider.provider) : null) ?? llm.provider.model)
  const plannedKey = llm.provider && planned ? modelKey(llm.provider.provider, planned) : null

  if (previous?.factsHash === input.factsHash && previous.promptVersion === input.promptVersion && previous.model === plannedKey) {
    return { copy: previous.copy, source: previous.copySource, model: previous.model, slotHashes: hashes, trail: { ...trail, path: "reused" } }
  }

  const slots = textSlots(input.selected)
  const templates = { facts: input.facts, userId: input.userId, locals: copyLocals({ year: input.year }) }
  const draft = templateDraft(slots, input.archetype.id, templates)
  const finish = (path: CopyTrail["path"], model: string | null, reason?: string): CopyResult => {
    const parsed = RewindCopyV3.safeParse(toWire(draft))
    if (!parsed.success) {
      const fallback = templateDraft(slots, input.archetype!.id, templates)
      return { copy: toWire(fallback), source: "template", model: null, slotHashes: hashes, trail: { ...trail, path, reason: "COPY_INVALID" } }
    }
    const source = copySourceOf(draft)
    return { copy: parsed.data, source, model: source === "template" ? null : model, slotHashes: hashes, trail: { ...trail, path, reason } }
  }

  if (input.policy !== "default" && previous) {
    const { plan, keep } = keptSlots(withStoredChoice(input, previous), previous)
    keepSlots(draft, previous, keep, input.archetype)
    if (input.policy === "no-llm") return finish("no-llm", previous.model)
    if (plan) trail.plan = plan
    const write = slots.filter((id) => !keep.has(id))
    const posterLine = !keep.has("archetype.posterLineId")
    if (write.length === 0 && !posterLine) return finish("changed-slots", previous.model)
    return withModel(input, draft, write, posterLine, trail, finish, "changed-slots")
  }
  if (input.policy === "no-llm") return finish("no-llm", null)
  return withModel(input, draft, slots, true, trail, finish, "llm")
}

type Finish = (path: CopyTrail["path"], model: string | null, reason?: string) => CopyResult

/**
 * Writes `slots` (and, with `posterLine`, the archetype choice) with the
 * model: the copy call, grounding, one repair call and per-slot templates.
 * Every other slot keeps what the draft holds.
 */
async function withModel(
  input: CopyInput,
  draft: CopyDraft,
  slots: TextSlotId[],
  posterLine: boolean,
  trail: CopyTrail,
  finish: Finish,
  path: "llm" | "changed-slots"
): Promise<CopyResult> {
  const { llm } = input
  const archetype = input.archetype!
  const planned = llm.provider && (llm.override ?? (llm.mode === "economy" ? budgetModelFor(llm.provider.provider) : null) ?? llm.provider.model)
  const plannedKey = llm.provider && planned ? modelKey(llm.provider.provider, planned) : null
  const kept = path === "changed-slots" ? (input.previous?.model ?? null) : null
  const reason = llm.disabled ? "LLM_DISABLED" : llm.mode === "off" ? "MODE_OFF" : !llm.provider ? "NO_PROVIDER" : llm.budgetReached ? "BUDGET_REACHED" : null
  if (reason || !llm.provider || !plannedKey) return finish(path === "llm" ? "template" : path, kept, reason ?? "NO_PROVIDER")

  const call: LlmCall = { ...input.call, provider: llm.provider.provider }
  const allowed = [...new Set(slots.flatMap((id) => COPY_SLOTS[id].allowedFacts))]
  const promptInput = {
    factSheet: buildFactSheet(input.facts, allowed),
    slots,
    archetype: { id: archetype.id, shortlist: archetype.shortlist.map((s) => s.id), mayChoose: posterLine && archetype.llmMayChoose },
  }
  const override = (model: string | null) => (model && model !== llm.provider!.model ? model : undefined)
  const first = await callCopy(call, promptInput, override(planned))
  trail.calls++
  if (!first.ok) return finish(path, path === "llm" ? plannedKey : kept, first.error.code)
  trail.raw = first.value.output
  trail.costUsd += first.value.cost

  const ground = { facts: input.facts, selected: input.selected }
  const failing = new Map<TextSlotId, GroundingIssue[]>()
  for (const id of slots) {
    const text = wireText(first.value.output, id)
    const result = text === null ? { ok: false as const, issues: [missing(id)] } : groundSlot(id, text, ground)
    if (result.ok) draft.texts.set(id, { text: text!, origin: "llm" })
    else failing.set(id, result.issues)
  }
  if (posterLine) applyArchetype(draft, first.value.output.archetype, archetype, trail)
  failing.forEach((issues, id) => (trail.issues[id] = issues))

  if (failing.size > 0) {
    const repair = await callRepair(call, promptInput, failing, override(budgetModelFor(llm.provider.provider) ?? planned))
    trail.calls++
    if (repair.result.ok) trail.costUsd += repair.result.value.cost
    for (const id of failing.keys()) {
      const text = repair.texts?.get(id)
      if (text !== undefined && groundSlot(id, text, ground).ok) {
        draft.texts.set(id, { text, origin: "repair" })
        trail.repaired.push(id)
      } else trail.fallbacks.push(id)
    }
  }
  return finish(path, plannedKey)
}

function missing(id: TextSlotId): GroundingIssue {
  return { rule: 7, slot: id, message: "The slot was left empty", hint: `Write ${id}` }
}

/** Rule 8: the model's archetype and poster line, or the code's pick and a template line. */
function applyArchetype(draft: CopyDraft, chosen: RewindCopyV3Wire["archetype"], selection: ArchetypeSelection, trail: CopyTrail) {
  const result = groundArchetype(chosen, selection)
  if (result.ok) {
    draft.archetype = { id: chosen.id, posterLineId: chosen.posterLineId, origin: "llm" }
    return
  }
  trail.issues["archetype.posterLineId"] = result.issues
  trail.fallbacks.push("archetype.posterLineId")
}

const WINDOW_WORDS = new RegExp(`\\b(${WINDOW_PHRASES.join("|")})\\b`, "i")

/** The input with the facts of the stored archetype, when that was the model's still-allowed pick. */
function withStoredChoice(input: CopyInput, previous: PreviousCopy): CopyInput {
  const stored = previous.copy.archetype
  if (!input.factsFor || !input.archetype || stored.id === input.archetype.id || !groundArchetype(stored, input.archetype).ok) return input
  return { ...input, facts: input.factsFor(stored.id) }
}

/** The slots a `no-llm` or `changed-slots` run keeps; see the module comment. */
function keptSlots(input: CopyInput, previous: PreviousCopy): { plan: FinalCutPlan | null; keep: Set<SlotId> } {
  const hashes = slotHashes(input)
  if (previous.issue) {
    const plan = planFinalCut(previous.issue, { edition: input.edition, selected: input.selected, facts: input.facts })
    return { plan, keep: new Set(plan.keep) }
  }
  const keep = slotsForPages(input.selected)
    .map((s) => s.id)
    .filter((id) => previous.slotHashes[id] !== undefined && previous.slotHashes[id] === hashes[id])
  return { plan: null, keep: new Set(keep) }
}

/** Puts the kept slots' stored text into the draft; a text with window words is templated again. */
function keepSlots(draft: CopyDraft, previous: PreviousCopy, keep: ReadonlySet<SlotId>, selection: ArchetypeSelection) {
  const origin = previous.copySource === "template" ? "template" : "llm"
  for (const id of draft.texts.keys()) {
    const text = wireText(previous.copy, id)
    if (text !== null && keep.has(id) && !WINDOW_WORDS.test(text)) draft.texts.set(id, { text, origin })
  }
  // The stored archetype, the model's pick from the shortlist included, while code's pick and shortlist allow it.
  const stored = previous.copy.archetype
  if (keep.has("archetype.posterLineId") && groundArchetype(stored, selection).ok) {
    draft.archetype = { id: stored.id, posterLineId: stored.posterLineId, origin }
  }
}
