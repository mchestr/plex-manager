/**
 * The copy step (design 8.5, 8.7, 9.2 step 7): who writes each slot.
 *
 * ```
 * pocket or postcard ─────────────────────────────► no copy (templates at render), 0 calls
 * same factsHash, prompt and model as last time ──► reuse that copy, 0 calls
 * copyPolicy 'no-llm' ────────────────────────────► keep slots whose dependency hash held, template the rest
 * llmDisabled, mode 'off', provider mismatch,
 *   no provider, budget ──────────────────────────► templates, 0 calls
 * otherwise: copy call ─► ground each slot ─► one repair call on the budget model
 *            ─► slots that still fail fall back to templates one by one
 * ```
 *
 * A schema failure, refusal, truncation or provider error makes every slot a
 * template (SEC-43); no model failure fails the generation. `economy` mode
 * writes with the budget model. `copyMeta.model` is `"<provider>:<id>"`.
 *
 * ## The frozen model (P8.1)
 *
 * The provider is `getFrozenRewindModel()`: the freeze lock's model and
 * budget model on the active row's key. When the row names another provider
 * than the lock, every slot is a template (`PROVIDER_MISMATCH`), and the
 * step logs one warning per process rather than one per member.
 *
 * ## Kept slots
 *
 * `no-llm` (a hide or unhide, P7.7) keeps the slots that
 * {@link planKeptSlots} keeps (or, for a stored copy without its issue,
 * whose dependency hash held), and the stored archetype and poster line
 * while their slot holds; every other slot is a template. A kept text with
 * window words ("so far", "still") can only be an older template, because
 * model copy may not use them, so it is templated again instead of kept.
 * `copyMeta.slotHashes` is rewritten for every slot.
 *
 * @module lib/wrapped/pipeline/copy-step
 */

import { budgetModelFor, normalizeModelId, type LLMProviderId } from "@/lib/llm/models"
import { createLogger } from "@/lib/utils/logger"
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
import { planKeptSlots, type StoredIssue } from "./kept-slots"

export interface PreviousCopy {
  factsHash: string
  promptVersion: string
  model: string | null
  copy: RewindCopyV3Wire
  copySource: CopySource
  slotHashes: Readonly<Record<string, string>>
  /** The stored issue the copy belongs to, for {@link planKeptSlots}; absent on older callers. */
  issue?: StoredIssue
}

export type CopyPolicy = "default" | "no-llm"

/** The model the copy step writes with (`getFrozenRewindModel()`). */
export interface CopyProvider {
  provider: LLMProviderId
  model: string
  /** The repair and economy model; undefined picks the provider's own (`budgetModelFor`). */
  budgetModel?: string | null
  /** The active row's stored model, when the lock's differs from it; the call names the lock's as an override. */
  rowModel?: string
}

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
    provider: CopyProvider | null
    /** The active row names another provider than the freeze lock: templates (P8.1). */
    providerMismatch?: boolean
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
  path: "none" | "reused" | "no-llm" | "template" | "llm"
  reason?: string
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

const logger = createLogger("REWIND_COPY")

const modelKey = (provider: string, model: string) => `${provider}:${normalizeModelId(model)}`

const budgetOf = (p: CopyProvider) => (p.budgetModel !== undefined ? p.budgetModel : budgetModelFor(p.provider))

/** The model a run plans to write with: the run's override, the budget model in economy mode, else the provider's. */
function plannedModel(llm: CopyInput["llm"]): string | null {
  if (!llm.provider) return null
  return llm.override ?? (llm.mode === "economy" ? budgetOf(llm.provider) : null) ?? llm.provider.model
}

let mismatchWarned = false

/** One warning per process: every member of a run would log the same mismatch. */
function warnMismatch() {
  if (mismatchWarned) return
  mismatchWarned = true
  logger.warn("The Rewind provider is not the frozen model's provider; Rewind writes template copy until it is (docs/rewind.md, The freeze lock)")
}

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
  const planned = plannedModel(llm)
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

  if (input.policy === "no-llm") {
    if (previous) keepSlots(draft, previous, keptSlots(withStoredChoice(input, previous), previous), input.archetype)
    return finish("no-llm", previous?.model ?? null)
  }
  return withModel(input, draft, slots, trail, finish)
}

type Finish = (path: CopyTrail["path"], model: string | null, reason?: string) => CopyResult

/**
 * Writes `slots` and the archetype choice with the model: the copy call,
 * grounding, one repair call and per-slot templates.
 */
async function withModel(input: CopyInput, draft: CopyDraft, slots: TextSlotId[], trail: CopyTrail, finish: Finish): Promise<CopyResult> {
  const { llm } = input
  const archetype = input.archetype!
  const planned = plannedModel(llm)
  const plannedKey = llm.provider && planned ? modelKey(llm.provider.provider, planned) : null
  const reason = llm.disabled
    ? "LLM_DISABLED"
    : llm.mode === "off"
      ? "MODE_OFF"
      : llm.providerMismatch
        ? "PROVIDER_MISMATCH"
        : !llm.provider
          ? "NO_PROVIDER"
          : llm.budgetReached
            ? "BUDGET_REACHED"
            : null
  if (reason === "PROVIDER_MISMATCH") warnMismatch()
  if (reason || !llm.provider || !plannedKey) return finish("template", null, reason ?? "NO_PROVIDER")

  const call: LlmCall = { ...input.call, provider: llm.provider.provider }
  const allowed = [...new Set(slots.flatMap((id) => COPY_SLOTS[id].allowedFacts))]
  const promptInput = {
    factSheet: buildFactSheet(input.facts, allowed),
    slots,
    archetype: { id: archetype.id, shortlist: archetype.shortlist.map((s) => s.id), mayChoose: archetype.llmMayChoose },
  }
  // The call runs on the active row; any other model, the lock's included, goes as an override.
  const rowModel = llm.provider.rowModel ?? llm.provider.model
  const override = (model: string | null) => (model && model !== rowModel ? model : undefined)
  const first = await callCopy(call, promptInput, override(planned))
  trail.calls++
  if (!first.ok) return finish("llm", plannedKey, first.error.code)
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
  applyArchetype(draft, first.value.output.archetype, archetype, trail)
  failing.forEach((issues, id) => (trail.issues[id] = issues))

  if (failing.size > 0) {
    const repair = await callRepair(call, promptInput, failing, override(budgetOf(llm.provider) ?? planned))
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
  return finish("llm", plannedKey)
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

/** The slots a `no-llm` run keeps; see the module comment. */
function keptSlots(input: CopyInput, previous: PreviousCopy): Set<SlotId> {
  if (previous.issue) return new Set(planKeptSlots(previous.issue, { edition: input.edition, selected: input.selected, facts: input.facts }).keep)
  const hashes = slotHashes(input)
  const keep = slotsForPages(input.selected)
    .map((s) => s.id)
    .filter((id) => previous.slotHashes[id] !== undefined && previous.slotHashes[id] === hashes[id])
  return new Set(keep)
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
