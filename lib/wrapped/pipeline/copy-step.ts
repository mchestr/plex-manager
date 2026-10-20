/**
 * The copy step (design 8.5, 8.7, 9.2 step 7): who writes each slot.
 *
 * ```
 * pocket or postcard ─────────────────────────────► no copy (templates at render), 0 calls
 * same factsHash, prompt and model as last time ──► reuse that copy, 0 calls
 * copyPolicy 'no-llm' ────────────────────────────► keep slots whose dependency hash held, template the rest
 * llmDisabled, mode 'off', no provider, budget ───► templates, 0 calls
 * otherwise: copy call ─► ground each slot ─► one repair call on the budget model
 *            ─► slots that still fail fall back to templates one by one
 * ```
 *
 * A schema failure, refusal, truncation or provider error makes every slot a
 * template (SEC-43); no model failure fails the generation. `economy` mode
 * writes with the budget model. `copyMeta.model` is `"<provider>:<id>"`.
 *
 * @module lib/wrapped/pipeline/copy-step
 */

import { budgetModelFor, normalizeModelId, type LLMProviderId } from "@/lib/llm/models"
import type { ArchetypeSelection } from "@/lib/wrapped/archetypes/select"
import { groundArchetype, groundSlot, type GroundingIssue } from "@/lib/wrapped/copy/grounding"
import { RewindCopyV3, type RewindCopyV3Wire } from "@/lib/wrapped/copy/schema"
import { COPY_SLOTS, slotsForPages, slotDependencyHash } from "@/lib/wrapped/copy/slots"
import { copyLocals } from "@/lib/wrapped/copy/templates"
import type { PageType } from "@/lib/wrapped/data/page-types"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import { buildFactSheet } from "@/lib/wrapped/facts/fact-sheet"

import { copySourceOf, templateDraft, textSlots, toWire, wireText, type CopyDraft, type CopySource, type TextSlotId } from "./copy-draft"
import { callCopy, callRepair, type LlmCall } from "./copy-llm"

export interface PreviousCopy {
  factsHash: string
  promptVersion: string
  model: string | null
  copy: RewindCopyV3Wire
  copySource: CopySource
  slotHashes: Readonly<Record<string, string>>
}

export interface CopyInput {
  userId: string
  year: number
  edition: "full" | "pocket" | "postcard"
  facts: RewindFactsV3
  factsHash: string
  selected: readonly PageType[]
  archetype: ArchetypeSelection | null
  policy: "default" | "no-llm"
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

const modelKey = (provider: string, model: string) => `${provider}:${normalizeModelId(model)}`

function slotHashes(input: CopyInput): Record<string, string> {
  return Object.fromEntries(slotsForPages(input.selected).map((s) => [s.id, slotDependencyHash(s, input.facts)]))
}

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

  if (input.policy === "no-llm") {
    if (previous) keepUnchangedSlots(draft, previous, hashes, input.archetype)
    return finish("no-llm", previous?.model ?? null)
  }

  const reason = llm.disabled ? "LLM_DISABLED" : llm.mode === "off" ? "MODE_OFF" : !llm.provider ? "NO_PROVIDER" : llm.budgetReached ? "BUDGET_REACHED" : null
  if (reason || !llm.provider || !plannedKey) return finish("template", null, reason ?? "NO_PROVIDER")

  const call: LlmCall = { ...input.call, provider: llm.provider.provider }
  const allowed = [...new Set(slots.flatMap((id) => COPY_SLOTS[id].allowedFacts))]
  const promptInput = {
    factSheet: buildFactSheet(input.facts, allowed),
    slots,
    archetype: { id: input.archetype.id, shortlist: input.archetype.shortlist.map((s) => s.id), mayChoose: input.archetype.llmMayChoose },
  }
  const override = (model: string | null) => (model && model !== llm.provider!.model ? model : undefined)
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
  applyArchetype(draft, first.value.output.archetype, input.archetype, trail)
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

/** `no-llm`: keep each stored slot whose dependency hash is unchanged. */
function keepUnchangedSlots(draft: CopyDraft, previous: PreviousCopy, hashes: Record<string, string>, selection: ArchetypeSelection) {
  const origin = previous.copySource === "template" ? "template" : "llm"
  for (const id of draft.texts.keys()) {
    const text = wireText(previous.copy, id)
    if (text !== null && previous.slotHashes[id] && previous.slotHashes[id] === hashes[id]) draft.texts.set(id, { text, origin })
  }
  const line = "archetype.posterLineId"
  if (previous.slotHashes[line] === hashes[line] && previous.copy.archetype.id === selection.id) {
    draft.archetype = { id: selection.id, posterLineId: previous.copy.archetype.posterLineId, origin }
  }
}
